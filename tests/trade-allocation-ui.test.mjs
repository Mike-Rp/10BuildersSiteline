import assert from "node:assert/strict"
import test from "node:test"
import { activeFixture, currentProject, execute } from "./fixtures.mjs"
import { DISCIPLINES } from "../src/model.ts"

function fixture() {
  let state = activeFixture(),
    p = currentProject(state)
  p.status = "pending"
  p.siteLocation = { region: "Central Visayas", province: "Cebu", city: "Cebu City" }
  p.workflow.activation = undefined
  p.workflow.selections = []
  p.subcontractorAllocationVersion = 1
  for (const c of state.companies) {
    c.operatingLocation = p.siteLocation
    c.activeProjectIds = []
    c.commitmentCount = 0
    c.status = "approved"
    c.capabilityReview = {
      operatingLocation: p.siteLocation,
      disciplines: DISCIPLINES,
      reviewedAt: "2026-10-27",
      unavailable: false,
    }
  }
  return state
}

test("allocation excludes out-of-area companies from manual selection and blocks incomplete local teams", async () => {
  await withUi(async ({ React, root, server, button, click }) => {
    const { default: Panel } = await server.ssrLoadModule("/src/TradeAllocationPanel.tsx")
    const state = fixture(), project = currentProject(state), outside = state.companies[0]
    outside.capabilityReview.operatingLocation = { region: "Metro Manila (NCR)", province: "Metro Manila", city: "Manila" }
    const props = { state, project, actor: state.accounts.find(a => a.id === "a4"), onAction() { throw Error("Unexpected action") }, onNewCompany() {}, onPreview() {}, onActivated() {}, onOpenActive() {} }
    await React.act(() => root.render(React.createElement(Panel, props)))
    assert.match(document.body.textContent, /Outside project operating area/)
    await click(button("Choose companies manually"))
    const labels = [...document.querySelectorAll('[role="dialog"] .trade-checks label')].map(e => e.textContent)
    assert.ok(labels.every(label => !label.includes(outside.name)))
    assert.equal(labels.length, state.companies.length - 1)
    await React.act(() => root.render(React.createElement(Panel, { ...props, key: "missing-location", project: { ...project, siteLocation: undefined } })))
    assert.equal(button("Auto-allocate team").disabled, true)
    assert.equal(button("Choose companies manually").disabled, true)
    assert.match(document.body.textContent, /Complete site location/)
  })
})

