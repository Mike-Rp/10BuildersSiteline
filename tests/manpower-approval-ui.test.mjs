import assert from "node:assert/strict"
import test from "node:test"
import * as XLSX from "xlsx"

const COMPANY = "11111111-1111-4111-8111-111111111111"
const SPM = "22222222-2222-4222-8222-222222222222"
const OTHER = "33333333-3333-4333-8333-333333333333"
const HEADER = ["idnumber", "firstname", "middlename", "lastname", "suffix"]
const book = (rows) => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Manpower")
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }))
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

// Mounts a component in jsdom with a pretend server, and cleans everything up afterwards.
async function withScreen(props, handle, run) {
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
    globalThis.fetch = async (url, init = {}) => handle(String(url).replace("http://api.test", ""), init.method ?? "GET", init.body ? JSON.parse(init.body) : undefined)
    const { default: ManpowerImport } = await server.ssrLoadModule("/src/ManpowerImport.tsx")
    await act(async () => root.render(React.createElement(ManpowerImport, props)))
    const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 60)) })
    await flush()
    const ui = {
      act, flush, dom,
      text: () => document.body.textContent,
      button: (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label)),
      click: async (label) => { await act(async () => { ui.button(label).click() }); await flush() },
      choose: async (rows, name = "list.xlsx") => {
        const input = document.querySelector('input[type="file"]')
        Object.defineProperty(input, "files", { value: [new dom.window.File([book(rows)], name)], configurable: true })
        await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })) })
        await flush()
      },
      type: async (selector, value) => {
        const el = document.querySelector(selector)
        const proto = el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
        await act(async () => { Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); el.dispatchEvent(new dom.window.Event("input", { bubbles: true })) })
      },
    }
    await run(ui)
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = realFetch
    await server.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  }
}

test("a Site PM submits a list for approval: nothing is imported, and they can withdraw it", async () => {
  const submissions = []
  const calls = []
  const handle = async (path, method, body) => {
    calls.push(method + " " + path)
    if (path === `/subcontractors/${COMPANY}/workers`) return json(200, { data: [] })
    if (path === `/subcontractors/${COMPANY}/manpower-submissions` && method === "GET") return json(200, { data: submissions })
    if (path === `/subcontractors/${COMPANY}/manpower-submissions` && method === "POST") {
      submissions.unshift({ id: "s1", status: "pending", file_name: body.file_name, new_count: body.workers.length, existing_count: 0, decision_note: null,
        created_at: "2026-10-24T08:00:00Z", decided_at: null, result: null, submitted_by: SPM, submitted_by_name: "Site PM", decided_by_name: null })
      return json(201, { data: { id: "s1", status: "pending", new_count: body.workers.length, existing_count: 0 } })
    }
    if (path === "/manpower-submissions/s1/withdraw" && method === "POST") { submissions[0].status = "withdrawn"; return json(200, { data: { id: "s1", status: "withdrawn" } }) }
    return json(404, { message: "not found" })
  }
  await withScreen({ companyId: COMPANY, companyName: "Atlas", mode: "submit", userId: SPM }, handle, async (ui) => {
    assert.match(ui.text(), /An Admin reviews the list before any worker is added/)
    assert.equal(ui.button("Confirm import"), undefined)
    await ui.choose([HEADER, ["", "Juan", "Reyes", "Santos", "jr"], ["", "Maria", "", "Cruz", ""]], "atlas.xlsx")
    assert.match(ui.text(), /2 new workers, 0 existing workers/)
    assert.match(ui.text(), /get their ID number when an Admin approves the list/)
    await ui.click("Submit for approval")
    assert.ok(calls.includes(`POST /subcontractors/${COMPANY}/manpower-submissions`))
    assert.ok(!calls.some((c) => c.includes("/workers/import")), "a Site PM never imports directly")
    assert.match(ui.text(), /Submitted for approval/)
    assert.match(ui.text(), /No worker is added and no ID number is used until it is approved/)
    // The waiting list is shown with its status, and its owner can withdraw it.
    await ui.click("Done")
    assert.match(document.querySelector(".manpower-pending").textContent, /atlas\.xlsx.*Site PM.*2 new, 0 existing/)
    assert.match(ui.text(), /Waiting for Admin approval/)
    assert.equal(ui.button("Review list"), undefined, "only an Admin can review")
    assert.equal(ui.button("Approve"), undefined)
    await ui.click("Withdraw list")
    assert.equal(document.querySelector(".manpower-pending"), null)
    assert.match(ui.text(), /Earlier lists \(1\)/)
    assert.match(document.querySelector(".manpower-history").textContent, /Withdrawn/)
  })
})

test("another Site PM cannot withdraw someone else's waiting list", async () => {
  const handle = async (path, method) => {
    if (path === `/subcontractors/${COMPANY}/workers`) return json(200, { data: [] })
    if (path === `/subcontractors/${COMPANY}/manpower-submissions` && method === "GET") {
      return json(200, { data: [{ id: "s1", status: "pending", file_name: "atlas.xlsx", new_count: 2, existing_count: 1, decision_note: null,
        created_at: "2026-10-24T08:00:00Z", decided_at: null, result: null, submitted_by: SPM, submitted_by_name: "Site PM", decided_by_name: null }] })
    }
    return json(404, { message: "not found" })
  }
  await withScreen({ companyId: COMPANY, companyName: "Atlas", mode: "submit", userId: OTHER }, handle, async (ui) => {
    assert.match(ui.text(), /Waiting for Admin approval/)
    assert.equal(ui.button("Withdraw list"), undefined)
  })
})

