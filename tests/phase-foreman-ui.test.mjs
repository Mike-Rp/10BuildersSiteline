import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

const fixture = () => ({
  revision: 0,
  canEdit: true,
  completed: [],
  assignments: [],
  requests: [],
  history: [],
  phases: [
    { name: "Mobilization", disciplines: ["Civil"] },
    { name: "Foundation", disciplines: ["Civil", "Structural"] },
    { name: "Structure", disciplines: ["Structural"] },
  ],
  companies: [
    {
      id: "A",
      name: "Company A",
      status: "approved",
      reviewed: true,
      unavailable: false,
      disciplines: ["Civil", "Structural"],
      commitments: 0,
      contactPhone: "09987654321",
      foremen: [
        { id: "mika", name: "Mika", phone: "09987654321" },
        { id: "yak", name: "Yak", phone: "09123456789" },
      ],
    },
    {
      id: "B",
      name: "Company B",
      status: "approved",
      reviewed: true,
      unavailable: false,
      disciplines: ["Civil", "Structural"],
      commitments: 1,
      contactPhone: "09111111111",
      foremen: [{ id: "carlos", name: "Carlos", phone: "09111111111" }],
    },
  ],
})
async function withUi(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }),
    saved = new Map()
  for (const [k, v] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k))
    Object.defineProperty(globalThis, k, {
      value: v,
      configurable: true,
      writable: true,
    })
  }
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  const { createRoot } = await import("react-dom/client"),
    root = createRoot(document.getElementById("root")),
    originalFetch = globalThis.fetch
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    )
  const click = (el) => {
    assert.ok(el)
    return act(async () => el.click())
  }
  const change = (el, value) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        el.tagName === "SELECT"
          ? dom.window.HTMLSelectElement.prototype
          : dom.window.HTMLTextAreaElement.prototype,
        "value",
      ).set.call(el, value)
      el.dispatchEvent(
        new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      )
    })
  const render = async (props = {}) => {
    const { default: Panel } = await server.ssrLoadModule(
      "/src/PhaseAllocationPanel.tsx",
    )
    await act(async () => {
      root.render(
        React.createElement(Panel, { projectId: "project", ...props }),
      )
      await new Promise((r) => setTimeout(r, 20))
    })
  }
  try {
    await run({ render, button, click, change, server, root })
  } finally {
    await act(() => root.unmount())
    globalThis.fetch = originalFetch
    await server.close()
    dom.window.close()
    for (const [k, v] of saved) {
      if (v) Object.defineProperty(globalThis, k, v)
      else delete globalThis[k]
    }
  }
}

test("system suggests company only; Lead SPM manually assigns every phase and records external acceptance", async () =>
  withUi(async ({ render, button, click, change }) => {
    const data = fixture(),
      writes = []
    globalThis.fetch = async (url, init = {}) => {
      if (init.method === "POST") {
        const body = JSON.parse(init.body)
        writes.push(body)
        if (body.action === "submit")
          data.requests = [
            {
              id: 1,
              status: "approved",
              reason: body.note,
              proposal: body.assignments,
              requested_by_name: "Lead SPM",
              responses: {},
            },
          ]
        if (body.action === "contact")
          data.requests[0].responses.A = {
            status: "contacted",
            note: body.note,
          }
        if (body.action === "accept")
          data.requests[0].responses.A = { status: "accepted", note: body.note }
        if (body.action === "confirm") {
          data.requests[0].status = "applied"
          data.assignments = data.requests[0].proposal
          data.revision++
        }
        return Response.json({ data: { ok: true } })
      }
      return Response.json({ data })
    }
    await render()
    await click(button("Prepare allocation"))
    await click(button("Suggest company"))
    const phaseRows = [...document.querySelectorAll(".phase-assignment-row")]
    assert.equal(phaseRows.length, 3)
    assert.ok(
      phaseRows.every((r) => r.querySelectorAll("select")[0].value === "A"),
    )
    assert.deepEqual(
      phaseRows.map((r) => r.querySelectorAll("select")[1].value),
      ["mika", "yak", "mika"],
      "the company's two foremen alternate per phase automatically",
    )
    assert.equal(button("Submit allocation proposal").disabled, true, "a reason is still required")
    for (const [i, row] of phaseRows.entries())
      await change(row.querySelectorAll("select")[1], i < 2 ? "mika" : "yak")
    await change(
      document.querySelector("textarea"),
      "Primary company confirmed capable of all project trades.",
    )
    await click(button("Submit allocation proposal"))
    assert.deepEqual(
      writes[0].assignments.map((r) => [r.phase, r.foremanId]),
      [
        ["Mobilization", "mika"],
        ["Foundation", "mika"],
        ["Structure", "yak"],
      ],
    )
    assert.equal(new Set(writes[0].assignments.map((r) => r.phase)).size, 3)
    await change(
      document.querySelector("textarea"),
      "Called company representative.",
    )
    await click(button("Record contact"))
    assert.equal(writes[1].method, "phone")
    await change(
      document.querySelector("textarea"),
      "Company and foremen confirmed the exact scope.",
    )
    assert.equal(button("Record acceptance").disabled, true)
    await click(document.querySelector("input[type=checkbox]"))
    await click(button("Record acceptance"))
    await change(
      document.querySelector("textarea"),
      "Confirm agreed phase ownership.",
    )
    await click(button("Confirm phase allocation"))
    assert.ok(document.querySelector(".phase-foremen"))
    assert.match(document.body.textContent, /Mika/)
    assert.match(document.body.textContent, /Yak/)
  }))

