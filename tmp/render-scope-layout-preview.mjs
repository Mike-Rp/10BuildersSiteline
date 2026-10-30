import React from "react"
import { renderToString } from "react-dom/server"
import { createServer } from "vite"
import { readdir, writeFile } from "node:fs/promises"
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { default: Review } = await server.ssrLoadModule("/src/ProjectScopeReview.tsx")
  const { Modal } = await server.ssrLoadModule("/src/ui.tsx")
  const css = (await readdir("dist/assets")).find(name => /^index-.*\.css$/.test(name))
  const value = { version: 1, uses: ["residential", "retail"], features: { podium: false, tower: true, curtainWall: false, landscaping: true }, basis: "Example mixed-use building without a podium or curtain wall. General enclosure and site works remain included.", confirmed: false }
  const preview = React.createElement(Modal, { title: "Mixed-Use project scope", subtitle: "Layout preview · Example data", wide: true, onClose() {} }, React.createElement(Review, { value, onChange() {}, onConfirm() {}, onBack() {}, error: "" }))
  await writeFile("__scope-layout-preview.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Siteline scope layout preview</title><link rel="stylesheet" href="/dist/assets/${css}"></head><body><div id="root">${renderToString(preview)}</div><script>document.addEventListener('submit',event=>event.preventDefault())</script></body></html>`)
  console.log("Actual scope review layout preview ready")
} finally { await server.close() }