test("an Admin reviews a waiting list, can reject it with a reason, or approve it and see the result", async () => {
  const state = {
    submission: { id: "s1", status: "pending", file_name: "atlas.xlsx", new_count: 2, existing_count: 1, decision_note: null, created_at: "2026-10-24T08:00:00Z",
      decided_at: null, result: null, submitted_by: SPM, submitted_by_name: "Site PM", decided_by_name: null },
  }
  const payload = [
    { row: 2, id_number: "02000-0001", first_name: "Pedro", middle_name: "", last_name: "Abad", suffix: "" },
    { row: 3, id_number: "", first_name: "Juan", middle_name: "Reyes", last_name: "Santos", suffix: "Jr." },
    { row: 4, id_number: "", first_name: "Maria", middle_name: "", last_name: "Cruz", suffix: "" },
  ]
  const calls = []
  let approveOutcome = "fail"
  const handle = async (path, method, body) => {
    calls.push(method + " " + path)
    if (path === `/subcontractors/${COMPANY}/workers`) return json(200, { data: [] })
    if (path === `/subcontractors/${COMPANY}/manpower-submissions`) return json(200, { data: [state.submission] })
    if (path === "/manpower-submissions/s1" && method === "GET") return json(200, { data: { ...state.submission, payload } })
    if (path === "/manpower-submissions/s1/approve") {
      if (approveOutcome === "fail") {
        approveOutcome = "ok"
        const message = "02000-0001 is not one of this company's workers."
        return json(422, { message, error: { code: "IMPORT_REJECTED", message, rows: [{ row: 2, message }] } })
      }
      const result = { created: [{ row: 3, id_number: "02000-0002", first_name: "Juan" }, { row: 4, id_number: "02000-0003", first_name: "Maria" }], updated: 0, unchanged: 1 }
      state.submission = { ...state.submission, status: "approved", result, decided_at: "2026-10-24T09:00:00Z", decided_by_name: "Admin" }
      return json(200, { data: result })
    }
    if (path === "/manpower-submissions/s1/reject") {
      state.submission = { ...state.submission, status: "rejected", decision_note: body.reason, decided_at: "2026-10-24T09:00:00Z" }
      return json(200, { data: { id: "s1", status: "rejected" } })
    }
    return json(404, { message: "not found" })
  }
  await withScreen({ companyId: COMPANY, companyName: "Atlas" }, handle, async (ui) => {
    assert.match(ui.text(), /Waiting for Admin approval/)
    assert.equal(ui.button("Withdraw list"), undefined, "an Admin decides; they do not withdraw")
    assert.equal(document.querySelector('table[aria-label="Workers in the submitted list"]'), null, "the rows load only when reviewing")
    await ui.click("Review list")
    const rows = [...document.querySelectorAll('table[aria-label="Workers in the submitted list"] tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))
    assert.deepEqual(rows, [
      ["2", "02000-0001", "Pedro Abad"],
      ["3", "New. Assigned on approval", "Juan Reyes Santos Jr."],
      ["4", "New. Assigned on approval", "Maria Cruz"],
    ])
    assert.ok(ui.button("Approve and add 2 new workers"))

    // Rejecting needs a reason first.
    await ui.click("Reject…")
    assert.equal(ui.button("Confirm rejection").disabled, true)
    assert.equal(ui.button("Approve"), undefined, "the approve button steps aside while rejecting")
    await ui.type(".manpower-reason textarea", "Names do not match payroll.")
    assert.equal(ui.button("Confirm rejection").disabled, false)
    await ui.click("Close")
    assert.equal(document.querySelector('table[aria-label="Workers in the submitted list"]'), null, "Close folds the review away")
    await ui.click("Review list")

    // The server refuses the first approval (a worker moved meanwhile): nothing changes and the reasons are shown.
    await ui.click("Approve and add 2 new workers")
    assert.match(ui.text(), /can't be approved as it stands\. Nothing was changed\./)
    assert.match(document.querySelector('table[aria-label="Problems with the submitted list"]').textContent, /02000-0001 is not one of this company's workers/)
    assert.equal(state.submission.status, "pending")

    // Approving again works; the list leaves the waiting area and appears in the history with its counts.
    await ui.click("Approve and add 2 new workers")
    assert.equal(document.querySelector(".manpower-pending"), null)
    assert.match(document.querySelector(".manpower-history").textContent, /Approved.*2 new, 0 updated, 1 unchanged/)
  })

  // Rejecting: the reason is sent and shown in the history.
  state.submission.status = "pending"; state.submission.result = null
  await withScreen({ companyId: COMPANY, companyName: "Atlas" }, handle, async (ui) => {
    await ui.click("Review list")
    await ui.click("Reject…")
    await ui.type(".manpower-reason textarea", "Names do not match payroll.")
    await ui.click("Confirm rejection")
    assert.ok(calls.includes("POST /manpower-submissions/s1/reject"))
    assert.match(document.querySelector(".manpower-history").textContent, /Rejected.*Names do not match payroll\./)
    assert.equal(document.querySelector(".manpower-pending"), null)
  })
})
