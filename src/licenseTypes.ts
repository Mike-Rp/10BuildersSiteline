// Shapes returned by the license endpoints (Thesis-Backend/src/services/licenses). Dates are YYYY-MM-DD.
export type LicenseRenewal = {
  id: number
  status: "under_review" | "verified" | "rejected"
  submittedAt: string
  reviewedAt?: string | null
  reviewNote?: string | null
  licenseExpiry?: string
}
export type LicenseSelf = {
  status: "valid" | "expiring_soon" | "expired" | "renewal_under_review" | "missing"
  base: string
  restricted: boolean
  expiry: string | null
  daysToExpiry: number | null
  graceEndsOn: string | null
  graceDaysLeft: number | null
  graceEnded: boolean
  graceDays: number
  reminderDays: number[]
  licenseNumber: string | null
  renewal: LicenseRenewal | null
}
export type OverviewAssignment = {
  projectId: string
  projectName: string
  stageId: number | null
  stage: string | null
  role: "spm" | "opm"
  isLead: boolean
  pendingOverrideId: number | null
}
export type OverviewItem = {
  id: string
  name: string
  role: "spm" | "opm"
  status: LicenseSelf["status"]
  expiry: string | null
  daysToExpiry: number | null
  restricted: boolean
  graceEnded: boolean
  graceEndsOn: string | null
  graceDaysLeft: number | null
  assignments: OverviewAssignment[]
  needsCover: boolean
}
export type RenewalQueueItem = {
  id: number
  user_id: string
  full_name: string
  role: "spm" | "opm"
  license_number: string
  license_expiry: string
  status: LicenseRenewal["status"]
  submitted_at: string
  reviewed_at?: string | null
  review_note?: string | null
}
export type ReassignRequest = {
  id: number
  projectId: string
  projectName: string
  stageId: number | null
  stage: string | null
  role: "spm" | "opm"
  title: string
  reason: string
  responseDeadlineAt: string | null
  summary: { approved: number | null; required: number | null; pct: number | null; pendingUpdates: number; pendingEvidence: number }
}
export type OverrideCandidate = {
  id: string
  name: string
  email?: string
  phone?: string | null
  workload: number
  matchPercent: number
  licenseExpiry: string | null
  expiresBeforeProjectEnd: boolean
  best: boolean
}
export type OverrideOptions = {
  project: { id: string; name: string; targetEndDate: string | null }
  role: "spm" | "opm"
  stageId: number | null
  stage: string | null
  isLead: boolean
  current: {
    id: string
    name: string
    status: string
    expiry: string | null
    graceEndsOn: string | null
    graceEnded: boolean
    restricted: boolean
    reason: string | null
  }
  available: boolean
  pending: { id: number; to_user_id: string; to_name: string; response_deadline_at: string } | null
  // Earlier requests for this assignment, with the Administrator-only reason.
  previous: {
    id: number
    status: string
    reason: string
    requested_at: string
    responded_at: string | null
    response_note: string | null
    from_name: string
    to_name: string
  }[]
  summary: ReassignRequest["summary"]
  candidates: OverrideCandidate[]
}
export type HistoryRow = {
  id: number
  stage_id: number | null
  stage: string | null
  role: "spm" | "opm"
  user_id: string
  name: string
  kind: "original" | "took_over"
  started_at: string
  ended_at: string | null
  completed_at: string | null
  label: string
}
export type WorkRecordRow = {
  id: number
  project_id: string
  project_name: string
  stage: string | null
  role: "spm" | "opm"
  kind: "original" | "took_over"
  started_at: string
  ended_at: string | null
  completed_at: string | null
  label: string
}
export type LicenseData = {
  self?: LicenseSelf
  requests?: ReassignRequest[]
  overview?: OverviewItem[]
  renewals?: RenewalQueueItem[]
}
