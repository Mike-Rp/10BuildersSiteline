import type { Role } from "./model"
import { changeRoute, pagePath, resolveWorkspaceRoute } from "./workspace-routing.ts"
import { domainPortal, PORTAL_ORIGINS, portalDomainRedirect } from "./portal-domain.ts"

export type LoginPortal = "admin" | "staff" | "client"
export const workspacePath = (role: Role) => pagePath(role)

export function isLandingPath(pathname: string) {
  return /^\/(?:login\/?|(?:admin|staff|client)\/login\/?)?$/i.test(pathname)
}

export function loginPortalForPath(pathname: string): LoginPortal {
  if (/^\/admin(?:\/|$)/i.test(pathname)) return "admin"
  return /^\/(?:login\/?$|(?:staff|opm|spm)(?:\/|$))/i.test(pathname) ? "staff" : "client"
}

export function loginPortalForRole(role: Role): LoginPortal {
  return role === "admin" ? "admin" : role === "client" ? "client" : "staff"
}

const currentDomain = () => typeof window === "undefined" ? undefined : domainPortal(window.location.hostname)
export function loginPath(portal: LoginPortal) {
  if (currentDomain()) return "/"
  return portal === "client" ? "/client/login" : "/login"
}
export function shareLoginPath(portal: LoginPortal) {
  if (currentDomain()) return PORTAL_ORIGINS[portal === "client" ? "client" : "staff"] + (portal === "admin" ? "/?tab=admin" : "/")
  return portal === "admin" ? "/login?tab=admin" : loginPath(portal)
}

export function currentLoginPortal(): LoginPortal {
  if (typeof window === "undefined") return "client"
  const domain = currentDomain()
  if (domain === "client") return "client"
  if (domain === "staff" && portalDomainRedirect(window.location)) return "staff"
  if (window.location.pathname === "/" && domain !== "staff") return "client"
  if (/^\/login\/?$/i.test(window.location.pathname) || (window.location.pathname === "/" && domain === "staff")) {
    const tab = window.history.state?.loginPortal || new URLSearchParams(window.location.search).get("tab")
    return tab === "admin" ? "admin" : "staff"
  }
  return loginPortalForPath(window.location.pathname)
}

// Legacy paths retain their selected portal without making tab switches navigations.
export function canonicalizeLoginEntry() {
  const redirect = portalDomainRedirect(window.location)
  if (redirect) return changeRoute(redirect, true)
  const path = window.location.pathname
  if (path !== "/" && isLandingPath(path) && (currentDomain() || /^\/(admin|staff)\/login\/?$/i.test(path))) {
    const portal = currentLoginPortal()
    const query = new URLSearchParams(window.location.search)
    if (portal === "admin") query.set("tab", "admin")
    const search = query.size ? `?${query}` : ""
    changeRoute(loginPath(portal) + search + window.location.hash, true, { ...window.history.state, loginPortal: portal })
  }
  return window.location.pathname
}

export function navigateToWorkspace(role: Role, freshLogin = false) {
  const current = window.location.pathname
  const requested = freshLogin ? window.history.state?.returnTo : current
  const valid = typeof requested === "string" && resolveWorkspaceRoute(role, requested)
  const path = valid ? pagePath(role, valid.page, valid.projectId) : workspacePath(role)
  const domain = currentDomain()
  const target = role === "client" ? "client" : "staff"
  if (domain && domain !== target) {
    return changeRoute("/", true)
  }
  if (domain && !freshLogin && portalDomainRedirect(window.location)) return changeRoute("/", true)
  // Replace sign-in rather than leaving it immediately behind the workspace.
  // Older login entries are handled by the authenticated route guard.
  if (freshLogin || current !== path) changeRoute(path, true)
  return path
}
