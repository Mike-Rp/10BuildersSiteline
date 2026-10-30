import { resolveApiBase } from "./base.ts"
import { currentLoginPortal, type LoginPortal } from "../login-portal.ts"
import { RequestTimeoutError, withRequestDeadline } from "./request-deadline.ts"

// The backend is required. Missing configuration never enables demo data.
let base = resolveApiBase(import.meta.env?.VITE_API_URL, Boolean(import.meta.env?.PROD))

export const apiEnabled = true
// Allows integration tests to point at their temporary backend.
export const setApiBase = (url: string) => {
  base = url.replace(/\/+$/, "")
}

const TOKEN_KEY = "siteline-api-token"
export const SESSION_REPLACED_EVENT = "siteline-session-replaced"
let memoryToken = ""

export function getToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || memoryToken
  } catch {
    return memoryToken
  }
}
export function setToken(token: string) {
  memoryToken = token
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* The token stays in memory for this tab. */
  }
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Envelope<T> = {
  code?: number
  message?: string
  count?: number
  data: T
}

async function request<T>(
  path: string,
  init: RequestInit,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  if (!base) throw new ApiError("The API address is not configured.", 0)
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json")
  try {
    return await withRequestDeadline(async signal => {
      const response = await fetch(base + path, { ...init, headers, signal, cache: "no-store" })
      signal.throwIfAborted()
      if (response.status === 401 && token && getToken() === token) {
        const error = await response.clone().json().catch(() => undefined)
        signal.throwIfAborted()
        setToken("")
        if (["SESSION_REPLACED", "SESSION_INACTIVE"].includes(error?.error?.code) && typeof window !== "undefined") {
          window.dispatchEvent(new window.CustomEvent(SESSION_REPLACED_EVENT, { detail: error.error.message }))
        }
      }
      if (response.status === 403 && token && getToken() === token) {
        const failure = await response.clone().json().catch(() => undefined)
        if (failure?.error?.code === "LICENSE_ACCESS_DISABLED") {
          setToken("")
          if (typeof window !== "undefined") window.dispatchEvent(new window.CustomEvent(SESSION_REPLACED_EVENT, { detail: failure.error.message }))
        }
      }
      return consume(response)
    }, { signal: init.signal, timeoutMs: init.body instanceof FormData ? 120_000 : 30_000 })
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof RequestTimeoutError) throw new ApiError(error.message, 0, "REQUEST_TIMEOUT")
    if (init.signal?.aborted) throw error
    throw new ApiError(
      "Cannot reach the server. Check that the backend is running.",
      0,
    )
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init
  return request(path, {
    ...rest,
    body: json === undefined ? rest.body : JSON.stringify(json),
  }, async response => {
    let body: Envelope<T> & { error?: { message?: string; code?: string } } | undefined
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    if (!response.ok)
      throw new ApiError(
        body?.error?.message ||
          body?.message ||
          `Request failed (${response.status}).`,
        response.status,
        body?.error?.code,
      )
    return (body?.data ?? body as unknown) as T
  })
}

// One page of a server-paginated list. Returns the whole envelope, because the
// total and page count live next to `data`. Pass a signal to cancel stale requests.
export async function apiEnvelope(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  return request(path, init, async response => {
    let body: { error?: { message?: string; code?: string }; message?: string } | undefined
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    if (!response.ok)
      throw new ApiError(
        body?.error?.message || body?.message || `Request failed (${response.status}).`,
        response.status,
        body?.error?.code,
      )
    return body
  })
}

// Lists: asks for large pages and follows page numbers until the data repeats.
export async function apiList<T = Record<string, any>>(
  path: string,
): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?"
  const size = 100
  const out: T[] = []
  let firstOfPrevious: unknown
  for (let page = 1; page <= 20; page++) {
    const rows = await api<T[]>(`${path}${sep}page=${page}&pageSize=${size}&limit=${size}&offset=${(page-1)*size}`)
    if (!Array.isArray(rows) || !rows.length) break
    const first = JSON.stringify(rows[0])
    if (first === firstOfPrevious) break
    firstOfPrevious = first
    out.push(...rows)
    if (rows.length < size) break
  }
  return out
}

export async function login(email: string, password: string, replaceSession = false, portal: LoginPortal = currentLoginPortal()) {
  const data = await api<{
    token: string
    user: {
      id: string
      full_name: string
      email: string
      role: "admin" | "opm" | "spm" | "client"
      status: string
      temp_password_issued: boolean
    }
  }>(portal === "client" ? "/auth/login" : `/auth/${portal}/login`, { method: "POST", json: { email: email.trim(), password, ...(replaceSession ? { replace_session: true } : {}) } })
  setToken(data.token)
  return data.user
}

export async function logout() {
  try {
    if (getToken()) await api("/auth/logout", { method: "POST" })
  } catch {
    /* The session is cleared locally either way. */
  } finally {
    setToken("")
  }
}

// Decodes the user id and role from the stored token (no verification: the
// server checks every request).
export function tokenUser(): {
  id: string
  role: string
} | undefined {
  const token = getToken()
  if (!token) return undefined
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    )
    const id = payload.sub || payload.details?.id
    const role = payload.details?.role
    if (payload.exp && payload.exp * 1000 < Date.now()) return undefined
    return id ? { id, role } : undefined
  } catch {
    return undefined
  }
}

// Authenticated download of any API path (for example a license renewal document).
export async function downloadBlob(path: string): Promise<Blob | undefined> {
  return request(path, {}, response => response.ok ? response.blob() : Promise.resolve(undefined))
}

// Authenticated file download (documents, photos).
const fileUrls = new Map<string, string>()
export const registerFileUrl = (
  docId: string,
  url: string | null | undefined,
) => {
  if (url) fileUrls.set(docId, url)
}
export async function downloadApiFile(
  docId: string,
): Promise<Blob | undefined> {
  const url = fileUrls.get(docId)
  if (!url) return undefined
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "")
  return downloadBlob(path)
}
