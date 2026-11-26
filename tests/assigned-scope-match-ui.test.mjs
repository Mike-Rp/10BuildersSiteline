import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "vite"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

test("assigned scope match requires every selected tag, independently of other phase requirements", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { default: Match } = await server.ssrLoadModule("/src/AssignedScopeMatch.tsx")
    const render = (assigned, qualified) => renderToStaticMarkup(React.createElement(Match, { assigned, qualified }))
    assert.match(render(["Structural Engineering"], ["Structural Engineering"]), /100% assigned scope match/)
    const mixed = render(["Structural Engineering", "Plumbing Systems Engineering"], ["Structural Engineering"])
    assert.match(mixed, /Assigned scope needs review/)
    assert.doesNotMatch(mixed, /100% assigned scope match/)
    assert.match(render([], ["Structural Engineering"]), /Select an assigned scope/)
    assert.match(render(["Structural Engineering"], []), /Assigned scope needs review/)
    assert.match(render(["Structural Engineering", "Construction Engineering"], ["Structural Engineering", "Construction Engineering"]), /100% assigned scope match/)
  } finally {
    await server.close()
  }
})
