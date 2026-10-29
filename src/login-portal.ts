export type LoginPortal = "admin" | "workspace"

export function workspacePath(role: "admin" | "opm" | "spm" | "client") {
  return `/${role}`
}

export function isLandingPath(pathname: string) {
  return /^\/(?:login\/?|admin\/login\/?)?$/i.test(pathname)
}

// Keep the sign-in page behind a fresh login. Restoring a session only
// canonicalizes its current entry, so refreshes do not grow browser history.
export function navigateToWorkspace(role: "admin" | "opm" | "spm" | "client", freshLogin = false) {
  const path = workspacePath(role)
  if (freshLogin) {
    const landing = role === "admin" ? "/admin/login" : "/"
    if (!isLandingPath(window.location.pathname)) window.history.replaceState(null, "", landing)
    window.history.pushState(null, "", path)
  } else if (window.location.pathname !== path) {
    window.history.replaceState(null, "", path)
  }
  return path
}

export function loginPortalForPath(pathname: string): LoginPortal {
  return /^\/admin(?:\/|$)/i.test(pathname) ? "admin" : "workspace"
}

export function currentLoginPortal(): LoginPortal {
  return typeof window === "undefined" ? "workspace" : loginPortalForPath(window.location.pathname)
}
