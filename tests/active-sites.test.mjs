import assert from "node:assert/strict"

import test from "node:test"

import { JSDOM } from "jsdom"

import { createServer } from "vite"

import React, { act } from "react"

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

    assert.equal(cards().length, 6)
    assert.equal(document.querySelector(".as-card img"), null)

    assert.equal(document.querySelector(".as-summary strong").textContent, "15")

    assert.deepEqual(
      [...document.querySelectorAll(".as-toolbar select")[0].options].map(
        (o) => o.value,
      ),
      ["", "Residential", "Commercial", "Mixed-Use"],
    )

    await act(() => button("Next").click())

    assert.match(cards()[0].textContent, /Building 07/)

    await select(0, "Commercial")

    assert.match(
      document.querySelector(".as-pagination").textContent,
      /Page 1 of 2/,
    )

    assert.equal(cards().length, 6)

    assert.ok(
      cards().every(
        (card) => card.querySelector(".as-type").textContent === "Commercial",
      ),
    )

    await act(() => button("Next").click())

    assert.equal(cards().length, 1)

    await select(3, "progress")

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
      projects: [{ ...projects[0], progress: NaN, start: "", end: undefined, needsReview: true }],
      onOpen: id => opened.push(id),
    })))
    const summaries = [...document.querySelectorAll(".as-summary > div")]
    assert.equal(summaries.find(el => el.textContent.includes("Average recorded progress")).querySelector("strong").textContent, "—")
    assert.equal(summaries.some(el => el.textContent.includes("On schedule")), false)
    assert.equal(summaries.find(el => el.textContent.includes("Requiring attention")).querySelector("strong").textContent, "1")
    assert.match(cards()[0].textContent, /Not recorded/)
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
