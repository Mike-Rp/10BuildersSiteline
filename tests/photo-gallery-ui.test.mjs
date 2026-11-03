import assert from "node:assert/strict"
import test from "node:test"

test("photo gallery labels pending and released records accurately and requires reviewer handlers for decisions", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const { renderToStaticMarkup } = await import("react-dom/server")
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { default: Gallery } = await server.ssrLoadModule("/src/SitePhotoGallery.tsx")
    const photo = { id: "photo", name: "Site.jpg", owner: "Site PM", date: "2026-10-25", clientVisible: false, photoReviewStatus: "pending" }
    const render = (photos, reviewer) => new JSDOM(renderToStaticMarkup(React.createElement(Gallery, { photos, ...(reviewer ? { onApprove: async () => {}, onReject: async () => {} } : {}) })))
    for (const reviewer of [false, true]) {
      const dom = render([photo, { ...photo, id: "released", clientVisible: true }], reviewer ? async () => {} : undefined)
      assert.match(dom.window.document.body.textContent, /Internal · awaiting review/)
      assert.match(dom.window.document.body.textContent, /Client-visible/)
      assert.match(dom.window.document.body.textContent, reviewer ? /Preview each Site PM gallery photo/ : /assigned Office PM or an Administrator/)
      assert.equal([...dom.window.document.querySelectorAll("button")].filter(button => button.textContent === "Approve for client").length, 0, "decisions appear only after opening a photo")
      assert.equal(dom.window.document.querySelector("button button"), null, "review actions are not nested inside photo previews")
      dom.window.close()
    }
  } finally { await server.close() }
})
