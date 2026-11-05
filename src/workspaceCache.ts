import type { State } from "./model.ts"
import { fileUrlSnapshot, restoreFileUrls } from "./api/client.ts"

// The last workspace this tab loaded, so a refresh can show it while the real load runs.
// Tab-scoped like the sign-in token (sessionStorage): it is gone when the tab closes and on sign-out.
// The server stays authoritative; this is only ever shown until the fresh load replaces it.
const KEY = "siteline-workspace-cache"

// A new deploy may change the shape of State, so a copy saved by another build is never shown.
declare const __SITELINE_BUILD__: string | undefined
const BUILD = typeof __SITELINE_BUILD__ === "undefined" ? "test" : __SITELINE_BUILD__

type Saved = { build: string; userId: string; mustReset: boolean; state: State; fileUrls: Record<string, string> }

export function clearWorkspaceCache() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* Nothing was stored. */
  }
}

export function saveWorkspaceCache(userId: string, state: State, mustReset: boolean) {
  try {
    const saved: Saved = { build: BUILD, userId, mustReset, state, fileUrls: fileUrlSnapshot() }
    sessionStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // Too large or storage unavailable: drop any older copy so a refresh just loads normally.
    clearWorkspaceCache()
  }
}

export function readWorkspaceCache(userId: string): { state: State; mustReset: boolean } | undefined {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null") as Saved | null
    if (!saved || saved.build !== BUILD || saved.userId !== userId || !Array.isArray(saved.state?.accounts)) return undefined
    restoreFileUrls(saved.fileUrls || {})
    return { state: saved.state, mustReset: saved.mustReset === true }
  } catch {
    return undefined
  }
}
