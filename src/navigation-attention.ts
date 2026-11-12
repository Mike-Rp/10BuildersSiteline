import { adminDashboardOverview } from "./admin-dashboard.ts"
import { intakeGuidance, intakeViewCounts, isIntake } from "./intake-guidance.ts"
import type { Account, State } from "./model.ts"
import { checklistFor, officePmStage, ownedProjects, workflowFor } from "./workflows.ts"

export type NavigationAttention = Record<string, { count: number; description: string }>

// Current authorized work, independent of notification read/mute state.
// Tracking counts include waiting records. Office PM Active sites counts review items.
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
        count: projects.filter(project => isIntake(project) ||
          (project.status === "active" && project.team.some(row => row.engineers?.length
            ? row.engineers.some(engineer => engineer.status !== "confirmed") : row.status !== "confirmed"))).length,
        description: "projects in intake or with outstanding Site PM responses, including waiting records",
      },
      Documents: { count: stages.filter(stage => stage.kind === "action" && stage.reason === "documents").length, description: "projects requiring your intake documents" },
      "Active sites": {
        count: active.reduce((total, project) => {
          const work = workflowFor(project)
          const blocked = project.handoffReadiness?.state === "blocked" && project.handoffReadiness.reason &&
            ["current_assignment", "next_assignment", "next_scope"].includes(project.handoffReadiness.reasonCode || "")
          return total + Number(Boolean(blocked)) + Number(Boolean(work.pendingUpdate)) + Number(Boolean(work.pendingRework)) + checklistFor(project).filter(item => item.status === "submitted").length + (work.photos || []).filter(photo => photo.photoReviewStatus === "pending").length
        }, 0),
        description: "pending progress, site issue, QA/QC, site photo reviews, and assignment or scope blockers",
      },
    }
  }
  return {
    Assignments: {
      // The Assignments tab displays all owned projects, including upcoming,
      // accepted and additional-engineer assignments, not just response tasks.
      count: projects.length,
      description: "projects in your assignments",
    },
    "Active sites": { count: projects.length, description: "projects in your assignments, including upcoming and waiting records" },
  }
}
