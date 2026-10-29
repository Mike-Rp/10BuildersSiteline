import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import http from "node:http"
import { once } from "node:events"
import { createServer } from "vite"

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8")

test("the login shell and robots response consistently keep the portal out of search", async () => {
  const vite = await createServer({
    cacheDir: `node_modules/.vite-tests/seo-${process.pid}`,
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom", logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  const server = http.createServer((req, res) => vite.middlewares(req, res, () => res.end("")))
  try {
    const html = await vite.transformIndexHtml("/", read("../index.html"))
    assert.match(html, /<html lang="en">/)
    assert.match(html, /<title>SITELINE \| 10 Builders<\/title>/)
    assert.match(html, /name="robots" content="noindex, nofollow"/)
    assert.match(html, /rel="canonical" href="https:\/\/10builderssiteline\.vercel\.app\/"/)
    assert.match(html, /property="og:url"/)
    assert.match(html, /property="og:image" content="https:\/\/10builderssiteline\.vercel\.app\/images\//)
    assert.match(html, /name="twitter:description"/)
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const response = await fetch(`http://127.0.0.1:${server.address().port}/robots.txt`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow")
    const robots = await response.text()
    assert.match(robots, /Allow: \//)
    assert.doesNotMatch(robots, /Disallow: \/\s*$/m)
    assert.doesNotMatch(robots, /Sitemap:/)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await vite.close()
  }
})

test("deployment caches versioned static files and never publicly caches API data", () => {
  const config = JSON.parse(read("../vercel.json"))
  const headers = source => Object.fromEntries(config.headers.find(rule => rule.source === source).headers.map(h => [h.key.toLowerCase(), h.value]))
  assert.equal(headers("/(.*)")["x-robots-tag"], "noindex, nofollow")
  assert.equal(headers("/(.*)")["cache-control"], undefined)
  assert.match(headers("/assets/:path*")["cache-control"], /max-age=31536000, immutable/)
  assert.match(headers("/images/:path*")["cache-control"], /max-age=3600/)
  assert.equal(headers("/api/:path*")["cache-control"], "private, no-store")
  assert.equal(headers("/api/:path*")["vercel-cdn-cache-control"], "no-store")
  for (const path of ["/", "/index.html"]) assert.match(headers(path)["cache-control"], /max-age=0, must-revalidate/)
  // Keep the existing API and SPA entrypoints intact.
  assert.equal(config.rewrites[0].destination, "/api")
  assert.equal(config.rewrites.at(-1).destination, "/index.html")
})
