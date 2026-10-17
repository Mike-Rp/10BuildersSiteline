import type { Account, Role, State } from "../model.ts"
import { api, apiList, ApiError, registerFileUrl } from "./client.ts"
import {
  buildState,
  mapAccount,
  mapCompany,
  mapEvent,
  mapProject,
  peopleFromProjects,
  stubAccount,
  type Dto,
} from "./adapter.ts"

const optional = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await promise
  } catch (error) {
    // A role may simply not be allowed to read something (403/404).
    if (error instanceof ApiError && [403, 404].includes(error.status)) return fallback
    throw error
  }
}

// Runs tasks a few at a time so a long project list does not flood the server.
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

// Everything the signed-in role may see, as the app's State.
export async function loadState(me: { id: string; role: Role; full_name?: string; email?: string }): Promise<State> {
  const [projectList, subcontractors, notifications] = await Promise.all([
    apiList<Dto>("/projects"),
    optional(apiList<Dto>("/subcontractors"), []),
    optional(apiList<Dto>("/notifications"), []),
  ])

  // Accounts: the admin lists everyone; other roles only know their own record.
  let accounts: Account[] = []
  const projectIdsByName = new Map(projectList.map((p) => [String(p.name).toLowerCase(), p.id as string]))
  if (me.role === "admin") {
    const list = await apiList<Dto>("/accounts")
    accounts = await pool(list, 6, async (a) => {
      const detail = await optional(api<Dto>(`/accounts/${a.id}`), undefined as unknown as Dto)
      return mapAccount(a, detail, projectIdsByName)
    })
  }
  const selfDetail = await optional(api<Dto>(`/accounts/${me.id}`), undefined as unknown as Dto)
  const self =
    accounts.find((a) => a.id === me.id) ||
    mapAccount(
      { id: me.id, full_name: me.full_name ?? "", email: me.email ?? "", role: me.role, status: "active", date_added: selfDetail?.date_added, phone: selfDetail?.phone },
      selfDetail,
      projectIdsByName,
    )

  // Per-project detail.
  const parts = await pool(projectList, 4, async (list) => {
    const id = list.id as string
    const [detail, documents, history, photos, notes, overview, assignments, contracts, pending] = await Promise.all([
      api<Dto>(`/projects/${id}`),
      optional(api<Dto[]>(`/projects/${id}/documents`), []),
      optional(api<Dto[]>(`/projects/${id}/history`), []),
      optional(api<Dto[]>(`/projects/${id}/photos`), []),
      optional(api<Dto[]>(`/projects/${id}/notes`), []),
      optional(api<Dto>(`/projects/${id}/phase-overview`), undefined as unknown as Dto),
      optional(api<Dto[]>(`/projects/${id}/subcontractor-assignments`), []),
      optional(api<Dto[]>(`/projects/${id}/contracts`), []),
      optional(api<Dto | null>(`/projects/${id}/progress-updates/pending`), null),
    ])
    return { list, detail, documents, history, photos, notes, overview, assignments, contracts, pending }
  })

  const details = new Map(parts.map((p) => [p.list.id as string, p.detail]))
  const people = peopleFromProjects(self, projectList, details, accounts)
  const projects = parts.map((p) =>
    mapProject({ ...p, clientId: people.clientIds.get(p.list.id) || "", register: registerFileUrl }),
  )
  // Client accounts see only their own projects.
  const finalAccounts = people.accounts.map((a) =>
    a.id === me.id && a.role === "client" ? { ...a, scope: projects.map((p) => p.id), status: "active" as const } : a,
  )
  if (!finalAccounts.some((a) => a.id === me.id)) finalAccounts.push(stubAccount(me.id, me.full_name ?? "", me.role))

  return buildState({
    me,
    accounts: finalAccounts,
    projects,
    companies: subcontractors.map((s) => mapCompany(s, projectIdsByName)),
    events: notifications.map((n) => mapEvent(n, me.role === "admin" ? undefined : me.id)),
  })
}
