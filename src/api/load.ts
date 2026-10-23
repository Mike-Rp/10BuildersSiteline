import type { Account, Role, State } from "../model.ts"
import type { LicenseData } from "../licenseTypes.ts"
import { fetchMyLicense, fetchOverview, fetchRenewals, fetchRequests } from "./licenses.ts"
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
  type ProjectParts,
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

// License information is an add-on: if it cannot be read (for example the database is behind on migrations), the rest of
// the workspace still loads.
const tolerant = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await promise
  } catch (error) {
    if (error instanceof ApiError) return fallback
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
  // Catch up completed phases from older sessions and retry resolved blockers
  // before reading the confirmed workflow position. This never sends a phase or percentage.
  const handoffs = me.role === "client" ? [] : await api<{project_id:string;from:string;advanced:boolean;reason?:string}[]>(
    "/workspace/reconcile-phase-handoffs", {method:"POST",json:{}})
  const [projectData, subcontractors, notifications, workspace] = await Promise.all([
    api<Omit<ProjectParts,"clientId"|"register">[]>("/workspace/project-data"),
    optional(apiList<Dto>("/subcontractors"), []),
    optional(apiList<Dto>("/notifications"), []),
    optional(api<Dto>("/workspace"), {}),
  ])

  const projectList=projectData.map(p=>p.list)
  // Accounts: the admin lists everyone; other roles only know their own record.
  let accounts: Account[] = []
  const projectIdsByName = new Map(projectList.map((p) => [String(p.name).toLowerCase(), p.id as string]))
  if (me.role === "admin") {
    const list = await apiList<Dto>("/accounts")
    accounts = await pool(list, 6, async (a) => {
      const detail = workspace.accountDetails?.[a.id] || await optional(api<Dto>(`/accounts/${a.id}`), undefined as unknown as Dto)
      const mapped=mapAccount(a,detail,projectIdsByName)
      const metadata=workspace.accounts?.[a.id]||{}
      return {...mapped,...metadata,status:metadata.status==="deactivated"&&mapped.status==="suspended"?"deactivated":mapped.status} as Account
    })
  }
  const selfDetail = accounts.some(a=>a.id===me.id)?undefined:await optional(api<Dto>(`/accounts/${me.id}`), undefined as unknown as Dto)
  const self =
    accounts.find((a) => a.id === me.id) ||
    mapAccount(
      { id: me.id, full_name: me.full_name ?? "", email: me.email ?? "", role: me.role, status: "active", date_added: selfDetail?.date_added, phone: selfDetail?.phone },
      selfDetail,
      projectIdsByName,
    )

  const selfStatus=self.status
  Object.assign(self,workspace.accounts?.[me.id]||{})
  if(!(self.status==="deactivated"&&selfStatus==="suspended"))self.status=selfStatus
  // All permitted project data arrives in one request.
  const parts = projectData

  const details = new Map(parts.map((p) => [p.list.id as string, p.detail]))
  const people = peopleFromProjects(self, projectList, details, accounts)
  const projects = parts.map((p) =>
    mapProject({ ...p, list:{...p.list,...(workspace.projects?.[p.list.id]||{})}, detail:{...p.detail,workspace:workspace.projects?.[p.list.id]||{},selections:(workspace.selections||[]).filter((s:Dto)=>s.project_id===p.list.id)}, clientId: people.clientIds.get(p.list.id) || "", register: registerFileUrl }),
  )
  for(const project of projects) {
    const handoff=handoffs.find(item=>item.project_id===project.id && !item.advanced && item.from===project.phase)
    if(handoff?.reason)project.handoffBlocker=handoff.reason
  }
  // Client accounts see only their own projects.
  const finalAccounts = people.accounts.map((a) =>
    a.id === me.id && a.role === "client" ? { ...a, scope: projects.map((p) => p.id), status: "active" as const } : a,
  )
  if (!finalAccounts.some((a) => a.id === me.id)) finalAccounts.push(stubAccount(me.id, me.full_name ?? "", me.role))

  const loaded = buildState({
    me,
    accounts: finalAccounts,
    projects,
    companies: subcontractors.map((s) => ({...mapCompany(s, projectIdsByName),...(workspace.companies?.[s.id]||{})})),
    events: notifications.map((n) => mapEvent(n, me.role === "admin" ? undefined : me.id)),
  })
  const license: LicenseData = {}
  if (me.role === "opm" || me.role === "spm") {
    const [mine, requests] = await Promise.all([tolerant(fetchMyLicense(), undefined), tolerant(fetchRequests(), [])])
    license.self = mine
    license.requests = requests
    const self = loaded.accounts.find((a) => a.id === me.id)
    if (self && mine?.renewal?.status === "under_review") self.renewalUnderReview = true
  }
  if (me.role === "admin") {
    const [overview, renewals] = await Promise.all([tolerant(fetchOverview(), []), tolerant(fetchRenewals(), [])])
    license.overview = overview
    license.renewals = renewals
    const reviewing = new Set(renewals.map((r) => r.user_id))
    for (const account of loaded.accounts) if (reviewing.has(account.id)) account.renewalUnderReview = true
  }
  loaded.license = license
  if(workspace.rules)loaded.rules=workspace.rules
  if(workspace.preferences?.muted)loaded.muted=workspace.preferences.muted
  loaded.backendPhases=workspace.backendPhases
  loaded.referenceDisciplines=workspace.referenceDisciplines
  for(const account of loaded.accounts)for(const doc of account.docs)if(doc.uploaded)registerFileUrl(doc.id,"/api/v1/files/"+doc.id+"/content")
  for(const company of loaded.companies)for(const doc of [...company.documents,...company.manpowerDocuments])if(doc.uploaded)registerFileUrl(doc.id,"/api/v1/files/"+doc.id+"/content")
  return loaded
}
