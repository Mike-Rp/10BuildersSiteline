import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createServer } from "vite"
import React, { act } from "react"

test("project comparison opens a nested phase panel and restores the details context, focus, and scroll", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const server = await createServer({ server: {middlewareMode: true, hmr: false, watch: null}, appType: "custom", logLevel: "silent", optimizeDeps: {noDiscovery: true, include: []} })
  const {createRoot} = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  try {
    const {default: ProjectProgress} = await server.ssrLoadModule("/src/ProjectProgress.tsx")
    const {Modal} = await server.ssrLoadModule("/src/ui.tsx")
    const project = {id: "authorized-project", name: "Authorized project", start: "2026-01-01", end: "2026-01-11",
      phase: "Structure", phases: ["Mobilization", "Foundation", "Structure", "Closeout"], checklistProgress: [
        {id:"1",name:"Mobilization",configured:true,required:4,approved:4,status:"Completed"},
        {id:"2",name:"Foundation",configured:true,required:3,approved:3,status:"Completed"},
        {id:"3",name:"Structure",configured:true,required:3,approved:1,status:"Ongoing"},
        {id:"4",name:"Closeout",configured:true,required:4,approved:0,status:"Not Started",locked:true},
      ]}
    const render = value => root.render(React.createElement(Modal, {title:"Project details", onClose:()=>{}, wide:true},
      React.createElement(ProjectProgress, {key:value.id, project:value, reportingDate:"2026-01-06"})))
    await act(() => render(project))
    const outer = document.querySelector('[role="dialog"]')
    assert.match(outer.textContent, /7.1 percentage points above date-based baseline/)
    assert.match(outer.textContent, /8 of 14 required activities approved/)
    assert.equal(outer.querySelector('[aria-label="Planned completion"]').getAttribute("aria-valuenow"), "50")
    assert.equal(outer.querySelector('[aria-label="Actual approved completion"]').getAttribute("aria-valuenow"), "57.1")
    const trigger = [...outer.querySelectorAll("button")].find(el => el.textContent.includes("View phase breakdown"))
    const body = outer.querySelector(".modal-body")
    body.scrollTop = 180
    trigger.focus()
    await act(() => trigger.click())
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 2)
    const panel = document.querySelector('[aria-label="Progress by construction phase"]')
    assert.match(panel.textContent, /Authorized project/)
    assert.deepEqual([...panel.querySelectorAll("tbody th > span")].map(el => el.textContent), project.phases)
    assert.deepEqual([...panel.querySelectorAll("thead th")].map(el => el.textContent), ["Construction Phase","Approved Activities","Phase Status"])
    assert.deepEqual([...panel.querySelectorAll("tbody td:first-of-type")].map(el => el.textContent), ["4 / 4","3 / 3","1 / 3","0 / 4"])
    assert.deepEqual([...panel.querySelectorAll(".pp-status")].map(el => el.textContent), ["Completed","Completed","Ongoing","Not Started"])
    assert.equal(panel.querySelector('[role="meter"], progress, .pp-track'), null)
    assert.doesNotMatch(panel.textContent, /%|Unavailable|Awaiting Setup|Required activity list unavailable/)
    assert.equal(panel.querySelectorAll(".pp-locked").length, 1)
    assert.equal(panel.querySelectorAll(".pp-current").length, 1)
    body.scrollTop = 777
    await act(async () => {
      document.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key:"Escape", bubbles:true}))
    })
    await act(async () => new Promise(resolve => setTimeout(resolve, 50)))
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
    assert.ok(outer.isConnected)
    assert.equal(document.activeElement, trigger)
    assert.equal(body.scrollTop, 180)
    await act(() => outer.querySelector(".pp-comparison").click())
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 2)
    await act(() => render({...project, id:"client-projection", checklistProgress:undefined, end:undefined}))
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
    assert.match(document.body.textContent, /Overall completion unavailable/)
    assert.match(document.body.textContent, /Planned completion unavailable/)
    assert.equal(document.querySelector(".pp-gap"), null)
    assert.equal(document.querySelector('[aria-label="Actual approved completion"]').getAttribute("aria-valuenow"), null)
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
