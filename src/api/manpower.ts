import { api } from "./client"

// Request/response shapes for POST /subcontractors/:id/workers/import and GET /subcontractors/:id/workers.
export type ImportWorkerBody = {
  row: number
  id_number: string
  first_name: string
  middle_name: string
  last_name: string
  suffix: string
}
export type ImportedWorkerResult = {
  row?: number
  id_number: string
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
}
export type ManpowerImportResult = { created: ImportedWorkerResult[]; updated: number; unchanged: number }
export type CompanyWorker = {
  id: string
  id_number: string
  full_name: string
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  suffix: string | null
  role_title: string | null
  status: string
}

export const importManpower = (companyId: string, workers: ImportWorkerBody[]) =>
  api<ManpowerImportResult>(`/subcontractors/${companyId}/workers/import`, { method: "POST", json: { workers } })

export const loadCompanyWorkers = (companyId: string) => api<CompanyWorker[]>(`/subcontractors/${companyId}/workers`)
