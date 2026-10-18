import type { Project, State } from "./model.ts"
import {
  projectSubcontractor,
  subcontractorRecommendations,
  workflowFor,
} from "./workflows.ts"

type Candidate = ReturnType<typeof subcontractorRecommendations>[number]

/** Approved companies the Lead can still contact, in the existing ranking order. */
export function eligibleCandidates(state: State, p: Project): Candidate[] {
  const declined = new Set(
    workflowFor(p)
      .selections.filter((s) => s.status === "declined")
      .map((s) => s.companyId),
  )
  const currentId = projectSubcontractor(p)?.companyId
  return subcontractorRecommendations(state, p).filter(
    (c) => !declined.has(c.company.id) && c.company.id !== currentId,
  )
}

/** The system's top pick, or undefined once a company is contacted/accepted or none is eligible. */
export function featuredCandidate(state: State, p: Project) {
  if (projectSubcontractor(p)) return undefined
  return eligibleCandidates(state, p)[0]
}

/** Short "why" line built only from the existing ranking factors. */
export function recommendationReason(candidate: Candidate, pool: Candidate[]) {
  const reasons = [
    candidate.committed
      ? "Conflicting commitment (best remaining option)"
      : "No conflicting commitment",
  ]
  const others = pool.filter((c) => c.company.id !== candidate.company.id)
  if (others.length) {
    if (others.every((c) => candidate.otherProjects <= c.otherProjects))
      reasons.push(
        candidate.otherProjects === 0
          ? "no other active projects"
          : "fewest other active projects",
      )
    if (
      candidate.availableManpower > 0 &&
      others.every((c) => candidate.availableManpower >= c.availableManpower)
    )
      reasons.push("most available workforce")
  } else {
    reasons.push(
      `${candidate.otherProjects} other active project${candidate.otherProjects === 1 ? "" : "s"}`,
    )
    reasons.push(
      candidate.availableManpower > 0
        ? `${candidate.availableManpower} manpower available`
        : "availability needs confirmation",
    )
  }
  return reasons.join(" · ")
}
