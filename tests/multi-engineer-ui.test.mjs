import test from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { createServer } from "vite"

test("phase cards cover all areas and engineer response statuses stay consistent with acceptance and review", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }),
    saved = new Map(),
    originalFetch = globalThis.fetch
  // The first-visit workspace guide is a modal; tests that exercise the app itself treat it as already seen.
  { const getItem = dom.window.Storage.prototype.getItem; dom.window.Storage.prototype.getItem = function (key) { return String(key).startsWith('10buildline:workspace-guide:') ? 'seen' : getItem.call(this, key) } }
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      value,
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
    root = createRoot(document.getElementById("root"))
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    )
  try {
    const { default: Allocation, recommendPhaseEngineers } =
      await server.ssrLoadModule("/src/PhaseEngineerAllocation.tsx")
    const { emptyState } = await server.ssrLoadModule("/src/model.ts"),
      state = emptyState()
    const tags = ["Civil", "Structural", "Mechanical", "Electrical", "Plumbing"]
    state.multiEngineerAllocationAvailable = true
    state.accounts = [
      {
        id: "a",
        name: "Mika",
        role: "spm",
        status: "active",
        hasProfessionalCredentials: true,
        eligibleForNewAssignment: true,
        expiry: "2099-12-31",
        scope: tags.slice(0, 2),
        qualifiedRequirements: tags.slice(0, 2),
        engineerCommitments: [],
        singleProjectCommitment: true,
      },
      {
        id: "b",
        name: "Rafael",
        role: "spm",
        status: "active",
        hasProfessionalCredentials: true,
        eligibleForNewAssignment: true,
        expiry: "2099-12-31",
        scope: tags.slice(2),
        qualifiedRequirements: tags.slice(2),
        engineerCommitments: [],
        singleProjectCommitment: true,
      },
    ]
    const engineers = recommendPhaseEngineers(
      state,
      "Residential",
      "Design",
      tags,
      "project",
    )
    assert.equal(engineers.length, 2)
    const row = {
      phase: "Design",
      accountId: engineers[0].accountId,
      status: "pending",
      engineers,
      requiredDisciplines: tags,
    }
    await act(() =>
      root.render(
        React.createElement(Allocation, {
          state,
          type: "Residential",
          row,
          required: tags,
          projectId: "project",
          team: [row],
          onChange() {},
        }),
      ),
    )
    assert.match(document.body.textContent, /5 of 5 areas covered/)
    assert.equal(
      document.querySelectorAll(".phase-engineer-grid article").length,
      2,
    )
    const { default: Responsibilities } = await server.ssrLoadModule(
      "/src/EngineerResponsibilities.tsx",
    )
    const context = {
      available: true,
      canReview: false,
      lifecycle: "active",
      availabilityLabel: "Reserved — awaiting acceptance",
      rows: [
        {
          id: "1",
          user_id: "a",
          name: "Mika",
          phase: "Design",
          assigned_disciplines: ["Civil", "Structural"],
          status: "pending",
          completion_status: "unfinished",
        },
        {
          id: "2",
          user_id: "b",
          name: "Rix",
          phase: "Design",
          assigned_disciplines: ["Plumbing"],
          status: "confirmed",
          completion_status: "unfinished",
        },
      ],
    }
    const writes = []
    globalThis.fetch = async (_url, init = {}) => {
      if (init.method === "POST") {
        const body = JSON.parse(init.body)
        writes.push(body)
        if (body.action === "accept") {
          context.rows[0].status = "confirmed"
          context.availabilityLabel = "Committed to a project"
        }
        if (body.action === "approve_completion") {
          context.rows[0].completion_status = "approved"
          context.rows[0].complete = true
          context.availabilityLabel = "Available for allocation"
        }
      }
      return Response.json({ data: context })
    }
    // A project that is ready for the engineer to accept: assigned, OPM accepted, six documents, lead confirmed.
    const { DOC_LABELS } = await server.ssrLoadModule("/src/model.ts")
    const readyProject = {
      id: "project",
      status: "active",
      phase: "Design",
      opmAccepted: true,
      team: [{ phase: "Mobilization", accountId: "a", status: "confirmed" }],
      docs: DOC_LABELS.slice(0, 6).map((label) => ({ label, uploaded: true })),
    }
    async function render(actor, key) {
      await act(async () => {
        root.render(
          React.createElement(Responsibilities, {
            key,
            actor,
            project: readyProject,
            onReload() {},
          }),
        )
        await new Promise((resolve) => setTimeout(resolve, 25))
      })
    }
    await render({ id: "a", role: "spm" }, "engineer")
    assert.match(document.body.textContent, /Reserved — awaiting acceptance/)
    assert.match(document.body.textContent, /Mika · Design/)
    assert.doesNotMatch(document.body.textContent, /Rix/, "an engineer's workspace lists only their own responsibilities")
    await act(() => button("Accept responsibility").click())
    assert.equal(writes[0].action, "accept")
    assert.match(document.body.textContent, /Committed to a project/)
    assert.equal(button("Accept responsibility"), undefined)
    assert.equal(button("Approve completion"), undefined, "completion is automatic, so there is no manual completion review")
    context.canReview = true
    context.rows[0].completion_status = "approved"
    context.rows[0].complete = true
    await render({ id: "admin", role: "admin" }, "reviewer")
    assert.match(document.body.textContent, /Rix · Design/, "reviewers still see every engineer in the phase")
    assert.equal(button("Approve completion"), undefined)
    assert.equal(button("Return for correction"), undefined)
    assert.match(document.body.textContent, /Responsibilities completed/)
  } finally {
    await act(() => root.unmount())
    globalThis.fetch = originalFetch
    await server.close()
    dom.window.close()
    for (const [key, value] of saved) {
      if (value) Object.defineProperty(globalThis, key, value)
      else delete globalThis[key]
    }
  }
})
