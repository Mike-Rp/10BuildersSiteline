import { api } from "./client"
import type { Doc } from "../model"

export type ProjectCompanyAllocation = {
  version: 1
  revision: number
  status: "awaiting_decision" | "accepted" | "declined" | "no_eligible_company"
  company?: { id: string; name: string }
  history: { id: string; company_name: string; decision: "accepted" | "declined" }[]
  can_record_decision: boolean
  can_reallocate: boolean
  can_upload_agreement: boolean
}

export type OverlapItem = {
  id: string
  title: string
  status: "missing" | "submitted" | "approved" | "rework_required"
  can_submit: boolean
  can_review: boolean
  blocker?: string
  evidence_id?: string
  review_note?: string
  responsibility_totals?: { approved: number; required: number }
  attachments?: Doc[]
}

export type OverlapResponsibility = {
  id: string
  user_id: string
  name: string
  scopes: string[]
  assignment_status: "confirmed" | "pending" | "declined"
  upload_access: "open" | "parallel" | "locked"
  blocker?: string
  can_approve_parallel_uploads: boolean
  items: OverlapItem[]
}

export type OverlapMonitoring = {
  version: 1
  arrangement: string
  active_checklist: { approved: number; required: number }
  turnover: { can_confirm: boolean; stage_id: string; blocker?: string }
  phases: {
    name: string
    status: "active" | "upcoming" | "completed"
    responsibilities: OverlapResponsibility[]
  }[]
}

const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`

export function respondToAllocatedCompany(id: string, allocation: ProjectCompanyAllocation, action: "accept" | "decline" | "reallocate") {
  return api(`${projectPath(id)}/project-company-allocation`, { method: "POST", json: {
    action, expected_revision: allocation.revision, company_id: allocation.company?.id,
  } })
}

export function approveParallelUploads(id: string, responsibilityId: string, stageId: string) {
  return api(`${projectPath(id)}/parallel-upload-approvals`, { method: "POST", json: {
    responsibility_id: responsibilityId, expected_active_stage_id: stageId,
  } })
}

export function confirmMonitoringTurnover(id: string, stageId: string) {
  return api(`${projectPath(id)}/advance-phase`, { method: "POST", json: { expected_stage_id: stageId } })
}