test("intake creation includes required structured project site fields", async () => {
  await withUi(async ({ React, root, server }) => {
    const { IntakeForm } = await server.ssrLoadModule("/src/panels.tsx")
    await React.act(() => root.render(React.createElement(IntakeForm, { state: fixture(), onSubmit() {}, onClient: a => a, onClose() {} })))
    for (const text of ["Project region *", "Project province / NCR *", "Project city / municipality *"]) {
      const label = [...document.querySelectorAll("label")].find(el => el.textContent === text)
      assert.ok(label, text)
      assert.equal(document.getElementById(label.htmlFor).required, true)
    }
  })
})
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
test("Site PM capability review supports more than three verified disciplines and requires supporting records", async () => {
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
          role: "spm",
          onSave: async (review) => {
            saved = review
          },
        }),
      ),
    )
    assert.equal(button("Save verified capabilities").disabled, true)
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
    await click(button("Save verified capabilities"))
    assert.equal(saved.disciplines.length, 5)
    assert.deepEqual(saved.documentIds, ["proof"])
    assert.equal(
      saved.reviewedAt,
      "",
      "the server stamps the actual reviewer and time",
    )
  })
})
test("Site PM can open capability editing from the company directory and save through the protected API", async () => {
  await withUi(async ({ React, root, server, w, button, click }) => {
    const { default: Workspace } = await server.ssrLoadModule("/src/RoleWorkspace.tsx")
    const state = fixture(), actor = state.accounts.find(a => a.id === "a4"), company = state.companies[0]
    state.referenceDisciplines = DISCIPLINES
    actor.expiry = "2099-01-01"
    company.capabilityReview = undefined
    company.proposedDisciplines = ["Civil", "Structural"]
    company.documents = [{ id: "proof", name: "Company records.pdf", label: "Company supporting document", uploaded: true, date: "2026-10-27" }]
    let reloads = 0, requests = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options) => {
      requests.push({ url: String(url), options })
      return new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "Content-Type": "application/json" } })
    }
    try {
      await React.act(() => root.render(React.createElement(Workspace, { state, actor, onCommand: async () => ({ ok: true }), onRead() {}, onMute() {}, onReload() { reloads++ }, paused: false, onResume() {}, onPause() {}, idleWarning: false, onStayActive() {} })))
      await click([...document.querySelectorAll(".sidebar button")].find(el => el.textContent.trim() === "Subcon directory"))
      const directoryCard = [...document.querySelectorAll(".company-card")].find(element => element.textContent.includes(company.name))
      assert.match(directoryCard.textContent, /Proposed trades · Review required/)
      assert.match(directoryCard.querySelector(".capability-card-tags").textContent, /Civil/)
      await click([...document.querySelectorAll(".company-card")].find(el => el.textContent.includes(company.name)))
      assert.match(document.querySelector('[role="dialog"]').textContent, /Site PM capability review/)
      assert.ok(button("Preview Company records.pdf"))
      const checks = [...document.querySelectorAll('.trade-allocation input[type="checkbox"]')]
      await click(checks[0]); await click(checks[DISCIPLINES.length])
      const note = document.querySelector(".trade-allocation textarea")
      await React.act(() => { Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, "value").set.call(note, "Site PM reviewed company records."); note.dispatchEvent(new w.Event("input", { bubbles: true })) })
      await click(button("Save verified capabilities"))
      const saved = requests.find(request => request.url.endsWith(`/subcontractors/${company.id}/capabilities`))
      assert.ok(saved)
      assert.equal(saved.options.method, "PUT")
      assert.equal(JSON.parse(saved.options.body).note, "Site PM reviewed company records.")
      assert.equal(reloads, 1)
    } finally { globalThis.fetch = originalFetch }
  })
})
test("Suggest Company exposes grouped proposed trades and submits them without marking them verified", async () => {
  await withUi(async ({ React, root, server, w, button, click }) => {
    const { CompanyForm } = await server.ssrLoadModule("/src/panels.tsx")
    let submitted
    const disciplines = [...DISCIPLINES, "Facade", "Waterproofing", "General Labor", "Renovation", "Fire & Life Safety"]
    await React.act(() => root.render(React.createElement(CompanyForm, { owner: "Site reviewer", actorId: "a4", role: "spm", disciplines, status: "pending", onClose() {}, onSave: company => { submitted = company } })))
    assert.match(document.body.textContent, /Proposed company trades/)
    assert.equal(document.querySelectorAll(".capability-group").length, 4)
    for (const trade of ["Civil", "Electrical", "Waterproofing"]) await click([...document.querySelectorAll(".capability-choice")].find(label => label.textContent === trade).querySelector("input"))
    const field = text => [...document.querySelectorAll("input")].find(input => input.getAttribute("aria-label") === text) || document.getElementById([...document.querySelectorAll("label")].find(label => label.textContent === text)?.htmlFor || "")
    for (const [label, value] of [["Company name *", "Proposed trades company"], ["Company email *", "proposedtrades@gmail.com"], ["Primary foreman full name", "Juan Dela Cruz"], ["Primary foreman mobile number", "09171234567"], ["Operating region *", "0700000000"], ["Operating province / NCR *", "independent:0700000000"], ["Operating city / municipality *", "0730600000"]])
      if (field(label).getAttribute("role") === "combobox") {
        await React.act(() => field(label).focus())
        await React.act(() => document.querySelector(`[role="option"][data-location-code="${value}"]`).click())
      } else await React.act(() => { const element = field(label); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new w.Event("input", { bubbles: true })) })
    await click(button("Submit for Admin approval"))
    assert.deepEqual(submitted.proposedDisciplines, ["Civil", "Electrical", "Waterproofing"])
    assert.equal(submitted.capabilityReview, undefined)
    assert.equal(submitted.status, "pending")
    assert.deepEqual(submitted.foremen, [{ name: "Juan Dela Cruz", phone: "09171234567" }], "a blank backup must not create a second contact")
    await React.act(() => root.render(React.createElement(CompanyForm, { key: "admin", owner: "Admin", role: "admin", disciplines, onClose() {}, onSave() {} })))
    assert.equal(document.querySelector(".company-trade-picker"), null, "Admin must not get the trade editor")
  })
})
test("company profiles display both saved foremen with call links without relabeling legacy contacts", async () => {
  await withUi(async ({ React, root, server }) => {
    const { default: Foremen } = await server.ssrLoadModule("/src/CompanyForemen.tsx")
    const company = { ...fixture().companies[0], foremen: [{ name: "Juan Dela Cruz", phone: "09171234567" }, { name: "Maria Santos", phone: "09181234567" }] }
    await React.act(() => root.render(React.createElement(Foremen, { company })))
    assert.match(document.body.textContent, /Primary foreman/)
    assert.match(document.body.textContent, /Backup foreman/)
    assert.deepEqual([...document.querySelectorAll('a[href^="tel:"]')].map(link => link.getAttribute("href")), ["tel:09171234567", "tel:09181234567"])
    await React.act(() => root.render(React.createElement(Foremen, { company: { ...company, foremen: undefined } })))
    assert.equal(document.querySelector(".company-foremen"), null)
  })
})
test("proposed trades prefill the grouped review and remain unverified until an explicit supported save", async () => {
  await withUi(async ({ React, root, server, w, button }) => {
    const { default: Review } = await server.ssrLoadModule("/src/CompanyCapabilities.tsx")
    const company = { ...fixture().companies[0], capabilityReview: undefined, proposedDisciplines: ["Civil", "Structural"], documents: [{ id: "proof", name: "Company records.pdf", uploaded: true }] }
    let saved
    await React.act(() => root.render(React.createElement(Review, { company, disciplines: DISCIPLINES, role: "spm", onSave: async review => { saved = review } })))
    assert.equal(document.querySelectorAll('.company-trade-picker input:checked').length, 2)
    assert.match(document.body.textContent, /Review required/)
    assert.match(document.body.textContent, /Proposed trades are preselected/)
    assert.equal(button("Save verified capabilities").disabled, true)
    assert.equal(saved, undefined)
    assert.equal(company.capabilityReview, undefined)
  })
})
test("capability review is read-only for Admin, Office PM and clients even when a save callback is provided", async () => {
  await withUi(async ({ React, root, server, button }) => {
    const { default: Review } = await server.ssrLoadModule("/src/CompanyCapabilities.tsx")
    const company = { ...fixture().companies[0], capabilityReview: { disciplines: ["Civil", "Structural"], unavailable: false, documentIds: ["proof"], note: "Previously reviewed supporting records.", reviewedBy: "Site reviewer", reviewedById: "a4", reviewedAt: "2026-10-27T08:00:00Z" }, documents: [{ id: "proof", name: "Company records.pdf", uploaded: true }] }
    let saves = 0
    for (const role of ["admin", "opm", "client"]) {
      await React.act(() => root.render(React.createElement(Review, { company, disciplines: DISCIPLINES, role, onSave: async () => { saves++ } })))
      assert.equal(document.querySelectorAll("input,select,textarea").length, 0)
      assert.equal(button("Save verified capabilities"), undefined)
      assert.match(document.body.textContent, /View only/)
      assert.match(document.body.textContent, /Site reviewer/)
      assert.match(document.body.textContent, /Civil/)
    }
    assert.equal(saves, 0)
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
