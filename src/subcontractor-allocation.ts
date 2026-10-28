import {
  phaseDefinitions,
  projectPhaseNames,
  type State,
  type Project,
} from "./model.ts"
import { companyTradePhases } from "../Thesis-Backend/src/domain/company-trades.js"
import {
  validatePlan,
  type AllocationPlan,
  type AllocationPhase,
  type AllocationCandidate,
} from "../Thesis-Backend/src/domain/subcontractor-allocation.js"
export {
  compareCandidatePreference,
  requiredCompanies,
  eligibility,
  scopeFor,
  recommendTeam,
  replacementCandidates,
  replaceCompany,
  protectScope,
  validatePlan,
} from "../Thesis-Backend/src/domain/subcontractor-allocation.js"
export type { AllocationPlan, AllocationCandidate }
export type SavedAllocation = AllocationPlan & {
  version: 1
  revision: number
  requirements: AllocationPhase[]
}
export function tradeAllocationEnabled(state: State, project: Project) {
  return (
    !!project.subcontractorAllocation ||
    project.subcontractorAllocationVersion === 1 ||
    (!!state.tradeAllocationAvailable &&
      project.status === "pending" &&
      !project.clientSubcon &&
      !project.workflow?.selections.some((s) =>
        ["accepted", "contacted"].includes(s.status),
      ))
  )
}
export function allocationPhases(state: State, project: Project) {
  // A saved plan is a scope snapshot, including plans made before this catalog.
  if (project.subcontractorAllocation?.requirements) return project.subcontractorAllocation.requirements
  const phases = project.phaseScope
    ? projectPhaseNames(project).map(name => ({ name }))
    : state.backendPhases?.[project.type] || phaseDefinitions(project.type)
  return companyTradePhases(project.type, phases)
}
export function allocationCandidates(
  state: State,
  project: Project,
): AllocationCandidate[] {
  return state.companies.map((company) => {
    const localCommitments = state.projects
      .filter(
        (p) =>
          p.status !== "completed" &&
          p.status !== "declined" &&
          p.id !== project.id &&
          (company.activeProjectIds.includes(p.id) ||
            p.workflow?.selections.some(
              (s) => s.companyId === company.id && s.status === "accepted",
            )),
      )
      .map((p) => p.id)
    const alreadyReserved =
      company.activeProjectIds.includes(project.id) ||
      !!project.workflow?.selections.some(
        (s) => s.companyId === company.id && s.status === "accepted",
      )
    return {
      id: company.id,
      name: company.name,
      status: company.status,
      disciplines: company.capabilityReview?.disciplines || [],
      reviewed: !!company.capabilityReview?.reviewedAt,
      unavailable: !!company.capabilityReview?.unavailable,
      commitments:
        company.commitmentCount === undefined
          ? new Set([
              ...company.activeProjectIds.filter(
                (id) =>
                  id !== project.id &&
                  !state.projects.some(
                    (p) => p.id === id && p.status === "completed",
                  ),
              ),
              ...localCommitments,
            ]).size
          : Math.max(0, company.commitmentCount - Number(alreadyReserved)),
      declined: !!project.workflow?.selections.some(
        (s) => s.companyId === company.id && s.status === "declined",
      ),
    }
  })
}
export function allocationConsented(state: State, project: Project) {
  const plan = project.subcontractorAllocation
  if (!plan) return false
  try {
    validatePlan(
      project.type,
      allocationPhases(state, project),
      plan,
      allocationCandidates(state, project),
    )
  } catch {
    return false
  }
  return plan.companyIds.every((id) =>
    project.workflow?.selections.some(
      (s) => s.companyId === id && s.status === "accepted",
    ),
  )
}
export function canReleaseCompany(project: Project, companyId: string) {
  const plan = project.subcontractorAllocation
  if (!plan || project.status !== "active") return false
  const sequence = plan.requirements.map((p) => p.name),
    current = sequence.indexOf(project.phase)
  return (
    current >= 0 &&
    plan.coverage
      .filter((r) => r.companyId === companyId)
      .every((r) => sequence.indexOf(r.phase) < current) &&
    projectPhaseNames(project).includes(project.phase)
  )
}
