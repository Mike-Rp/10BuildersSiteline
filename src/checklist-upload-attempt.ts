type Attempt = { lastUsed: number; signature: string; requestId: string; fileIds: string[] }

// Only identifiers, filenames, fingerprints, and the last retry time live in this tab. The user reselects the files after reload.
export async function checklistAttempt(scope: string, files: File[]): Promise<Attempt> {
  const identities = []
  for (const file of files) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))
    identities.push([file.name, Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("")])
  }
  const signature = JSON.stringify(identities)
  const key = "siteline:checklist:" + scope
  try {
    const prior = JSON.parse(sessionStorage.getItem(key) || "null") as Attempt | null
    if (prior?.signature === signature && Date.now() - prior.lastUsed < 7 * 24 * 60 * 60 * 1000 &&
        typeof prior.requestId === "string" && prior.fileIds?.length === files.length) {
      prior.lastUsed = Date.now()
      sessionStorage.setItem(key, JSON.stringify(prior))
      return prior
    }
  } catch { /* The upload dialog retains the attempt if browser storage is unavailable. */ }
  const attempt = {lastUsed: Date.now(), signature, requestId: crypto.randomUUID(), fileIds: files.map(() => crypto.randomUUID())}
  try { sessionStorage.setItem(key, JSON.stringify(attempt)) } catch { /* Private browsing or quota limit. */ }
  return attempt
}

export function forgetChecklistAttempt(scope: string) {
  try { sessionStorage.removeItem("siteline:checklist:" + scope) } catch { /* Storage may be unavailable. */ }
}
