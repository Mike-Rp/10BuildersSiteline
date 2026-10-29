import type { Role } from "./model"

export type LoginPortal = "admin" | "staff" | "client"

export function workspacePath(role: "admin" | "opm" | "spm" | "client") {
  return `/${role}`
}

export function isLandingPath(pathname: string) {
  return /^\/(?:login\/?|(?:admin|staff)\/login\/?)?$/i.test(pathname)
}

// Keep the sign-in page behind a fresh login. Restoring a session only
// canonicalizes its current entry, so refreshes do not grow browser history.
export function navigateToWorkspace(role: "admin" | "opm" | "spm" | "client", freshLogin = false) {
  const path = workspacePath(role)
  if (freshLogin) {
    const landing = role === "client" ? "/" : loginPath(loginPortalForRole(role))
    if (!isLandingPath(window.location.pathname)) window.history.replaceState(null, "", landing)
    window.history.pushState(null, "", path)
  } else if (window.location.pathname !== path) {
    window.history.replaceState(null, "", path)
  }
  return path
}

export function loginPortalForPath(pathname: string): LoginPortal {
  if (/^\/admin(?:\/|$)/i.test(pathname)) return "admin"
  return /^\/(?:staff|opm|spm)(?:\/|$)/i.test(pathname) ? "staff" : "client"
}

export function loginPortalForRole(role: Role): LoginPortal {
  return role === "admin" ? "admin" : role === "client" ? "client" : "staff"
}

export function loginPath(portal: LoginPortal): string {
  return portal === "client" ? "/login" : `/${portal}/login`
}


export function currentLoginPortal(): LoginPortal {
  return typeof window === "undefined" ? "client" : loginPortalForPath(window.location.pathname)
}
