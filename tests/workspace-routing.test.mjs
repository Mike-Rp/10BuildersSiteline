import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { navigateToWorkspace } from "../src/login-portal.ts"
import { pagePath, resolveWorkspaceRoute, WORKSPACE_ROUTES } from "../src/workspace-routing.ts"

test("every sidebar page has a unique, role-scoped route; unknown and cross-role routes are rejected", () => {
  const paths = new Set()
  for (const [role, pages] of Object.entries(WORKSPACE_ROUTES)) {
    for (const page of Object.keys(pages)) {
      const path = pagePath(role, page)
      assert.ok(!paths.has(path), path)
      paths.add(path)
      assert.deepEqual(resolveWorkspaceRoute(role, path), {page})
      for (const other of Object.keys(WORKSPACE_ROUTES).filter(value => value !== role)) assert.equal(resolveWorkspaceRoute(other, path), undefined)
    }
    assert.equal(resolveWorkspaceRoute(role, `/${role}/unknown`), undefined)
    assert.equal(resolveWorkspaceRoute(role, `/${role}/dashboard/extra`), undefined)
  }
  assert.deepEqual(resolveWorkspaceRoute("client", "/client/projects/project-123/documents"), {page:"Project Documents",projectId:"project-123"})
  assert.equal(resolveWorkspaceRoute("client", "/client/projects/%broken/documents"), undefined)
})

test("fresh logins replace login history; session restores do not add entries", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  const dom = new JSDOM("", {url:"https://siteline.example/"})
  Object.defineProperty(globalThis,"window",{value:dom.window,configurable:true})
  const w = dom.window
  const traverse = async direction => {
    const moved = new Promise(resolve => w.addEventListener("popstate",resolve,{once:true}))
    w.history[direction]()
    await moved
  }
  try {
    for (const role of ["admin","opm","spm","client"]) {
      const landing = role === "client" ? "/client/login" : "/login"
      w.history.replaceState(null,"","/previous-page")
      w.history.pushState(null,"",landing)
      const count = w.history.length
      assert.equal(navigateToWorkspace(role,true),pagePath(role))
      assert.equal(w.history.length,count,'Login replaces its entry instead of adding another')
      const afterLogin = w.history.length
      navigateToWorkspace(role)
      assert.equal(w.history.length,afterLogin)
      await traverse("back")
      assert.equal(w.location.pathname,'/previous-page','Back does not revisit the replaced login entry')
      await traverse("forward")
      assert.equal(w.location.pathname,pagePath(role))
    }
    w.history.replaceState(null,"","/spm")
    navigateToWorkspace("opm")
    assert.equal(w.location.pathname,"/opm/dashboard","the verified account determines the route")
    w.history.replaceState(null,"","/opm/documents")
    const count = w.history.length
    navigateToWorkspace("opm")
    assert.equal(w.location.pathname,"/opm/documents","restore preserves a deep link")
    assert.equal(w.history.length,count)
    w.history.replaceState({returnTo:"/admin/team"},"","/login")
    assert.equal(navigateToWorkspace("spm",true),"/spm/dashboard","return paths cannot bypass role checks")
  } finally {
    dom.window.close()
    if(previous)Object.defineProperty(globalThis,"window",previous)
    else delete globalThis.window
  }
})
