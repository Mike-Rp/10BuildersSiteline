// Published clients must never send requests to the visitor's loopback address.
export function resolveApiBase(configured: string | undefined, production: boolean): string {
  const fallback = production ? "/api/v1" : "http://localhost:3000/api/v1"
  const value = configured?.trim().replace(/\/+$/, "")
  if (!value) return fallback
  if (production) {
    try {
      const host = new URL(value, "https://siteline.invalid").hostname.toLowerCase()
      if (/^(?:localhost|.*\.localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)$/.test(host)) {
        return fallback
      }
    } catch {
      return fallback
    }
  }
  return value
}
