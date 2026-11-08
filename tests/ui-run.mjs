// Child process: runs the real app in jsdom, signs in as one user against the
// API at VITE_API_URL, opens every page and reports crashes. Used by ui-smoke.mjs.
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import { pagePath } from "../src/workspace-routing.ts"

const [, , email, ...navLabels] = process.argv
// Admin, staff and client accounts each sign in through their own portal page.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost:8443" + (process.env.SMOKE_LOGIN_PATH || "/"), pretendToBeVisual: true })
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

const { default: React } = await import("react")
const { createRoot } = await import("react-dom/client")
const { default: App } = await server.ssrLoadModule("/src/App.tsx")
const root = createRoot(document.getElementById("root"))
const mount = () => root.render(React.createElement(App))
mount()
await waitFor(() => document.querySelector("form.login-form"), "the login form")
const inputs = document.querySelectorAll("form.login-form input")
setValue(inputs[0], email)
setValue(inputs[1], "Password@123")
await sleep(50)
document.querySelector("form.login-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }))
await waitFor(() => (!document.querySelector("form.login-form") && !document.querySelector(".workspace-skeleton")) || document.querySelector(".login-form .error, [role=alert]"), "sign-in and workspace loading to finish", 30000)
if (document.querySelector("form.login-form")) throw new Error("Sign-in failed: " + (document.querySelector("form.login-form .error, form.login-form [role=alert]")?.textContent || text().slice(0, 200)))
await sleep(500)

if ([...document.querySelectorAll('.sidebar .nav-item')].some(el => el.textContent.trim().toLowerCase() === 'schedule performance')) problems.push('Retired Schedule Performance module remains in sidebar')
const results = { email, signedIn: true, root: document.getElementById("root").innerHTML.length, pages: {} }
results.banner = text().includes("Connected to database")
results.home = text().replace(/\s+/g, " ").slice(0, 160)
const clickable = () => [...document.querySelectorAll("button, a, [role=button]")]
const sidebarCounts = () => [...document.querySelectorAll('.sidebar .nav-item')].map(el => [el.getAttribute('aria-label'),el.querySelector('.nav-count')?.textContent || '0'])
const initialSidebarCounts = JSON.stringify(sidebarCounts())
const role = document.querySelector('.admin-workspace') ? 'admin' : document.querySelector('.client-portal') ? 'client' : email.startsWith('lea.') ? 'opm' : 'spm'
const apiClient = await server.ssrLoadModule('/src/api/client.ts')
const traverse = async direction => {
  const moved = new Promise(resolve => w.addEventListener('popstate',resolve,{once:true}))
  w.history[direction]()
  await moved
  await sleep(100)
}
const active = label => document.querySelector(`.sidebar .nav-item[aria-label="${label}"][aria-current="page"]`)
for (const label of navLabels) {
  const previousPath = w.location.pathname
  const target = clickable().find((el) => el.getAttribute("aria-label") === label || el.textContent.trim().replace(/\s+/g, " ").startsWith(label))
  if (!target) {
    results.pages[label] = "no such button"
    continue
  }
  target.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }))
  await sleep(250)
  const path = pagePath(role,label)
  if (w.location.pathname !== path || !active(label)) problems.push(`${role} ${label}: URL or active highlight is incorrect`)
  if (previousPath !== path) {
    await traverse('back')
    if (w.location.pathname !== previousPath) problems.push(`${role} ${label}: Back did not restore the previous URL`)
    await traverse('forward')
    if (w.location.pathname !== path || !active(label)) problems.push(`${role} ${label}: Forward did not restore the module`)
  }
  // Recreate the app at the deep URL with its saved token, as on a browser refresh.
  root.render(null)
  await sleep(50)
  mount()
  await waitFor(() => active(label) && !document.querySelector('.workspace-skeleton'), `restore ${path}`, 30000)
  if (w.location.pathname !== path) problems.push(`${role} ${label}: refresh lost the deep URL`)
  results.pages[label + ' URL/history/session restore'] = 'ok'
  if (JSON.stringify(sidebarCounts()) !== initialSidebarCounts) problems.push('Pending-work sidebar counts changed solely from module navigation')
  for (const badge of document.querySelectorAll('.sidebar .nav-count')) {
    if (!badge.title || !badge.getAttribute('aria-label') || Number(badge.textContent) <= 0) problems.push('Sidebar work badge lacks its count or accessible explanation')
  }
  if (document.querySelector('.client-portal .nav-count')) problems.push('Client sidebar exposes a staff review count')
  results.pages[label] = document.getElementById("root").innerHTML.length > 500 ? "ok" : "BLANK"
  if (label === "Activity log") {
    if (!document.querySelector("main h1")?.textContent.includes("Activity log")) problems.push("Activity log did not open as a dedicated page")
    if (!document.querySelector('main input[placeholder="Search activity"]')) problems.push("Activity log search is missing")
    if (document.querySelector('[role="dialog"]')) problems.push("Activity log unexpectedly opened as a modal")
  }
  if (["Project intake","Confirmation queue","Assignments"].includes(label)) {
    const group=document.querySelector('.intake-tabs[aria-label="Intake responsibility"]')
    if (!group) problems.push('Intake responsibility grouping is missing')
    else {
      const tabs=[...group.querySelectorAll(':scope > button')]
      for (const tab of tabs) { tab.click();await sleep(50);if(tab.getAttribute('aria-pressed')!=="true")problems.push('Intake responsibility tab did not change') }
      tabs[0].click();await sleep(50)
      group.querySelector('.intake-info-trigger').click();await sleep(50)
      if(!document.querySelector('.intake-info-panel'))problems.push('Compact intake guidance did not open')
      document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(50)
    }
    if (label==="Project intake") {
      const details=document.querySelector('.intake-project-link')
      if(details){details.click();await sleep(100);const modal=document.querySelector('[aria-modal="true"]');if(!modal)problems.push('Intake record did not open existing project details');else{const help=modal.querySelector('.intake-info-trigger');if(help){help.click();await sleep(50);document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(50);if(!modal.isConnected)problems.push('Help Escape closed the existing intake details');}modal.querySelector('[aria-label="Close dialog"]')?.click();await sleep(50)}}
    }
  }
  if(document.querySelector('.client-portal .intake-tabs, .client-portal .intake-next')) problems.push('Client received internal intake guidance')
  if (label === "Dashboard" && document.querySelector('.project-progress, .chart-summary')) problems.push('Retired dashboard schedule chart remains')
  if (label === "Dashboard" && document.querySelector('.admin-overview')) {
    if (document.querySelectorAll('.executive-summary').length !== 1 || document.querySelectorAll('.executive-metric').length !== 4) problems.push('Administrator executive summary totals are missing or duplicated')
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
    // Office and Site PMs review work from the Active sites view tabs; clients and Admin have no review tabs.
    const tabs = [...document.querySelectorAll('.active-sites-view-tabs [role="tab"]')]
    const isClient = !!document.querySelector('.client-portal')
    const isAdmin = !!document.querySelector('.admin-workspace')
    const reviewTab = tabs.find(tab => /^(Updates & issues|Assignments)/.test(tab.textContent.trim()))
    if (isClient && reviewTab) problems.push('Client received staff review navigation')
    if (!isClient && !isAdmin && !reviewTab) problems.push('Staff review navigation is missing')
    if (document.querySelector('.as-card .badge')) problems.push('Redundant Active badge remains on a project card')
    if ([...document.querySelectorAll('.as-toolbar label')].some(el => el.textContent.trim().startsWith('Status'))) problems.push('Redundant status filter remains')
    if (reviewTab) {
      reviewTab.click()
      await sleep(100)
      if (role === 'opm' && [...document.querySelectorAll('.as-card')].some(el => !el.querySelector('.as-review'))) problems.push('Review tab includes a project without a pending review')
      if(reviewTab.getAttribute('aria-selected')!=='true') problems.push('Staff review tab did not activate')
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
        if (isClient && !modal.querySelector('.client-project-facts')) problems.push("Client project facts are missing")
        if (isClient && modal.querySelector('.project-progress')) problems.push("Client received an unsupported staff progress comparison")
        if (!breakdown && !isClient) problems.push("Project progress comparison is missing")
        else if (breakdown) {
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
  if (w.location.pathname !== path) problems.push(`${role} ${label}: an in-page tab or dialog changed the URL`)
}
// Manual cross-role paths must render only the verified role's workspace.
for (const other of ['admin','opm','spm','client'].filter(value => value !== role)) {
  w.history.pushState(null,'',pagePath(other))
  w.dispatchEvent(new w.PopStateEvent('popstate'))
  await sleep(150)
  if (w.location.pathname !== pagePath(role) || !active(role === 'client' ? 'Project Overview' : 'Dashboard')) problems.push(`${role}: unauthorized ${other} URL was not redirected`)
}
// A Client project URL may only resolve projects returned by the existing scoped loader.
if (role === 'client') {
  const option = document.querySelector('.client-project-toolbar select option')
  if (!option) problems.push('Client dynamic route: missing assigned project')
  else {
    const path = pagePath('client','Project Documents',option.value)
    w.history.pushState(null,'',path)
    w.dispatchEvent(new w.PopStateEvent('popstate'))
    await sleep(100)
    if (!active('Project Documents') || document.querySelector('.client-project-toolbar select')?.value !== option.value) problems.push('Client dynamic project route did not resolve')
    root.render(null);await sleep(50);mount()
    await waitFor(() => active('Project Documents') && !document.querySelector('.workspace-skeleton'),'dynamic route refresh')
    if(w.location.pathname!==path) problems.push('Client dynamic route was lost on refresh')
    w.history.pushState(null,'','/client/projects/unauthorized-project/documents')
    w.dispatchEvent(new w.PopStateEvent('popstate'))
    await sleep(100)
    if (document.querySelector('.client-project-toolbar') || !document.querySelector('.client-access-empty')) problems.push('Client unauthorized project exposed another project')
  }
}
results.routeSecurity = 'checked cross-role URLs' + (role === 'client' ? ', dynamic links and unauthorized projects' : '')
// Revoked sessions must leave a protected deep link at its matching sign-in page.
root.render(null);await sleep(50)
apiClient.setToken('')
w.history.replaceState(null,'',pagePath(role))
mount()
await waitFor(() => document.querySelector('form.login-form'),'signed-out deep link')
if(w.location.pathname!==(role === 'client'?'/client/login':'/login')) problems.push('Signed-out protected URL did not redirect to login')
results.problems = problems
console.log("RESULT " + JSON.stringify(results))
root.unmount()
await server.close()
process.exit(0)
