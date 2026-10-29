export type LoginPortal = "admin" | "workspace"

export function loginPortalForPath(pathname: string): LoginPortal {
  return /^\/admin(?:\/|$)/i.test(pathname) ? "admin" : "workspace"
}

export function currentLoginPortal(): LoginPortal {
  return typeof window === "undefined" ? "workspace" : loginPortalForPath(window.location.pathname)
}
