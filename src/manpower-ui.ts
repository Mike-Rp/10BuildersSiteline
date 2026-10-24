// Pure helpers for the manpower import screen (no React, no DOM, no xlsx) so they can be tested on their own.
import type { ImportIssue, ManpowerImportReport } from "./manpower-import.ts"

export const SHOWN_ISSUES = 50

// The body the server expects. `row` is the Excel row, so a server rejection points at the right spreadsheet row.
export function importPayload(report: ManpowerImportReport) {
  return report.workers.map((w) => ({
    row: w.row,
    id_number: w.idNumber,
    first_name: w.firstName,
    middle_name: w.middleName,
    last_name: w.lastName,
    suffix: w.suffix,
  }))
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`

// "2 new workers, 3 existing workers" for the preview. Blank and total rows are counted, never listed one by one.
export function previewCounts(report: ManpowerImportReport) {
  const blank = report.skipped.filter((s) => /blank/i.test(s.message)).length
  return {
    newCount: report.newCount,
    existingCount: report.existingCount,
    blankRows: blank,
    otherSkipped: report.skipped.length - blank,
    errors: report.errors.length,
    warnings: report.warnings.length,
  }
}
export function previewSentence(report: ManpowerImportReport) {
  const c = previewCounts(report)
  const parts = [plural(c.newCount, "new worker"), plural(c.existingCount, "existing worker")]
  if (c.blankRows) parts.push(plural(c.blankRows, "blank row") + " ignored")
  if (c.otherSkipped) parts.push(plural(c.otherSkipped, "total row") + " ignored")
  return parts.join(", ")
}

// Issues to show on screen: at most `limit`, with a count of the rest.
export function limitIssues(issues: ImportIssue[], limit = SHOWN_ISSUES) {
  return { shown: issues.slice(0, limit), hidden: Math.max(0, issues.length - limit) }
}

// A rejected upload carries { row, message }[]; anything else falls back to the plain message.
export function rejectionIssues(error: unknown): { issues: ImportIssue[]; message: string } {
  const rows = (error as { rows?: unknown })?.rows
  const issues = Array.isArray(rows)
    ? rows.filter((r): r is ImportIssue => typeof r?.row === "number" && typeof r?.message === "string")
    : []
  const message = error instanceof Error ? error.message : "The import failed. Nothing was saved."
  return { issues, message }
}

export type ListedWorker = { id_number: string; full_name: string; first_name?: string | null; last_name?: string | null; role_title?: string | null }
// Search by ID number or any part of the name, ignoring case and extra spaces.
export function filterWorkers<T extends ListedWorker>(workers: T[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return workers
  return workers.filter((w) => {
    const haystack = `${w.id_number} ${w.full_name} ${w.role_title ?? ""}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
