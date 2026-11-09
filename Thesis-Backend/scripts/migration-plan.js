/**
 * Explicit order for migrations safe to apply through the general runner.
 * Data-sensitive and recovery migrations remain on their reviewed, dedicated
 * commands below so a directory listing can never decide what production runs.
 */
export const RUNNER_MIGRATIONS = Object.freeze([
  "001-phase-checklists.sql",
  "002-phase-update-confirmation.sql",
  "003-react-integration.sql",
  "004-project-type-workflows.sql",
  "010-photo-release.sql",
  "012-construction-phase-hold.sql",
  "013-trade-subcontractor-allocation.sql",
  "016-user-id-numbers.sql",
  "017-project-photo-review.sql",
  "018-phase-foreman-allocation.sql",
  "019-engineer-phase-commitments.sql",
  "020-engineer-phase-responsibilities.sql",
  "021-admin-recovery-codes.sql",
  "022-engineer-experience-months.sql",
  "023-engineer-reassignment-offers.sql",
])

export const DEDICATED_MIGRATIONS = Object.freeze({
  "028-storage-backed-files.sql": "Apply explicitly before using private Storage-backed files",
  "029-backup-monitoring.sql": "Additive metadata tables: apply explicitly before enabling backup monitoring; see docs/BACKUPS.md",
  "004-verified-activity-progress.sql": "Recovery only: review its prerequisites and apply explicitly",
  "004-verified-activity-values.sql": "Reviewed local dry run: scripts/migrate-verified-progress.js",
  "005-targeted-rework.sql": "Reviewed local dry run: scripts/migrate-targeted-rework.js",
  "006-standard-middle-phase-checklists.sql": "Apply explicitly after the approved phase rollout",
  "007-standard-phase-scope-revision.sql": "Reviewed local dry run: scripts/revise-standard-checklists.js",
  "008-monthly-report-history.sql": "Dry run first: scripts/migrate-monthly-reports.js",
  "009-engineer-license-workflow.sql": "Dry run first: scripts/migrate-license-workflow.js",
  "011-independent-notifications.sql": "Dry run first: scripts/migrate-notifications.js",
  "014-mixed-use-project-scope.sql": "Dry run first: scripts/migrate-mixed-use-scope.js",
  "015-engineer-credentials.sql": "Requires migration 009 and 014; apply after verifying both",
  "024-chunked-file-uploads.sql": "Apply explicitly before enabling chunked uploads",
  "025-independent-spm-workspaces.sql": "Apply explicitly before enabling independent SPM workspaces; requires 020",
  "027-workflow-reliability.sql": "Apply explicitly after reviewed 025/026; see docs/WORKFLOW-RELIABILITY.md",
  "026-credential-specializations.sql": "Apply explicitly before per-credential specialization entry; requires 015",
})

const LEGACY_NAME_ALIASES = Object.freeze({
  "003-react-integration.sql": ["003-integration-foundation.sql"],
  "004-project-type-workflows.sql": ["004-project-type-workflows"],
})

export function migrationPlan(files, appliedNames) {
  const known = new Set([...RUNNER_MIGRATIONS, ...Object.keys(DEDICATED_MIGRATIONS)])
  const unknown = files.filter(name => !known.has(name))
  if (unknown.length) throw new Error(`Migration manifest needs review for: ${unknown.join(", ")}`)

  const applied = new Set(appliedNames)
  const wasApplied = name => applied.has(name) || (LEGACY_NAME_ALIASES[name] || []).some(alias => applied.has(alias))
  const entries = []
  for (const name of RUNNER_MIGRATIONS) {
    if (!files.includes(name) || wasApplied(name)) continue
    if (name === "014-mixed-use-project-scope.sql" && !wasApplied("004-project-type-workflows.sql")) {
      throw new Error("Migration 014 requires 004-project-type-workflows.sql to be recorded as applied.")
    }
    if (name === "017-project-photo-review.sql" && !wasApplied("010-photo-release.sql")) {
      throw new Error("Migration 017 requires 010-photo-release.sql to be recorded as applied.")
    }
    if (name === "018-phase-foreman-allocation.sql" && !wasApplied("013-trade-subcontractor-allocation.sql")) {
      throw new Error("Migration 018 requires 013-trade-subcontractor-allocation.sql to be recorded as applied.")
    }
    if(name === "019-engineer-phase-commitments.sql" && !wasApplied("015-engineer-credentials.sql")) {
      throw new Error("Migration 019 requires 015-engineer-credentials.sql to be recorded as applied.")
    }
    if(name === "020-engineer-phase-responsibilities.sql" && !wasApplied("019-engineer-phase-commitments.sql")) throw new Error('Migration 020 requires migration 019.');
    if(name === "023-engineer-reassignment-offers.sql" && !wasApplied("020-engineer-phase-responsibilities.sql")) throw new Error('Migration 023 requires migration 020.');
    entries.push({ name, action: "runner" })
    applied.add(name)
  }

  for (const [name, instructions] of Object.entries(DEDICATED_MIGRATIONS)) {
    if (files.includes(name) && !wasApplied(name)) entries.push({ name, action: "dedicated", instructions })
  }
  return entries
}
