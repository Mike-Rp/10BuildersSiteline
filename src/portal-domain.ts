import { resolveWorkspaceRoute } from "./workspace-routing.ts"

// These domains serve the same deployment. Unknown hosts (local/preview) keep
// path-based portal selection so development never navigates to production.
export type DomainPortal = "client" | "staff"
export const PORTAL_ORIGINS = {
  client: "https://10buildline.site",
  staff: "https://staff.10buildline.site",
} as const

export function domainPortal(hostname: string): DomainPortal | undefined {
  if (hostname.toLowerCase() === "10buildline.site") return "client"
  if (hostname.toLowerCase() === "staff.10buildline.site") return "staff"
}

export function roleAllowedOnHost(role: string, hostname: string): boolean {
  const portal = domainPortal(hostname)
  if (!portal) return true
  return portal === "client" ? role === "client" : ["admin", "opm", "spm"].includes(role)
}

// Routing convenience only: API authentication and database roles still decide access.
export function portalDomainRedirect(location: Pick<Location, "hostname" | "pathname" | "search" | "hash">): string | undefined {
  const current = domainPortal(location.hostname)
  if (!current) return
  const { pathname } = location
  if (pathname === "/" || /^\/api(?:\/|$)/i.test(pathname)) return
  const loginAlias = current === "client" ? /^\/client\/login\/?$/i : /^\/(?:login|(?:admin|staff)\/login)\/?$/i
  if (loginAlias.test(pathname)) return
  const valid = current === "client" ? resolveWorkspaceRoute("client", pathname)
    : (["admin", "opm", "spm"] as const).some(role => resolveWorkspaceRoute(role, pathname))
  // Wrong-portal and unknown paths both return to this hostname's root.
  if (!valid) return "/"
}
