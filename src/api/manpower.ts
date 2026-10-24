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

// A Site PM's list waiting for (or already given) an Admin's decision. Workers and ID numbers exist only once approved.
export type SubmissionStatus = "pending" | "approved" | "rejected" | "withdrawn"
export type ManpowerSubmission = {
  id: string
  subcontractor_id: string
  status: SubmissionStatus
  file_name: string | null
  new_count: number
  existing_count: number
  decision_note: string | null
  created_at: string
  decided_at: string | null
  result: ManpowerImportResult | null
  submitted_by: string
  submitted_by_name: string
  decided_by_name: string | null
  payload?: ImportWorkerBody[] // only when one submission is opened for review
}

export const submitManpower = (companyId: string, workers: ImportWorkerBody[], fileName: string) =>
  api<{ id: string; status: "pending"; new_count: number; existing_count: number }>(
    `/subcontractors/${companyId}/manpower-submissions`, { method: "POST", json: { workers, file_name: fileName } })
export const listManpowerSubmissions = (companyId: string) =>
  api<ManpowerSubmission[]>(`/subcontractors/${companyId}/manpower-submissions`)
export const getManpowerSubmission = (id: string) => api<ManpowerSubmission>(`/manpower-submissions/${id}`)
export const approveManpowerSubmission = (id: string) =>
  api<ManpowerImportResult>(`/manpower-submissions/${id}/approve`, { method: "POST", json: {} })
export const rejectManpowerSubmission = (id: string, reason: string) =>
  api<{ id: string; status: "rejected" }>(`/manpower-submissions/${id}/reject`, { method: "POST", json: { reason } })
export const withdrawManpowerSubmission = (id: string) =>
  api<{ id: string; status: "withdrawn" }>(`/manpower-submissions/${id}/withdraw`, { method: "POST", json: {} })
