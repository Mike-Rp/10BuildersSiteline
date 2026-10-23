import { api, apiList, downloadBlob } from "./client.ts"
import type {
  HistoryRow,
  LicenseSelf,
  OverrideOptions,
  OverviewItem,
  ReassignRequest,
  RenewalQueueItem,
  WorkRecordRow,
} from "../licenseTypes.ts"

export const fetchMyLicense = () => api<LicenseSelf>("/licenses/me")
export const fetchRequests = () => api<ReassignRequest[]>("/licenses/requests")
// Pages of 100 so no single response is large; screens look engineers up by id, so every page is loaded.
export const fetchOverview = () => apiList<OverviewItem>("/licenses/overview")
export const fetchRenewals = (status = "under_review") => api<RenewalQueueItem[]>("/licenses/renewals?status=" + status)

export const verifyRenewal = (id: number, corrections: { license_number?: string; license_expiry?: string } = {}) =>
  api("/licenses/renewals/" + id + "/verify", { method: "POST", json: corrections })
export const rejectRenewal = (id: number, note: string) =>
  api("/licenses/renewals/" + id + "/reject", { method: "POST", json: { note } })
export const openRenewalFile = async (id: number) => {
  const blob = await downloadBlob("/licenses/renewals/" + id + "/file")
  if (!blob) throw new Error("The document is unavailable.")
  window.open(URL.createObjectURL(blob), "_blank", "noopener")
}

export const fetchOverrideOptions = (projectId: string, stageId?: number | null) =>
  api<OverrideOptions>(
    "/licenses/override-options?project_id=" + encodeURIComponent(projectId) + (stageId ? "&stage_id=" + stageId : ""),
  )
export const createOverride = (input: { projectId: string; stageId?: number | null; toUserId: string; reason: string }) =>
  api("/licenses/overrides", {
    method: "POST",
    json: { project_id: input.projectId, stage_id: input.stageId ?? null, to_user_id: input.toUserId, reason: input.reason },
  })
export const acceptRequest = (id: number) => api("/licenses/requests/" + id + "/accept", { method: "POST", json: {} })
export const declineRequest = (id: number, note: string) =>
  api("/licenses/requests/" + id + "/decline", { method: "POST", json: { note } })
export const fetchHistory = (projectId: string) => api<HistoryRow[]>("/licenses/history?project_id=" + encodeURIComponent(projectId))
export const fetchWorkRecord = (userId: string) => api<WorkRecordRow[]>("/licenses/work-record/" + encodeURIComponent(userId))
