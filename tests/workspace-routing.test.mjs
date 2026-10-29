import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { isLandingPath, navigateToWorkspace } from "../src/login-portal.ts"

test("fresh logins retain a 10BuildLine landing entry; session restores do not add entries", async () => {
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
      const landing = role === "admin" ? "/admin/login" : role === "client" ? "/" : "/staff/login"
      w.history.replaceState(null,"",landing)
      const count = w.history.length
      assert.equal(navigateToWorkspace(role,true),`/${role}`)
      // A previous forward entry may be replaced by a fresh login.
      assert.ok(w.history.length <= count + 1)
      const afterLogin = w.history.length
      navigateToWorkspace(role)
      assert.equal(w.history.length,afterLogin)
      await traverse("back")
      assert.equal(w.location.pathname,landing)
      assert.equal(isLandingPath(w.location.pathname),true)
      await traverse("forward")
      assert.equal(w.location.pathname,`/${role}`)
    }
    w.history.replaceState(null,"","/spm")
    navigateToWorkspace("opm")
    assert.equal(w.location.pathname,"/opm","the verified account determines the route")
  } finally {
    dom.window.close()
    if(previous)Object.defineProperty(globalThis,"window",previous)
    else delete globalThis.window
  }
})
