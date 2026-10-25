import assert from "node:assert/strict"
import test from "node:test"

test("photo gallery labels internal and released records accurately and exposes release only with a reviewer handler", async () => {
  const [{ JSDOM }, { createServer }, React] = await Promise.all([import("jsdom"), import("vite"), import("react")])
  const { renderToStaticMarkup } = await import("react-dom/server")
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { default: Gallery } = await server.ssrLoadModule("/src/SitePhotoGallery.tsx")
    const photo = { id: "photo", name: "Site.jpg", owner: "Site PM", date: "2026-10-25", clientVisible: false }
    const render = (photos, onRelease) => new JSDOM(renderToStaticMarkup(React.createElement(Gallery, { photos, onPreview() {}, onRelease })))
    for (const reviewer of [false, true]) {
      const dom = render([photo, { ...photo, id: "released", clientVisible: true }], reviewer ? async () => {} : undefined)
      assert.match(dom.window.document.body.textContent, /Internal · not released/)
      assert.match(dom.window.document.body.textContent, /Client-visible/)
      assert.match(dom.window.document.body.textContent, /assigned Office PM or an Administrator/)
      assert.equal([...dom.window.document.querySelectorAll("button")].filter(button => button.textContent === "Release to client").length, reviewer ? 1 : 0)
      assert.equal(dom.window.document.querySelector("button button"), null, "release actions are separate from photo previews")
      dom.window.close()
    }
  } finally { await server.close() }
})
