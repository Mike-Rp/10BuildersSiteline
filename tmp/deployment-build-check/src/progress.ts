import type { Project } from "./model.ts"

export type ProgressProject = Pick<Project, "id" | "name" | "progress" | "history">

// Preserve real observations, including decreases after rework. Never synthesize points.
export function recordedProgress(project: Pick<Project, "history">) {
  return project.history
    .map((entry) => ({
      date: entry.date,
      time: Date.parse(entry.date),
      progress: entry.progress,
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.time) &&
        Number.isFinite(entry.progress) &&
        entry.progress >= 0 &&
        entry.progress <= 100,
    )
    .sort((a, b) => a.time - b.time)
}
