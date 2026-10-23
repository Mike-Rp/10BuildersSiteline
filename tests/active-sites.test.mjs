import assert from "node:assert/strict"

import test from "node:test"

import { JSDOM } from "jsdom"

import { createServer } from "vite"

import React, { act } from "react"
import { hasPendingSiteReview } from "../src/active-sites-review.ts"

test("Active Sites filters before pagination, resets pages, sorts, and opens only supplied projects", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })

  const previous = new Map()

  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))

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

  const { createRoot } = await import("react-dom/client")

  const root = createRoot(document.getElementById("root"))

  try {
    const { default: ActiveSites } = await server.ssrLoadModule(
      "/src/ActiveSites.tsx",
    )

    const projects = Array.from({ length: 15 }, (_, i) => ({
      id: `authorized-${i}`,
      name: `Building ${String(i + 1).padStart(2, "0")}`,

      type: i % 2 ? "Commercial" : "Residential",
      phase: i % 2 ? "Structure" : "Foundation",

      status: "active",
      progress: i * 5,
      start: "2025-01-01",
      end: `2027-01-${String(i + 1).padStart(2, "0")}`,
    }))

    const opened = []

    await act(() =>
      root.render(
        React.createElement(ActiveSites, {
          projects,
          onOpen: (id) => opened.push(id),
        }),
      ),
    )

    const cards = () => [...document.querySelectorAll(".as-card")]

    const button = (text) =>
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes(text),
      )

    const select = async (index, value) =>
      act(() => {
        const field = document.querySelectorAll(".as-toolbar select")[index]

        field.value = value

        field.dispatchEvent(new dom.window.Event("change", { bubbles: true }))
      })

    assert.equal(cards().length, 9)
    assert.equal(document.querySelector(".as-card img"), null)

    assert.equal(document.querySelector(".as-summary strong").textContent, "15")

    assert.deepEqual(
      [...document.querySelectorAll(".as-toolbar select")[0].options].map(
        (o) => o.value,
      ),
      ["", "Residential", "Commercial", "Mixed-Use"],
    )

    // Type-specific phase menus include the complete workflow, even without matching sites.
    const phaseOptions = () => [...document.querySelectorAll(".as-toolbar select")[1].options].map(o => o.value)
    const commonStart = ["", "Mobilization", "Design", "Foundation"]
    await select(0, "Residential")
    assert.deepEqual(phaseOptions(), [...commonStart, "Structure", "Envelope", "MEP Rough-In", "Finishes", "Landscape & Site Works", "Closeout"])
    await select(1, "Envelope")
    assert.equal(cards().length, 0)
    await select(0, "Commercial")
    assert.deepEqual(phaseOptions(), [...commonStart, "Structure", "Envelope / Curtain Wall", "MEP Rough-In", "Fire & Life Safety", "Fit-Out / Finishes", "Closeout"])
    assert.equal(document.querySelectorAll(".as-toolbar select")[1].value, "")
    assert.equal(cards().length, 7) // Incompatible residential phase was cleared.
    await select(1, "Structure")
    await select(0, "Residential")
    assert.equal(document.querySelectorAll(".as-toolbar select")[1].value, "Structure")
    await select(0, "Mixed-Use")
    assert.deepEqual(phaseOptions(), [...commonStart, "Podium Structure", "Tower Structure", "Envelope / Curtain Wall", "MEP Rough-In", "Fire & Life Safety", "Retail/Commercial Fit-Out", "Residential Fit-Out", "Landscape & Site Works", "Closeout"])
    assert.equal(document.querySelectorAll(".as-toolbar select")[1].value, "")
    await select(1, "Podium Structure")
    await select(0, "")
    assert.deepEqual(phaseOptions(), [...commonStart, "Podium Structure", "Tower Structure", "Envelope / Curtain Wall", "MEP Rough-In", "Fire & Life Safety", "Retail/Commercial Fit-Out", "Residential Fit-Out", "Landscape & Site Works", "Closeout"])
    assert.equal(document.querySelectorAll(".as-toolbar select")[1].value, "Podium Structure")
    await select(0, "Residential")
    await select(1, "Finishes")
    await select(0, "")
    assert.equal(document.querySelectorAll(".as-toolbar select")[1].value, "")
    assert.equal(cards().length, 9)

    await act(() => button("Next").click())

    assert.match(cards()[0].textContent, /Building 10/)
    assert.equal(cards().length, 6)

    await select(0, "Commercial")

    assert.match(
      document.querySelector(".as-pagination").textContent,
      /Page 1 of 1/,
    )

    assert.equal(cards().length, 7)

    assert.ok(
      cards().every(
        (card) => card.querySelector(".as-type").textContent === "Commercial",
      ),
    )

    await select(2, "progress")

    assert.match(cards()[0].textContent, /Building 14/)

    await act(() => cards()[0].querySelector("button").click())

    assert.deepEqual(opened, ["authorized-13"])

    assert.match(
      document.querySelector(".as-recent").textContent,
      /Building 14/,
    )

    await select(1, "Foundation")

    assert.equal(cards().length, 0)

    assert.match(document.body.textContent, /No matching projects/)

    await act(() => button("Clear filters").click())

    const search = document.querySelector('input[type="search"]')

    await act(() => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(search, "Building 09")

      search.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    })

    assert.equal(cards().length, 1)

    assert.match(cards()[0].textContent, /Building 09/)

    await act(() =>
      root.render(
        React.createElement(ActiveSites, {
          key: "empty-account",
          projects: [],
          onOpen: (id) => opened.push(id),
        }),
      ),
    )

    assert.equal(cards().length, 0)

    assert.equal(document.querySelector(".as-recent"), null)

    assert.match(document.body.textContent, /No active sites yet/)

    assert.equal(document.querySelector(".as-summary strong").textContent, "0")
    await act(() => root.render(React.createElement(ActiveSites, {
      key: "missing-records",
      reviewAvailable: true,
      projects: [{ ...projects[0], progress: NaN, start: "", end: undefined, needsReview: true }],
      onOpen: id => opened.push(id),
    })))
    const summaries = [...document.querySelectorAll(".as-summary > div")]
    assert.equal(summaries.find(el => el.textContent.includes("Average recorded progress")).querySelector("strong").textContent, "—")
    assert.equal(summaries.some(el => el.textContent.includes("On schedule")), false)
    assert.equal(summaries.find(el => el.textContent.includes("Requiring attention")).querySelector("strong").textContent, "1")
    assert.match(cards()[0].textContent, /Not recorded/)

    // Exercise review membership through the same pending-workflow projection used by staff.
    const source = projects.map((project, i) => ({
      ...project,
      workflow: i < 6 ? { pendingUpdate: { id: `update-${i}` } }
        : i === 6 ? { pendingRework: { id: "issue-6" } }
        : i === 7 ? { pendingUpdate: { id: "update-7" }, pendingRework: { id: "issue-7" } }
        : undefined,
    }))
    const pendingIntake = { ...source[0], id: "pending-intake", status: "pending" }
    const late = { ...source[14], start: "2020-01-01", end: "2020-12-31", history: [{ issue: true }] }
    source[14] = late
    assert.equal(hasPendingSiteReview(pendingIntake), false)
    assert.equal(hasPendingSiteReview(late), false)
    const workflowActions = []
    const staffProps = () => ({
      key: "staff-reviews", reviewAvailable: true,
      projects: [...source, pendingIntake].map(p => ({ ...p, needsReview: hasPendingSiteReview(p) })),
      onOpen: id => opened.push(id),
      renderActions: id => React.createElement("button", { onClick: () => workflowActions.push(id) }, "Existing review action"),
    })
    const tab = name => [...document.querySelectorAll('[role="tab"]')].find(el => el.textContent.startsWith(name))
    const count = name => tab(name).querySelector("span").textContent
    const firstPage = () => assert.match(document.querySelector(".as-pagination").textContent, /Page 1 of/)
    await act(() => root.render(React.createElement(ActiveSites, staffProps())))
    assert.equal(count("All active projects"), "15")
    assert.equal(count("Awaiting review"), "8") // Both pending objects still count as one project.
    assert.equal(document.querySelectorAll(".as-toolbar select").length, 3)
    assert.ok(![...document.querySelectorAll(".as-toolbar label")].some(el => el.textContent.trim().startsWith("Status")))
    assert.equal(document.querySelector(".as-card .badge"), null)
    await act(() => button("Next").click())
    await act(() => tab("Awaiting review").click())
    firstPage()
    assert.equal(cards().length, 8)
    assert.ok(cards().every(card => card.querySelector(".as-review")))
    await act(() => cards()[0].querySelector(".as-workflow-actions button").click())
    assert.deepEqual(workflowActions, ["authorized-0"])
    await act(() => cards()[0].querySelector(".as-details").click())
    assert.equal(opened.at(-1), "authorized-0")
    assert.match(document.querySelector(".as-pagination").textContent, /Page 1 of 1/)
    await select(0, "Commercial")
    firstPage()
    assert.equal(cards().length, 4)
    assert.equal(count("Awaiting review"), "8") // Counts ignore dropdown narrowing.
    await select(1, "Foundation")
    assert.equal(cards().length, 0)
    assert.match(document.body.textContent, /No matching projects/)
    await act(() => button("Clear filters").click())
    assert.equal(tab("Awaiting review").getAttribute("aria-selected"), "true")
    await act(() => button("Next").click())
    await select(2, "progress")
    firstPage()
    assert.match(cards()[0].textContent, /Building 08/)
    await act(() => button("Next").click())
    firstPage()
    assert.equal(cards().length, 8)
    firstPage()
    await act(() => button("Next").click())
    await act(() => {
      const input = document.querySelector('input[type="search"]')
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "Building 07")
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    })
    firstPage()
    assert.equal(cards().length, 1)
    assert.equal(count("Awaiting review"), "8")
    await act(() => button("Clear filters").click())

    // A refreshed project remains in the review tab until its last pending review is resolved.
    source[7] = { ...source[7], workflow: { pendingRework: { id: "issue-7" } } }
    await act(() => root.render(React.createElement(ActiveSites, staffProps())))
    assert.equal(count("Awaiting review"), "8")
    source[7] = { ...source[7], workflow: { notes: [{ text: "Previously reviewed" }] } }
    await act(() => root.render(React.createElement(ActiveSites, staffProps())))
    assert.equal(count("Awaiting review"), "7")
    assert.ok(!cards().some(card => card.textContent.includes("Building 08")))
    await act(() => tab("All active projects").click())
    firstPage()
    assert.equal(count("All active projects"), "15")
    assert.ok(cards().some(card => card.textContent.includes("Building 08")))
    await act(() => tab("All active projects").dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true})))
    assert.equal(tab("Awaiting review").getAttribute("aria-selected"), "true")
    for (let i = 0; i < source.length; i++) source[i] = { ...source[i], workflow: undefined }
    await act(() => root.render(React.createElement(ActiveSites, staffProps())))
    assert.equal(count("Awaiting review"), "0")
    assert.match(document.body.textContent, /No projects awaiting review/)
    assert.equal(cards().length, 0)

    await act(() => root.render(React.createElement(ActiveSites, {
      key: "legacy-mep", projects: [{ ...projects[0], type: "Commercial", phase: "MEP Rough-in" }], onOpen: () => {},
    })))
    await select(0, "Commercial")
    await select(1, "MEP Rough-In")
    assert.equal(cards().length, 1)
    assert.match(cards()[0].textContent, /MEP Rough-in/)

    // Database phase definitions drive the dropdown when supplied by the workspace.
    await act(() => root.render(React.createElement(ActiveSites, {
      key: "database-phases", projects: [{ ...projects[0], phase: "Database phase" }], onOpen: () => {},
      phaseDefinitionsByType: { Residential: [{ name: "Database phase", disciplines: ["Civil"] }], "Mixed-Use": [{ name: "Shared database phase", disciplines: ["Civil"] }] },
    })))
    assert.deepEqual(phaseOptions(), ["", "Shared database phase"])
    await select(0, "Residential")
    assert.deepEqual(phaseOptions(), ["", "Database phase"])
    await select(1, "Database phase")
    assert.equal(cards().length, 1)

    // Revoked records disappear from Recently Viewed; no review UI without explicit authorization.
    await act(() => root.render(React.createElement(ActiveSites, {
      key: "staff-reviews", projects: [{...projects[2], needsReview: true}], onOpen: () => {},
    })))
    assert.equal(document.querySelector(".as-recent"), null)
    assert.equal(document.querySelectorAll('[role="tab"]').length, 1)
    assert.equal(tab("Awaiting review"), undefined)
    assert.equal(document.querySelector(".as-review"), null)
    assert.equal(cards().length, 1)

  } finally {
    await act(() => root.unmount())

    await server.close()

    dom.window.close()

    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})


