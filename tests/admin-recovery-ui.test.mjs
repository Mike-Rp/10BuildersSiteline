import test from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
async function withUi(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" }),
    saved = new Map(),
    originalFetch = globalThis.fetch
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
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
    }),
    { createRoot } = await import("react-dom/client"),
    root = createRoot(document.getElementById("root"))
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    )
  const input = (label) =>
    document.querySelector(`input[aria-label="${label}"]`)
  const change = (element, value) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(element, value)
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    })
  const click = (element) =>
    act(async () => {
      assert.ok(element)
      element.click()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  const render = (element) =>
    act(async () => {
      root.render(element)
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
  try {
    await run({ server, root, dom, button, input, change, click, render })
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
}
const status = () => ({
  configured: true,
  generatedAt: "2026-11-07T00:00:00Z",
  refreshRequired: true,
  remaining: 4,
  used: 1,
  codes: Array.from({ length: 5 }, (_, i) => ({
    number: i + 1,
    state: i === 0 ? "used" : "available",
    usedAt: i === 0 ? "2026-11-07T01:42:00Z" : undefined,
  })),
})
test("used codes are grayscale, new secrets are shown once, and replacement clears the persistent reminder", async () =>
  withUi(async ({ server, button, input, change, click, render }) => {
    const { default: Security, AdminRecoveryNotice } =
        await server.ssrLoadModule("/src/AdminAccountSecurity.tsx"),
      client = await server.ssrLoadModule("/src/api/client.ts")
    client.setToken("valid-admin-session")
    let current = status(),
      closed = 0,
      changed = 0
    const writes = [],
      codes = Array.from({ length: 5 }, (_, i) => ({
        number: i + 1,
        code: `DEMO-ONLY-NOT-VALID-0${i + 1}`,
      }))
    globalThis.fetch = async (url, init = {}) => {
      const path = String(url)
      if (init.method === "POST") {
        const body = JSON.parse(init.body)
        writes.push({ path, body })
        if (body.currentPassword === "wrong-password")
          return Response.json({ message: "Current password is incorrect." }, {
            status: 422,
          })
        if (path.endsWith("/change-password"))
          return Response.json({ data: { changed: true } })
        current = {
          ...current,
          refreshRequired: false,
          remaining: 5,
          used: 0,
          codes: current.codes.map((c) => ({
            ...c,
            state: "available",
            usedAt: undefined,
          })),
        }
        return Response.json({ data: { codes } })
      }
      return Response.json({ data: current })
    }
    const screen = (key) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(AdminRecoveryNotice, { onManage() {} }),
        React.createElement(Security, {
          key,
          onClose() {
            closed++
          },
          onPasswordChanged() {
            changed++
          },
        }),
      )
    await render(screen("first"))
    assert.equal(document.querySelectorAll(".recovery-used").length, 1)
    assert.equal(
      document.querySelector(".recovery-used").getAttribute("aria-disabled"),
      "true",
    )
    assert.match(
      document.querySelector(".recovery-used").textContent,
      /Recovery code 1.*Used/,
    )
    assert.ok(button("Manage recovery codes"))
    assert.equal(document.querySelector(".recovery-secret-list"), null)
    await change(input("Current password"), "wrong-password")
    await click(button("Generate new set"))
    assert.match(document.body.textContent, /Current password is incorrect/)
    assert.equal(
      client.getToken(),
      "valid-admin-session",
      "incorrect reauthentication must not discard the valid session",
    )
    await change(input("Current password"), "CurrentPassword@123")
    await click(button("Generate new set"))
    assert.equal(
      document.querySelectorAll(".recovery-secret-list code").length,
      5,
    )
    assert.equal(button("Done").disabled, true)
    assert.equal(document.querySelector(".admin-recovery-notice"), null)
    const close =
      document.querySelector('button[aria-label="Close dialog"]') ||
      document.querySelector(".modal-header .icon-button")
    if (close) {
      await click(close)
      assert.equal(closed, 0)
      assert.match(document.body.textContent, /Save your new recovery codes/)
    }
    await click(document.querySelector(".recovery-saved input"))
    await click(button("Done"))
    assert.equal(closed, 1)
    await render(screen("reopened"))
    assert.equal(document.querySelector(".recovery-secret-list"), null)
    assert.ok(
      !document.body.textContent.includes(codes[0].code),
      "status reload cannot redisplay stored secrets",
    )
    await click(button("Change password"))
    await change(input("Current password"), "CurrentPassword@123")
    await change(input("New password"), "NewPassword@123")
    await change(input("Confirm new password"), "Mismatch@123")
    const before = writes.length
    await click(button("Save new password"))
    assert.equal(writes.length, before)
    assert.match(document.body.textContent, /do not match/)
    await change(input("Confirm new password"), "NewPassword@123")
    await click(button("Save new password"))
    assert.equal(changed, 1)
    assert.ok(writes.at(-1).path.endsWith("/change-password"))
  }))
test("Admin forgot-password uses recovery codes, without routing the sole admin back to themselves", async () =>
  withUi(async ({ server, button, input, change, click, render }) => {
    const { default: Login } = await server.ssrLoadModule("/src/LoginPage.tsx")
    const writes = []
    globalThis.fetch = async (url, init = {}) => {
      const path = String(url)
      if (init.method === "POST") {
        writes.push({ path, body: JSON.parse(init.body) })
        return Response.json({
          data: path.endsWith("/verify")
            ? { resetToken: "a".repeat(64) }
            : { reset: true },
        })
      }
      return Response.json({ data: {} })
    }
    await render(
      React.createElement(Login, {
        portal: "admin",
        onSignIn() {
          throw Error("Recovery must not automatically sign in")
        },
      }),
    )
    const forgot = [...document.querySelectorAll("a")].find(
      (a) => a.textContent === "Forgot password?",
    )
    await click(forgot)
    assert.match(document.body.textContent, /Use one code from your saved/)
    assert.ok(!document.body.textContent.includes("Find my account"))
    await change(input("Recovery administrator email"), "admin@example.test")
    await change(input("Recovery code"), "DEMO-ONLY-NOT-VALID")
    await click(button("Verify recovery code"))
    assert.ok(writes[0].path.endsWith("/auth/admin/recovery/verify"))
    assert.match(
      document.body.textContent,
      /consumed only when the reset succeeds/,
    )
    await change(input("New password"), "RecoveredPassword@123")
    await change(input("Confirm new password"), "RecoveredPassword@123")
    await click(button("Reset password"))
    assert.ok(writes[1].path.endsWith("/auth/admin/recovery/reset"))
    assert.equal(writes[1].body.resetToken, "a".repeat(64))
    assert.match(
      document.body.textContent,
      /Password reset. Sign in with your new password/,
    )
    assert.ok(button("Return to sign in"))
    assert.ok(writes.every((w) => !w.path.includes("password-reset-request")))
  }))
