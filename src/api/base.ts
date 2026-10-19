// The published frontend and Express function share the same Vercel deployment.
export function resolveApiBase(configured: string | undefined, production: boolean): string {
  if (production) return "/api/v1"
  return configured?.trim().replace(/\/+$/, "") || "http://localhost:3000/api/v1"
}
