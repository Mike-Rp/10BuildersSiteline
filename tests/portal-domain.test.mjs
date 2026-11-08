import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { domainPortal, portalDomainRedirect, roleAllowedOnHost } from "../src/portal-domain.ts"
import { canonicalizeLoginEntry, currentLoginPortal, loginPath, shareLoginPath, navigateToWorkspace } from "../src/login-portal.ts"

test("each domain rejects the other portal's paths while preserving its own role routes", () => {
  assert.equal(domainPortal("10buildline.site"), "client")
  assert.equal(domainPortal("WWW.10BUILDLINE.SITE"), "client")
  assert.equal(domainPortal("STAFF.10BUILDLINE.SITE"), "staff")
  for (const host of ["localhost", "127.0.0.1", "preview.vercel.app", "staff.10buildline.site.attacker.test", "www.10buildline.site.attacker.test"]) {
    assert.equal(domainPortal(host), undefined)
    assert.equal(portalDomainRedirect(new URL(`https://${host}/admin/team`)), undefined)
  }
  for (const host of ["10buildline.site", "www.10buildline.site", "staff.10buildline.site"]) {
    assert.equal(portalDomainRedirect(new URL(`https://${host}/`)), undefined)
    assert.equal(portalDomainRedirect(new URL(`https://${host}/api/v1/health`)), undefined)
  }
  for (const path of ["/login", "/login?tab=admin", "/admin", "/admin/", "/admin/login", "/staff", "/staff/login", "/admin/team", "/opm", "/opm/documents?filter=active#top", "/spm", "/spm/resources"]) {
    assert.equal(portalDomainRedirect(new URL(`https://10buildline.site${path}`)), "/")
    assert.equal(portalDomainRedirect(new URL(`https://www.10buildline.site${path}`)), "/")
    assert.equal(portalDomainRedirect(new URL(`https://staff.10buildline.site${path}`)), path === '/staff' ? '/' : undefined)
  }
  for (const path of ["/client", "/client/", "/client/login", "/client/overview", "/client/projects/123/documents?source=link#document"]) {
    assert.equal(portalDomainRedirect(new URL(`https://staff.10buildline.site${path}`)), "/")
    assert.equal(portalDomainRedirect(new URL(`https://10buildline.site${path}`)), undefined)
    assert.equal(portalDomainRedirect(new URL(`https://www.10buildline.site${path}`)), undefined)
  }
})

test("unknown routes return to the same root and role checks never navigate across domains", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis,'window')
  const dom = new JSDOM('',{url:'https://10buildline.site/'})
  Object.defineProperty(globalThis,'window',{value:dom.window,configurable:true})
  try {
    for (const host of ['10buildline.site','www.10buildline.site','staff.10buildline.site']) {
      for (const path of ['/unknown','/client/unknown','/admin/unknown','/opm/team','/login/extra','/client/projects/%broken/documents']) {
        dom.reconfigure({url:`https://${host}${path}?tab=admin#invalid`})
        dom.window.history.replaceState(null,'',path+'?tab=admin#invalid')
        assert.equal(portalDomainRedirect(dom.window.location),'/')
        canonicalizeLoginEntry()
        assert.equal(dom.window.location.href,`https://${host}/`)
        const length = dom.window.history.length
        canonicalizeLoginEntry()
        assert.equal(dom.window.history.length,length,'The root does not redirect again')
      }
      for (const role of ['client','admin','opm','spm']) {
        const allowed = host !== 'staff.10buildline.site' ? role === 'client' : role !== 'client'
        assert.equal(roleAllowedOnHost(role,host),allowed)
        dom.window.history.replaceState(null,'','/')
        if (!allowed) {
          assert.equal(navigateToWorkspace(role,true),'/')
          assert.equal(dom.window.location.hostname,host)
          assert.equal(loginPath(role === 'client' ? 'client' : 'staff'),'/')
        }
      }
    }
  } finally {
    dom.window.close()
    previous ? Object.defineProperty(globalThis,'window',previous) : delete globalThis.window
  }
})

test("domain roots and legacy logins retain the selected portal, query and hash, with domain-correct shared links", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  const dom = new JSDOM("", {url:"https://10buildline.site/"})
  Object.defineProperty(globalThis, "window", {value:dom.window, configurable:true})
  try {
    for (const [host, path, portal, canonical] of [
      ["10buildline.site", "/", "client", "/"],
      ["10buildline.site", "/?tab=admin", "client", "/?tab=admin"],
      ["10buildline.site", "/client/login?source=link#form", "client", "/?source=link#form"],
      ["10buildline.site", "/admin", "client", "/"],
      ["10buildline.site", "/admin/dashboard", "client", "/"],
      ["10buildline.site", "/admin/login?tab=admin", "client", "/"],
      ["10buildline.site", "/login?tab=admin", "client", "/"],
      ["10buildline.site", "/opm/documents", "client", "/"],
      ["10buildline.site", "/spm/resources", "client", "/"],
      ["www.10buildline.site", "/login", "client", "/"],
      ["www.10buildline.site", "/admin/login?tab=admin", "client", "/"],
      ["www.10buildline.site", "/client/login", "client", "/"],
      ["staff.10buildline.site", "/", "staff", "/"],
      ["staff.10buildline.site", "/?tab=admin", "admin", "/?tab=admin"],
      ["staff.10buildline.site", "/login?tab=admin", "admin", "/?tab=admin"],
      ["staff.10buildline.site", "/admin/login/?source=link#form", "admin", "/?source=link&tab=admin#form"],
      ["staff.10buildline.site", "/staff/login", "staff", "/"],
      ["staff.10buildline.site", "/client", "staff", "/"],
      ["staff.10buildline.site", "/client/login?tab=admin", "staff", "/"],
      ["staff.10buildline.site", "/client/projects/123/documents?source=link#document", "staff", "/"],
    ]) {
      dom.reconfigure({url:`https://${host}${path}`})
      dom.window.history.replaceState(null, "", path)
      assert.equal(currentLoginPortal(), portal)
      canonicalizeLoginEntry()
      assert.equal(dom.window.location.pathname + dom.window.location.search + dom.window.location.hash, canonical)
      assert.equal(currentLoginPortal(), portal)
      assert.equal(loginPath(portal), "/")
      assert.equal(shareLoginPath("client"), "https://10buildline.site/")
      assert.equal(shareLoginPath("staff"), "https://staff.10buildline.site/")
      assert.equal(shareLoginPath("admin"), "https://staff.10buildline.site/?tab=admin")
    }
    dom.reconfigure({url:"http://localhost/"})
    dom.window.history.replaceState(null, "", "/")
    canonicalizeLoginEntry()
    assert.equal(dom.window.location.pathname, "/")
    assert.equal(shareLoginPath("staff"), "/login")
  } finally {
    dom.window.close()
    previous ? Object.defineProperty(globalThis, "window", previous) : delete globalThis.window
  }
})
