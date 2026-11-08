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

// Routing convenience only: API authentication and database roles still decide access.
export function portalDomainRedirect(location: Pick<Location, "hostname" | "pathname" | "search" | "hash">): string | undefined {
  const current = domainPortal(location.hostname)
  if (!current) return
  const { pathname } = location
  const target = /^\/(?:admin|staff|opm|spm)(?:\/|$)/i.test(pathname) || /^\/login\/?$/i.test(pathname)
    ? "staff" : /^\/client(?:\/|$)/i.test(pathname) ? "client" : current
  // A path belonging to the other portal returns to this domain's login.
  if (target !== current) return "/"
}
