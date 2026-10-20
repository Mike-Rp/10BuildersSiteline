import type { Project } from "./model.ts"

// These workflow fields contain the existing current review queue, not history.
export const hasPendingSiteReview = (project: Pick<Project, "status" | "workflow">) =>
  project.status === "active" &&
  Boolean(project.workflow?.pendingUpdate || project.workflow?.pendingRework)
