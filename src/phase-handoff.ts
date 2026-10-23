import { projectPhaseNames, type Account, type Project } from "./model.ts"

export function phaseHandoff(project: Project, actor: Pick<Account, "id" | "role">) {
  const phases = projectPhaseNames(project)
  const index = phases.indexOf(project.phase)
  const totals = project.verifiedProgress?.phases.filter(row => row.name === project.phase)
  const current = totals?.length === 1 ? totals[0] : undefined
  const authorized = actor.role === "opm" && actor.id === project.opmId && project.opmAccepted && project.status === "active"
  const complete = !!current && !current.reason && current.total !== null && current.total > 0 &&
    current.earned === current.total && current.percentage === 100
  const validSequence = index >= 0 && new Set(phases).size === phases.length
  return { authorized, complete, next: validSequence ? phases[index + 1] : undefined,
    final: validSequence && index === phases.length - 1,
    available: !!current && current.percentage !== null && !current.reason }
}
