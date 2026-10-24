import assert from "node:assert/strict"
import test from "node:test"
import * as XLSX from "xlsx"

const COMPANY = "11111111-1111-4111-8111-111111111111"
const book = (rows) => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Manpower")
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }))
}
const HEADER = ["idnumber", "firstname", "middlename", "lastname", "suffix"]
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

test("an Admin previews a manpower file, fixes problems, confirms, and sees the new ID numbers", async () => {
  const { JSDOM } = await import("jsdom")
  const { createServer } = await import("vite")
  const { default: React, act } = await import("react")
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const realFetch = globalThis.fetch
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const { setApiBase } = await server.ssrLoadModule("/src/api/client.ts")
    setApiBase("http://api.test")
    // A pretend server: the company starts with one worker; an import adds two.
    let workers = [{ id: "w1", id_number: "02000-0001", full_name: "Pedro Abad", first_name: "Pedro", middle_name: null, last_name: "Abad", suffix: null, role_title: "Rebar Installer", status: "active" }]
    const posts = []
    let rejectNext = null
    globalThis.fetch = async (url, init = {}) => {
      const path = String(url).replace("http://api.test", "")
      if (path === `/subcontractors/${COMPANY}/workers` && (init.method ?? "GET") === "GET") return json(200, { code: 200, data: workers })
      if (path === `/subcontractors/${COMPANY}/workers/import` && init.method === "POST") {
        const body = JSON.parse(init.body); posts.push(body)
        if (rejectNext) { const r = rejectNext; rejectNext = null; return json(422, { code: 422, message: r.message, error: { code: "IMPORT_REJECTED", message: r.message, rows: r.rows } }) }
        const created = body.workers.filter((w) => !w.id_number).map((w, i) => ({ row: w.row, id_number: "02000-" + String(1001 + i), first_name: w.first_name, middle_name: w.middle_name || null, last_name: w.last_name, suffix: w.suffix || null }))
        workers = [...workers, ...created.map((c) => ({ id: "n" + c.id_number, id_number: c.id_number, full_name: c.first_name + " " + c.last_name, first_name: c.first_name, middle_name: c.middle_name, last_name: c.last_name, suffix: c.suffix, role_title: null, status: "active" }))]
        return json(201, { code: 201, data: { created, updated: 0, unchanged: body.workers.filter((w) => w.id_number).length } })
      }
      return json(404, { message: "not found" })
    }
    const { default: ManpowerImport } = await server.ssrLoadModule("/src/ManpowerImport.tsx")
    let imported = 0
    await act(async () => root.render(React.createElement(ManpowerImport, { companyId: COMPANY, companyName: "Atlas Test Structural Works", onImported: () => imported++ })))
    const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 60)) })
    await flush()
    const text = () => document.body.textContent
    const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label))
    const choose = async (rows, name = "list.xlsx") => {
      const file = new dom.window.File([book(rows)], name)
      const input = document.querySelector('input[type="file"]')
      Object.defineProperty(input, "files", { value: [file], configurable: true })
      await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })) })
      await flush()
    }

    // The existing worker is listed with its ID, and the template button is there.
    assert.match(text(), /1 worker/)
    assert.match(document.querySelector('table[aria-label="Workers"]').textContent, /02000-0001.*Pedro Abad/)
    assert.ok(button("Download template") && button("Upload Excel"))
    assert.equal(button("Confirm import"), undefined, "nothing to confirm before a file is chosen")

    // A wrong file type is refused before anything is read.
    const bad = new dom.window.File(["x"], "notes.pdf")
    const input = document.querySelector('input[type="file"]')
    Object.defineProperty(input, "files", { value: [bad], configurable: true })
    await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })) })
    assert.match(document.querySelector('[role="alert"]').textContent, /XLSX, XLS/)

    // A file with problems: every problem is listed with its row, and Confirm is disabled.
    await choose([HEADER, ["02000-0001", "Pedro", "", "Abad", ""], ["02000-0001", "Dup", "", "Licate", ""], ["", "", "", "Solo", ""], ["", "Ana", "", "Lim", "Esq."]])
    assert.match(text(), /3 problems to fix\. Nothing was imported\./)
    const issues = [...document.querySelectorAll('table[aria-label="Problems in the file"] tbody tr')].map((tr) => tr.children[0].textContent + ":" + tr.children[1].textContent)
    assert.deepEqual(issues.map((s) => s.split(":")[0]), ["3", "4", "5"])
    assert.match(issues[0], /already used on row 2/)
    assert.equal(button("Confirm import").disabled, true)
    assert.equal(posts.length, 0)

    // A clean file: the preview counts, then Confirm sends the rows with their Excel row numbers.
    await choose([HEADER, ["02000-0001", "Pedro", "", "Abad", ""], ["", "Juan", "Reyes", "Santos", "jr"], ["", "Maria", "", "Dela Cruz", ""], [], [], ["", "", "", "", ""]], "atlas.xlsx")
    assert.match(text(), /2 new workers, 1 existing worker, 3 blank rows ignored\./)
    assert.equal(document.querySelector('table[aria-label="Problems in the file"]'), null)
    assert.equal(button("Confirm import").disabled, false)
    await act(async () => { button("Confirm import").click() })
    await flush()
    assert.equal(posts.length, 1)
    assert.deepEqual(posts[0].workers.map((w) => [w.row, w.id_number, w.first_name, w.suffix]), [[2, "02000-0001", "Pedro", ""], [3, "", "Juan", "Jr."], [4, "", "Maria", ""]])

    // The result shows the IDs the system assigned, and the workers list reloaded with them.
    assert.match(text(), /Import complete/)
    assert.match(text(), /2 new, 0 updated, 1 unchanged\./)
    const created = [...document.querySelectorAll('table[aria-label="New workers and their ID numbers"] tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))
    assert.deepEqual(created, [["3", "02000-1001", "Juan Reyes Santos Jr."], ["4", "02000-1002", "Maria Dela Cruz"]])
    assert.match(text(), /3 workers/)
    assert.match(document.querySelector('table[aria-label="Workers"]').textContent, /02000-1002/)
    assert.equal(imported, 1, "the page is told to refresh")

    // Search narrows the list by ID number.
    const search = document.querySelector(".manpower-search")
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(search, "1001")
      search.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    })
    assert.equal(document.querySelectorAll('table[aria-label="Workers"] tbody tr').length, 1)

    // The server can still refuse a file the browser accepted. Nothing is shown as imported.
    await act(async () => { button("Done").click() })
    rejectNext = { message: "The file was not imported. Row 2: 02000-0999 is not one of this company's workers.", rows: [{ row: 2, message: "02000-0999 is not one of this company's workers. Leave id_number blank for a new worker." }] }
    await choose([HEADER, ["02000-0999", "Zed", "", "Po", ""]], "other.xlsx")
    await act(async () => { button("Confirm import").click() })
    await flush()
    assert.match(text(), /The server did not accept the file\. Nothing was saved\./)
    assert.match(document.querySelector('table[aria-label="Problems found by the server"]').textContent, /02000-0999 is not one of this company's workers/)
    assert.equal(document.body.textContent.includes("Import complete"), false)
    assert.equal(imported, 1)
    assert.equal(workers.length, 3)
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = realFetch
    await server.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
})