test("Admin reviews immutable proposal without receiving SPM assignment controls", async () =>
  withUi(async ({ render, button, click, change }) => {
    const data = fixture()
    data.canEdit = false
    data.requests = [
      {
        id: 7,
        status: "pending_admin",
        reason: "Add Company B for the remaining scope.",
        proposal: data.phases.map((p) => ({
          phase: p.name,
          companyId: "B",
          foremanId: "carlos",
        })),
        responses: {},
        requested_by_name: "Lead SPM",
      },
    ]
    const writes = []
    globalThis.fetch = async (url, init = {}) => {
      if (init.method === "POST") {
        writes.push(JSON.parse(init.body))
        data.requests[0].status = "approved"
      }
      return Response.json({ data })
    }
    await render({ admin: true })
    assert.equal(button("Prepare allocation"), undefined)
    assert.equal(button("Suggest company"), undefined)
    assert.equal(document.querySelector(".phase-assignment-row"), null)
    await change(
      document.querySelector("textarea"),
      "Approved additional support for this exact phase scope.",
    )
    await click(button("Approve company allocation"))
    assert.equal(writes[0].action, "approve")
    assert.equal(writes[0].requestId, 7)
    assert.equal(writes[0].assignments, undefined)
  }))

test("failed saves retain manual assignments and completed phases are not editable", async () =>
  withUi(async ({ render, button, click, change }) => {
    const data = fixture()
    data.completed = ["Mobilization"]
    data.assignments = [
      {
        phase: "Mobilization",
        companyId: "A",
        foremanId: "mika",
        foremanName: "Mika",
        foremanPhone: "09987654321",
      },
    ]
    globalThis.fetch = async (url, init = {}) =>
      init.method === "POST"
        ? Response.json({ message: "Company capacity changed." }, {
            status: 409,
          })
        : Response.json({ data })
    await render()
    await click(button("Edit phase assignments"))
    await click(button("Suggest company"))
    const rows = [...document.querySelectorAll(".phase-assignment-row")]
    assert.equal(rows.length, 2)
    assert.ok(rows.every((r) => !r.textContent.includes("Mobilization")))
    for (const row of rows)
      await change(row.querySelectorAll("select")[1], "yak")
    await change(
      document.querySelector("textarea"),
      "Keep this draft if capacity changed.",
    )
    await click(button("Submit allocation proposal"))
    assert.match(
      document.querySelector("[role=alert]").textContent,
      /capacity changed/,
    )
    assert.equal(
      document.querySelector("textarea").value,
      "Keep this draft if capacity changed.",
    )
    assert.ok(
      [...document.querySelectorAll(".phase-assignment-row")].every(
        (r) => r.querySelectorAll("select")[1].value === "yak",
      ),
    )
  }))
