// Child process: runs the real app in jsdom, signs in as one user against the
// API at VITE_API_URL, opens every page and reports crashes. Used by ui-smoke.mjs.
import { JSDOM } from "jsdom"
import { createServer } from "vite"

const [, , email, ...navLabels] = process.argv
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost:8443/", pretendToBeVisual: true })
const w = dom.window
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
for (const k of ["window", "document", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "InputEvent", "File", "FileReader", "Blob", "DOMParser", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "sessionStorage", "localStorage", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "SVGElement", "CustomEvent"])
  set(k, w[k])
set("navigator", w.navigator)
set("IS_REACT_ACT_ENVIRONMENT", true)
w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
set("matchMedia", w.matchMedia)
for (const k of ["ResizeObserver", "IntersectionObserver"]) set(k, class { observe() {} unobserve() {} disconnect() {} })
w.scrollTo = () => {}
w.HTMLElement.prototype.scrollIntoView = () => {}
globalThis.URL.createObjectURL = () => "blob:test"
globalThis.URL.revokeObjectURL = () => {}

const problems = []
const origError = console.error
console.error = (...a) => {
  const text = a.map((x) => (x instanceof Error ? x.stack : String(x))).join(" ")
  if (!/not wrapped in act|Not implemented|Warning: .*(key|DOM nesting|validateDOMNesting)/i.test(text)) problems.push(text.slice(0, 500))
  origError(...a.map(String).map((s) => s.slice(0, 200)))
}
w.addEventListener("error", (e) => problems.push("window error: " + (e.error?.stack || e.message)))
process.on("unhandledRejection", (e) => problems.push("unhandled rejection: " + (e?.stack || e)))

const server = await createServer({ cacheDir: 'node_modules/.vite-tests/' + process.pid, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (fn, what, ms = 15000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return
    await sleep(50)
  }
  throw new Error("Timed out waiting for " + what + "\nPAGE: " + document.body.textContent.slice(0, 300))
}
const text = () => document.body.textContent || ""
const setValue = (input, value) => {
  const proto = Object.getPrototypeOf(input)
  Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value)
  input.dispatchEvent(new w.Event("input", { bubbles: true }))
}

await server.ssrLoadModule("/src/main.tsx")
await waitFor(() => document.querySelector("form.login-form"), "the login form")
const inputs = document.querySelectorAll("form.login-form input")
setValue(inputs[0], email)
setValue(inputs[1], "Password@123")
await sleep(50)
document.querySelector("form.login-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }))
await waitFor(() => !document.querySelector("form.login-form") || document.querySelector(".login-form .error, [role=alert]"), "sign-in to finish", 30000)
if (document.querySelector("form.login-form")) throw new Error("Sign-in failed: " + (document.querySelector("form.login-form .error, form.login-form [role=alert]")?.textContent || text().slice(0, 200)))
await sleep(500)

if ([...document.querySelectorAll('.sidebar .nav-item')].some(el => el.textContent.trim().toLowerCase() === 'schedule performance')) problems.push('Retired Schedule Performance module remains in sidebar')
const results = { email, signedIn: true, root: document.getElementById("root").innerHTML.length, pages: {} }
results.banner = text().includes("Connected to database")
results.home = text().replace(/\s+/g, " ").slice(0, 160)
const clickable = () => [...document.querySelectorAll("button, a, [role=button]")]
for (const label of navLabels) {
  const target = clickable().find((el) => el.textContent.trim().replace(/\s+/g, " ").startsWith(label))
  if (!target) {
    results.pages[label] = "no such button"
    continue
  }
  target.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }))
  await sleep(250)
  results.pages[label] = document.getElementById("root").innerHTML.length > 500 ? "ok" : "BLANK"
  if (label === "Dashboard" && document.querySelector('.project-progress, .chart-summary')) problems.push('Retired dashboard schedule chart remains')
  if (label === "Dashboard" && document.querySelector('.admin-overview')) {
    if (document.querySelectorAll('.ao-metric').length !== 3) problems.push('Administrator dashboard totals are duplicated')
    if (document.querySelector('.admin-overview table, .admin-overview .attention-strip, .admin-overview .pipeline-panel')) problems.push('Duplicate dashboard project or pipeline content remains')
    const item = document.querySelector('.ao-task')
    if (item) {
      item.click()
      await sleep(150)
      const modal = document.querySelector('[role="dialog"]')
      if (!modal) problems.push('Dashboard attention item did not open its existing workflow')
      else {
        modal.querySelector('[aria-label="Close dialog"]')?.click()
        await sleep(100)
      }
    }
  }
  if (label === "Active sites") {
    const tabs = [...document.querySelectorAll('.as-tabs [role="tab"]')]
    const isClient = !!document.querySelector('.client-portal')
    const reviewTab = tabs.find(el => el.textContent.startsWith('Awaiting review'))
    if (isClient && reviewTab) problems.push('Client received staff review navigation')
    if (!isClient && !reviewTab) problems.push('Staff review navigation is missing')
    if (document.querySelector('.as-card .badge')) problems.push('Redundant Active badge remains on a project card')
    if ([...document.querySelectorAll('.as-toolbar label')].some(el => el.textContent.trim().startsWith('Status'))) problems.push('Redundant status filter remains')
    if (reviewTab) {
      reviewTab.click()
      await sleep(100)
      if ([...document.querySelectorAll('.as-card')].some(el => !el.querySelector('.as-review'))) problems.push('Review tab includes a project without a pending review')
      tabs[0].click()
      await sleep(100)
    }
    const details = [...document.querySelectorAll(".as-card button")].find(el => el.textContent.includes("View Project Details"))
    if (details) {
      details.click()
      await sleep(250)
      const modal = document.querySelector('[role="dialog"]')
      if (!modal) problems.push("Active Sites details did not open a modal")
      else {
        results.pages["Active site details modal"] = "ok"
        const breakdown = [...modal.querySelectorAll("button")].find(el => el.textContent.includes("View phase breakdown"))
        if (!breakdown) problems.push("Project progress comparison is missing")
        else {
          breakdown.focus()
          const body = modal.querySelector('.modal-body')
          const scroll = body.scrollTop
          breakdown.click()
          await sleep(100)
          const panel = document.querySelector('[aria-label="Progress by construction phase"]')
          if (!panel) problems.push("Phase breakdown panel did not open")
          document.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape',bubbles:true}))
          await sleep(100)
          if (!modal.isConnected || document.querySelectorAll('[role="dialog"]').length !== 1) problems.push("Closing phase panel lost project details")
          if (body.scrollTop !== scroll) problems.push("Closing phase panel lost details scroll")
          if (document.activeElement !== breakdown) problems.push("Closing phase panel lost trigger focus")
        }
        modal.querySelector('[aria-label="Close dialog"]')?.click()
        await sleep(100)
      }
    }
  }
}
results.problems = problems
console.log("RESULT " + JSON.stringify(results))
await server.close()
process.exit(0)
