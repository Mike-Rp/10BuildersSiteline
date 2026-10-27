import assert from "node:assert/strict"
import test from "node:test"
import { activeFixture, currentProject, execute } from "./fixtures.mjs"
import { DISCIPLINES } from "../src/model.ts"

function fixture() {
  let state = activeFixture(),
    p = currentProject(state)
  p.status = "pending"
  p.workflow.activation = undefined
  p.workflow.selections = []
  p.subcontractorAllocationVersion = 1
  for (const c of state.companies) {
    c.activeProjectIds = []
    c.commitmentCount = 0
    c.status = "approved"
    c.capabilityReview = {
      disciplines: DISCIPLINES,
      reviewedAt: "2026-10-27",
      unavailable: false,
    }
  }
  return state
}
test("the allocation panel shows auto-allocation beside alternatives and keeps failed responses for retry", async () => {
  await withUi(async ({ React, root, server, w, button, click }) => {
    const { default: Panel } = await server.ssrLoadModule(
      "/src/TradeAllocationPanel.tsx",
    )
    let state = execute(fixture(), "a4", {
      type: "auto_allocate_company",
      allocationRevision: 0,
    })
    const project = currentProject(state),
      id = project.subcontractorAllocation.companyIds[0]
    let resolve,
      calls = []
    const render = () =>
      root.render(
        React.createElement(Panel, {
          state,
          project,
          actor: state.accounts.find((a) => a.id === "a4"),
          onAction: (command) => {
            calls.push(command)
            return new Promise((done) => {
              resolve = done
            })
          },
          onNewCompany() {},
          onPreview() {},
          onActivated() {},
          onOpenActive() {},
        }),
      )
    await React.act(render)
    const card = document.querySelector(".trade-company-grid article")
    assert.ok(button("Review alternatives", card))
    assert.ok(button("Auto-allocate", card))
    assert.equal(
      button("Review alternatives", card).parentElement,
      button("Auto-allocate", card).parentElement,
    )
    await click(button("Record contact", card))
    const note = document.querySelector("textarea")
    await React.act(() => {
      Object.getOwnPropertyDescriptor(
        w.HTMLTextAreaElement.prototype,
        "value",
      ).set.call(note, "Called the company representative today.")
      note.dispatchEvent(new w.Event("input", { bubbles: true }))
    })
    const submit = button("Confirm record")
    await React.act(() => {
      submit.click()
      submit.click()
    })
    assert.equal(calls.length, 1)
    assert.equal(submit.disabled, true)
    assert.equal(calls[0].companyId, id)
    assert.equal(calls[0].allocationRevision, 1)
    assert.equal(calls[0].type, "contact_company")
    assert.equal(calls[0].accepted, undefined)
    await React.act(async () => resolve(false))
    assert.equal(note.value, "Called the company representative today.")
    assert.equal(submit.disabled, false)
    assert.match(
      document.querySelector('[role="dialog"]').textContent,
      /not saved/,
    )
  })
})
test("accepted scope has no replacement actions; other Site PMs and Office PMs see a read-only allocation", async () => {
  await withUi(async ({ React, root, server, button }) => {
    const { default: Panel } = await server.ssrLoadModule(
      "/src/TradeAllocationPanel.tsx",
    )
    let state = execute(fixture(), "a4", {
      type: "auto_allocate_company",
      allocationRevision: 0,
    })
    const project = currentProject(state),
      id = project.subcontractorAllocation.companyIds[0]
    project.workflow.selections.find((s) => s.companyId === id).status =
      "accepted"
    const props = {
      state,
      project,
      onAction() {
        throw new Error("Read-only actions must not execute")
      },
      onNewCompany() {},
      onPreview() {},
      onActivated() {},
      onOpenActive() {},
    }
    await React.act(() =>
      root.render(
        React.createElement(Panel, {
          ...props,
          actor: state.accounts.find((a) => a.id === "a4"),
        }),
      ),
    )
    const card = document.querySelector(".trade-company-grid article")
    assert.equal(button("Auto-allocate", card), undefined)
    assert.equal(button("Review alternatives", card), undefined)
    assert.match(card.textContent, /Accepted scope is locked/)
    for (const actor of [
      state.accounts.find((a) => a.id === "a5"),
      state.accounts.find((a) => a.id === "a2"),
    ]) {
      await React.act(() =>
        root.render(React.createElement(Panel, { ...props, actor })),
      )
      assert.equal(document.querySelectorAll("button").length, 0)
      assert.match(
        document.body.textContent,
        /coverage by phase and discipline/,
      )
    }
  })
})
test("admin capability review supports more than three verified disciplines and requires supporting records", async () => {
  await withUi(async ({ React, root, server, w, button, click }) => {
    const { default: Review } = await server.ssrLoadModule(
      "/src/CompanyCapabilities.tsx",
    )
    const company = {
      ...fixture().companies[0],
      capabilityReview: undefined,
      documents: [{ id: "proof", name: "Company records.pdf", uploaded: true }],
    }
    let saved
    await React.act(() =>
      root.render(
        React.createElement(Review, {
          company,
          disciplines: DISCIPLINES,
          onSave: async (review) => {
            saved = review
          },
        }),
      ),
    )
    assert.equal(button("Save capability review").disabled, true)
    const checks = [...document.querySelectorAll('input[type="checkbox"]')]
    for (const checkbox of checks.slice(0, 5)) await click(checkbox)
    await click(checks[DISCIPLINES.length])
    const note = document.querySelector("textarea")
    await React.act(() => {
      Object.getOwnPropertyDescriptor(
        w.HTMLTextAreaElement.prototype,
        "value",
      ).set.call(note, "Reviewed classification and capability records.")
      note.dispatchEvent(new w.Event("input", { bubbles: true }))
    })
    await click(button("Save capability review"))
    assert.equal(saved.disciplines.length, 5)
    assert.deepEqual(saved.documentIds, ["proof"])
    assert.equal(
      saved.reviewedAt,
      "",
      "the server stamps the actual reviewer and time",
    )
  })
})
async function withUi(run) {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([
    import("jsdom"),
    import("vite"),
    import("react"),
  ])
  const dom = new JSDOM('<div id="root"></div>', {
      url: "http://localhost",
      pretendToBeVisual: true,
    }),
    w = dom.window,
    previous = new Map()
  for (const [key, value] of Object.entries({
    window: w,
    document: w.document,
    HTMLElement: w.HTMLElement,
    Element: w.Element,
    navigator: w.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: w.requestAnimationFrame.bind(w),
    cancelAnimationFrame: w.cancelAnimationFrame.bind(w),
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    })
  }
  w.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  w.HTMLElement.prototype.scrollTo = () => {}
  w.HTMLElement.prototype.scrollIntoView = () => {}
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  const { createRoot } = await import("react-dom/client"),
    root = createRoot(document.getElementById("root"))
  const button = (text, scope = document) =>
    [...scope.querySelectorAll("button")].find(
      (el) => el.textContent.trim() === text,
    )
  const click = (el) => {
    assert.ok(el)
    return React.act(async () => el.click())
  }
  try {
    await run({ React, root, server, w, button, click })
  } finally {
    await React.act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous)
      descriptor
        ? Object.defineProperty(globalThis, key, descriptor)
        : delete globalThis[key]
  }
}
