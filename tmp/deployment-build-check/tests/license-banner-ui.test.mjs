import assert from "node:assert/strict"
import test from "node:test"

test("engineer license notices direct updates to an admin without exposing upload controls", async () => {
  const { createServer } = await import("vite")
  const { default: React } = await import("react")
  const { renderToStaticMarkup } = await import("react-dom/server")
  const { JSDOM } = await import("jsdom")
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { LicenseBanner } = await server.ssrLoadModule("/src/LicenseWorkflow.tsx")
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 7)
    const day = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}-${String(expiry.getDate()).padStart(2, "0")}`
    for (const state of [
      { status: "expiring_soon", base: "expiring_soon", restricted: false },
      { status: "expired", base: "expired", restricted: true, graceDaysLeft: 7 },
      { status: "expired", base: "expired", restricted: true, graceEnded: true },
      { status: "renewal_under_review", base: "expired", restricted: true },
      { status: "expired", base: "expired", restricted: true, renewal: { status: "rejected", reviewNote: "Photo is unreadable" } },
    ]) {
      const dom = new JSDOM(renderToStaticMarkup(React.createElement(LicenseBanner, { license: { expiry: day, ...state } })))
      const document = dom.window.document
      assert.match(document.body.textContent, /Visit your Administrator with your renewed license/)
      assert.match(document.body.textContent, /Only an Administrator can upload or update it/)
      assert.equal(document.querySelectorAll('button, input[type="file"], form').length, 0)
      assert.doesNotMatch(document.body.textContent, /license you uploaded|Upload renewed license/)
      if (state.renewal) assert.match(document.body.textContent, /Photo is unreadable/)
      dom.window.close()
    }
  } finally {
    await server.close()
  }
})
