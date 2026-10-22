import { adminDashboardOverview } from "./admin-dashboard.ts"
import { hasPendingSiteReview } from "./active-sites-review.ts"
import { intakeGuidance, intakeViewCounts, isIntake } from "./intake-guidance.ts"
import type { Account, State } from "./model.ts"
import { assignmentBlock, checklistFor, officePmStage, ownedProjects, workflowFor } from "./workflows.ts"

export type NavigationAttention = Record<string, { count: number; description: string }>

// Current authorized work, independent of notification read/mute state.
// Counts are records except Rework & approvals, whose existing queue counts review items.
export function navigationAttention(state: State, actor: Account): NavigationAttention {
  if (actor.role === "client") return {}
  if (actor.role === "admin") {
    const { items } = adminDashboardOverview(state)
    const count = (category: string) => items.filter(item => item.category === category).length
    const intakeCounts = intakeViewCounts(state.projects.filter(isIntake), project => intakeGuidance(state, project, actor))
    return {
      "Active sites": { count: count("updates"), description: "projects with pending reviews or blocked phase handoffs" },
      "Project intake": { count: intakeCounts.action, description: "intake records needing your action" },
      Directory: { count: count("requests"), description: "subcontractor requests awaiting approval" },
      Team: { count: count("licenses"), description: "active staff accounts with license alerts" },
    }
  }
  const projects = ownedProjects(state, actor)
  const active = projects.filter(project => project.status === "active")
  if (actor.role === "opm") {
    const stages = projects.map(project => officePmStage(project))
    return {
      "Confirmation queue": {
        count: stages.filter(stage => stage.kind === "action" && (stage.reason === "confirm" || stage.reason === "reassign")).length,
        description: "projects requiring your confirmation or Site PM reassignment",
      },
      Documents: { count: stages.filter(stage => stage.kind === "action" && stage.reason === "documents").length, description: "projects requiring your intake documents" },
      "Rework & approvals": {
        count: active.reduce((total, project) => {
          const work = workflowFor(project)
          return total + Number(Boolean(work.pendingUpdate)) + Number(Boolean(work.pendingRework)) + checklistFor(project).filter(item => item.status === "submitted").length
        }, 0),
        description: "pending progress, site issue, and QA/QC reviews",
      },
    }
  }
  return {
    Assignments: {
      count: projects.filter(project => !assignmentBlock(project, actor.id) && project.team.some(row => row.accountId === actor.id && row.status === "pending")).length,
      description: "projects requiring your phase assignment response",
    },
    "Active sites": { count: active.filter(hasPendingSiteReview).length, description: "assigned projects awaiting Office PM review" },
  }
}
