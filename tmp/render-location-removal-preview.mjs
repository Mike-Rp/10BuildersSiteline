import React from "react"
import { renderToString } from "react-dom/server"
import { createServer } from "vite"
import { readdir, writeFile } from "node:fs/promises"
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { default: Preview } = await server.ssrLoadModule("/tmp/LocationRemovalPreview.tsx")
  const css = (await readdir("dist/assets")).find(name => /^index-.*\.css$/.test(name))
  const style = `.preview-brand{display:flex;gap:18px;align-items:center;padding:18px 24px;background:#193b59;color:white;border-bottom:3px solid #d5a459}.preview-brand strong{font-size:24px}.preview-brand span{font-size:13px;letter-spacing:1px}.preview-content{max-width:1100px;margin:auto;padding:24px}.preview-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.preview-tabs a{display:block;text-decoration:none;min-height:44px;padding:10px 16px;border:1px solid #a9bad0;background:white;border-radius:6px;color:#172b4d}.preview-tabs a[aria-selected=true]{background:#172b4d;color:white;border-color:#172b4d}.preview-card{padding:22px;background:white;border:1px solid #d8e0e8;border-radius:8px;min-width:0}.preview-title{font-size:21px;margin-bottom:20px}@media(max-width:600px){.preview-content{padding:14px}.preview-card{padding:14px}.preview-tabs a{flex:1 1 160px}}`
  const pages = [["__location-removal-preview.html","Subcontractor registration"],["__project-intake-without-location-preview.html","Project intake"],["__capability-review-without-location-preview.html","Capability review"],["__allocation-without-location-preview.html","Allocation"]]
  for(const [file,initialView] of pages) await writeFile(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Siteline updated forms preview</title><link rel="stylesheet" href="/dist/assets/${css}"><style>${style}</style></head><body><div id="root">${renderToString(React.createElement(Preview,{initialView}))}</div><script>document.addEventListener('submit',function(event){event.preventDefault()})</script></body></html>`)
  console.log("Updated forms preview ready")
} finally { await server.close() }
