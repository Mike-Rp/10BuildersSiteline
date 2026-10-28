// Shared by the API and browser. Rows come from buildMonthlyReport, one per authorized project,
// so every figure here is a projection of the per-project report, never a separate calculation.
export const SUMMARY_FILTERS = { search: "", type: "", outstanding: "all" };
const OUTSTANDING = ["all", "pending", "none"];

const pendingTotal = pending => pending ? pending.evidence + pending.reports + pending.rework : null;
const listNames = names => names.length <= 5 ? names.join("; ") : `${names.slice(0, 5).join("; ")}; and ${names.length - 5} more`;
const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
export const formatPoints = value => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)} pts`;

// Site PMs see aggregate progress and pending reviews for their phases only; clients see progress and completion.
export const summaryMetrics = projection => ({
  approvals: projection === "staff",
  rework: projection === "staff",
  pending: projection !== "client",
});

export function summaryRow(report) {
  const opening = report.opening.percentage, closing = report.closing.percentage;
  const row = {
    id: report.project.id, name: report.project.name, type: report.project.type || "Unspecified", status: report.project.status,
    opening, closing,
    change: report.netChange,
    // Equal-scope comparisons only: a revised scope changes the denominator, so the difference is not a progress change.
    changeNote: report.netChange !== null ? null : opening !== null && closing !== null ? "Scope revised during the month" : "Historical progress unavailable",
    completedPhases: report.completedPhases ? report.completedPhases.map(p => ({ phase: p.phase, date: p.date, stillComplete: p.stillComplete })) : null,
    limited: report.limitations.length > 0,
  };
  const metrics = summaryMetrics(report.projection);
  if (metrics.approvals) row.approvals = report.approvals?.events ?? null;
  if (metrics.rework) row.rework = report.rework?.confirmed ?? null;
  if (metrics.pending) row.pending = report.pending ? { ...report.pending } : null;
  return row;
}

export function buildMonthlySummary({ reports, period, projection, excludedAfterCutoff = 0 }) {
  const rows = reports.map(summaryRow).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const scope = projection === "client" ? "projects linked to your account that are active or archived"
    : projection === "site" ? "projects you are assigned to; pending reviews count only your assigned phases"
      : "projects you are authorized to view";
  return {
    period, projection,
    inclusion: {
      included: rows.length, excludedAfterCutoff,
      rule: `Includes ${scope} that existed before the reporting cutoff, including projects with no activity this month. Projects created on or after the cutoff are excluded.`,
    },
    rows,
  };
}

export function normalizeSummaryFilters(filters = {}) {
  const text = value => typeof value === "string" ? value.trim().slice(0, 120) : "";
  return { search: text(filters.search), type: text(filters.type), outstanding: OUTSTANDING.includes(filters.outstanding) ? filters.outstanding : "all" };
}

export function filterSummaryRows(rows, filters) {
  const { search, type, outstanding } = normalizeSummaryFilters(filters);
  const query = search.toLocaleLowerCase();
  return rows.filter(row => (!query || row.name.toLocaleLowerCase().includes(query)) && (!type || row.type === type)
    && (outstanding === "all" || (outstanding === "pending" ? pendingTotal(row.pending) > 0 : pendingTotal(row.pending) === 0)));
}

// Sums only the projects with a recorded value; a total built from fewer projects is marked partial.
function total(rows, pick) {
  const values = rows.map(pick).filter(value => value !== null && value !== undefined);
  return { value: values.length ? values.reduce((sum, value) => sum + value, 0) : null, contributing: values.length, of: rows.length, partial: values.length < rows.length };
}

export function summarizeRows(rows, projection) {
  const metrics = summaryMetrics(projection);
  const pendingRows = rows.filter(row => row.pending);
  return {
    projects: rows.length,
    completedPhases: total(rows, row => row.completedPhases?.length ?? null),
    approvals: metrics.approvals ? total(rows, row => row.approvals) : null,
    rework: metrics.rework ? total(rows, row => row.rework) : null,
    pending: metrics.pending ? {
      ...total(rows, row => pendingTotal(row.pending)),
      evidence: pendingRows.reduce((sum, row) => sum + row.pending.evidence, 0),
      reports: pendingRows.reduce((sum, row) => sum + row.pending.reports, 0),
      rework: pendingRows.reduce((sum, row) => sum + row.pending.rework, 0),
    } : null,
  };
}

// Statements are generated only from recorded figures. No causes, delays or schedule performance are inferred.
export function summaryHighlights(rows, projection) {
  const metrics = summaryMetrics(projection), during = [], outstanding = [], coverage = [];
  const increased = rows.filter(row => row.change > 0).sort((a, b) => b.change - a.change || a.name.localeCompare(b.name));
  during.push(increased.length
    ? `${plural(increased.length, "project")} recorded a verified progress increase: ${listNames(increased.map(row => `${row.name} (${formatPoints(row.change)})`))}.`
    : "No project recorded a verified progress increase.");
  const phases = rows.flatMap(row => (row.completedPhases || []).map(phase => ({ ...phase, project: row.name })));
  during.push(phases.length
    ? `${plural(phases.length, "phase")} reached verified completion: ${listNames(phases.map(p => `${p.project} — ${p.phase}${p.stillComplete ? "" : " (no longer complete at cutoff)"}`))}.`
    : "No phase reached verified completion.");
  if (metrics.approvals) {
    const approved = rows.filter(row => row.approvals > 0);
    if (approved.length) during.push(`${plural(approved.reduce((sum, row) => sum + row.approvals, 0), "approval event")} across ${plural(approved.length, "project")}.`);
  }
  if (metrics.rework) {
    const rework = rows.filter(row => row.rework > 0);
    during.push(rework.length
      ? `${plural(rework.reduce((sum, row) => sum + row.rework, 0), "rework request")} confirmed: ${listNames(rework.map(row => `${row.name} (${row.rework})`))}.`
      : "No rework was confirmed.");
  }
  if (metrics.pending) {
    const scope = projection === "site" ? " in your assigned phases" : "";
    for (const [key, label] of [["evidence", "evidence review"], ["reports", "progress report review"], ["rework", "rework review"]]) {
      const waiting = rows.filter(row => row.pending?.[key] > 0);
      outstanding.push(waiting.length
        ? `${plural(waiting.reduce((sum, row) => sum + row.pending[key], 0), `pending ${label}`)}${scope}: ${listNames(waiting.map(row => `${row.name} (${row.pending[key]})`))}.`
        : `No pending ${label}s${scope}.`);
    }
  }
  const unavailable = rows.filter(row => row.limited);
  if (unavailable.length) coverage.push(`Historical values are incomplete for ${plural(unavailable.length, "project")}: ${listNames(unavailable.map(row => row.name))}. Their missing figures show as Unavailable and are left out of totals.`);
  return { during, outstanding, coverage };
}

// The single view shown on screen and exported: the same rows, filters, totals and statements.
export function summaryView(summary, filters) {
  const applied = normalizeSummaryFilters(filters);
  // A projection without pending reviews has no outstanding filter to apply.
  if (!summaryMetrics(summary.projection).pending) applied.outstanding = "all";
  const rows = filterSummaryRows(summary.rows, applied);
  return { filters: applied, rows, totals: summarizeRows(rows, summary.projection), highlights: summaryHighlights(rows, summary.projection) };
}
