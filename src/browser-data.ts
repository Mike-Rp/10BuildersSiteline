// Older prototypes persisted full workspace snapshots. Remove those copies
// without touching the API token, sign-in throttling or other sites' settings.
export function clearStoredWorkspaceData() {
  for (const store of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[store]
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key && (/^siteline-(?:admin-)?workspace(?:-|$)/.test(key) || key === "siteline-extension-demo-v1")) keys.push(key)
      }
      keys.forEach(key => storage.removeItem(key))
    } catch { /* Storage access can be disabled; authentication still uses the API. */ }
  }
}

export function clearStoredAccountPreferences() {
  clearStoredWorkspaceData()
  for (const store of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[store]
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key && ["siteline-recent-projects:", "siteline-dashboard-greetings:", "siteline-dashboard-session-greeting:"].some(prefix => key.startsWith(prefix))) keys.push(key)
      }
      keys.forEach(key => storage.removeItem(key))
    } catch { /* Optional browser preferences never prevent sign-out. */ }
  }
}
