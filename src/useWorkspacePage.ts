import { useEffect, useState } from "react"
import type { Role } from "./model"
import { changeRoute, defaultPage, pagePath, resolveWorkspaceRoute, ROUTE_CHANGE } from "./workspace-routing"

export default function useWorkspacePage(role: Role, enabled = true) {
  const read = () => resolveWorkspaceRoute(role, window.location.pathname)
  const [route, setRoute] = useState(read)
  const [demoPage, setDemoPage] = useState(defaultPage(role))
  useEffect(() => {
    const changed = () => setRoute(read())
    changed()
    window.addEventListener("popstate", changed)
    window.addEventListener(ROUTE_CHANGE, changed)
    return () => {
      window.removeEventListener("popstate", changed)
      window.removeEventListener(ROUTE_CHANGE, changed)
    }
  }, [role])
  const page = enabled ? route?.page || defaultPage(role) : demoPage
  const navigate = (next: string, projectId?: string) => {
    if (enabled) changeRoute(pagePath(role, next, projectId))
    else setDemoPage(next)
  }
  return { page, navigate, projectId: enabled ? route?.projectId : undefined }
}
