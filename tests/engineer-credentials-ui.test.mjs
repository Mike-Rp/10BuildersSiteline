import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
test("credential profile separates account access, verification, expiry and review controls", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" })
  const keys = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "IS_REACT_ACT_ENVIRONMENT",
  ]
  const previous = new Map(
    keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  )
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    })
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  const root = createRoot(document.getElementById("root"))
  const originalFetch = globalThis.fetch
  const summary = {
    accountStatus: "active",
    eligibleForNewAssignment: false,
    eligibilityNote:
      "No verified credential outside the existing 30-day assignment restriction.",
    qualifiedRequirements: [],
    specializations: [],
    credentials: [
      {
        id: "legacy",
        profession: "Civil Engineer",
        license_number: "0001234",
        license_expiry: "2020-01-01",
        expiryStatus: "Expired",
        verification_status: "verified",
        needsReview: false,
        eligible: false,
        verified_by_name: "Sample Admin",
        verified_at: "2019-01-01T10:00:00Z",
        verification_note: "Matched official records.",
      },
    ],
    submissions: [
      {
        id: 2, profession: "Civil Engineer", license_number: "0001000", license_expiry: "2030-01-01",
        status: "rejected", submitted_at: "2026-01-01T10:00:00Z",
        review_note: "Replaced by a credential saved directly by an Administrator.",
      },
      {
        id: 1,
        profession: "Civil Engineer",
        license_number: "0001234",
        license_expiry: "2030-01-01",
        status: "under_review",
        submitted_at: "2026-01-01T10:00:00Z",
      },
    ],
  }
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: summary }), {
      headers: { "Content-Type": "application/json" },
    })
  try {
    const { default: Panel } = await server.ssrLoadModule(
      "/src/EngineerCredentials.tsx",
    )
    await act(async () => {
      root.render(
        React.createElement(Panel, { userId: "engineer", admin: true }),
      )
      await new Promise((r) => setTimeout(r, 30))
    })
    assert.match(document.body.textContent, /Account: active/)
    assert.match(document.body.textContent, /Not eligible for new assignments/)
    assert.match(document.body.textContent, /Expired/)
    assert.match(document.body.textContent, /Pending verification/)
    assert.match(document.body.textContent, /0001234/)
    assert.ok([...document.querySelectorAll("button")].some(b => b.textContent === "Save credential"))
    assert.equal([...document.querySelectorAll("button")].some(b => b.textContent === "Send for verification"), false)
    assert.match(document.body.textContent, /Saving records the credential as verified/)
    assert.match(document.body.textContent, /Replaced by Admin update/)
    const review = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Review submission",
    )
    assert.ok(review)
    await act(() => review.click())
    assert.equal(
      document.querySelector('a[href="https://verification.prc.gov.ph/"]')
        .target,
      "_blank",
    )
    assert.ok(document.querySelector("textarea[required]"))
    assert.match(
      document.body.textContent,
      /identity and review time are recorded automatically/,
    )
    await act(async () => {
      root.render(
        React.createElement(Panel, {
          key: "owner",
          userId: "engineer",
          admin: false,
        }),
      )
      await new Promise((r) => setTimeout(r, 30))
    })
    assert.equal(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Review submission",
      ),
      false,
    )
    assert.ok(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Send for verification",
      ),
    )
    await act(async () => {
      root.render(React.createElement(Panel, { key: "directory", userId: "engineer", admin: true, readOnly: true }))
      await new Promise(r => setTimeout(r, 30))
    })
    assert.match(document.body.textContent, /0001234/)
    assert.match(document.body.textContent, /Pending verification/)
    assert.equal(document.querySelectorAll("form,input,select,textarea").length, 0)
    assert.ok([...document.querySelectorAll("button")].some(b => b.textContent === "View submitted document"))
    assert.equal([...document.querySelectorAll("button")].some(b => /Save|Review submission|Verify credential|Request correction/.test(b.textContent)), false)
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    globalThis.fetch = originalFetch
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
  }
})
