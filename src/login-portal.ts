import type { Role } from "./model"

export type LoginPortal = "admin" | "staff" | "client"

export function loginPortalForPath(pathname: string): LoginPortal {
  if (/^\/admin(?:\/|$)/i.test(pathname)) return "admin"
  return /^\/staff(?:\/|$)/i.test(pathname) ? "staff" : "client"
}

export function loginPortalForRole(role: Role): LoginPortal {
  return role === "admin" ? "admin" : role === "client" ? "client" : "staff"
}

export function loginPath(portal: LoginPortal): string {
  return portal === "client" ? "/login" : `/${portal}/login`
}

export function workspacePath(portal: LoginPortal): string {
  return portal === "client" ? "/" : `/${portal}`
}

export function currentLoginPortal(): LoginPortal {
  return typeof window === "undefined" ? "client" : loginPortalForPath(window.location.pathname)
}
