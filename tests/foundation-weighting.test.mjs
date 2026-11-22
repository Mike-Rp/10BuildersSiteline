import test from "node:test"
import assert from "node:assert/strict"
import {
  projectProgress, phaseProjectWeights, projectPointsPerActivityPoint, reworkImpact,
  FOUNDATION_WEIGHTING, FOUNDATION_PROJECT_WEIGHT,
} from "../Thesis-Backend/src/domain/verified-progress.js"
import { standardActivities } from "../Thesis-Backend/src/domain/standard-phase-checklist.js"
import { overallChecklistProgress } from "../src/project-progress.ts"
import { reportBalance } from "../Thesis-Backend/src/domain/monthly-report.js"

const TYPES = {
  Residential: ["Mobilization", "Design", "Foundation", "Structure", "Envelope", "MEP Rough-In", "Finishes", "Landscape & Site Works", "Closeout"],
  Commercial: ["Mobilization", "Design", "Foundation", "Structure", "Envelope / Curtain Wall", "MEP Rough-In", "Fire & Life Safety", "Fit-Out / Finishes", "Closeout"],
  "Mixed-Use": ["Mobilization", "Design", "Foundation", "Podium Structure", "Tower Structure", "Envelope / Curtain Wall", "MEP Rough-In", "Fire & Life Safety", "Retail/Commercial Fit-Out", "Residential Fit-Out", "Landscape & Site Works", "Closeout"],
}
const W = FOUNDATION_WEIGHTING
// Build verified phases from the standard checklist. approved(name, activityIndex) decides which activities are approved.
const build = (names, approved = () => true, foundationWeights) => names.map((name, position) => {
  const activities = name === "Foundation" && foundationWeights
    ? foundationWeights.map((weight, i) => ({ code: String(i), weight }))
    : standardActivities(position, names.length)
  return {
    id: `p${position}`, name, configured: true,
    activities: activities.map((a, i) => ({
      id: `${position}:${i}`, required: true, weight: a.weight, status: approved(name, i) ? "approved" : "pending", approvalValid: true,
    })),
  }
})
const ids = phases => phases.map(p => p.id)

test("Foundation contributes 0, 9 and 15 percentage points at 0%, 60% and 100% verified completion", () => {
  for (const [type, names] of Object.entries(TYPES)) {
    // Foundation activities weighted 6 + 4, so approving the first one is exactly 60% verified.
    for (const [first, second, expected] of [[false, false, 0], [true, false, 9], [true, true, 15]]) {
      const phases = build(names, (name, i) => name === "Foundation" && (i === 0 ? first : second), [6, 4])
      const result = projectProgress(phases, ids(phases), { weighting: W })
      assert.ok(Math.abs(result.earned - expected) < 1e-9, `${type}: Foundation ${expected} points, got ${result.earned}`)
      assert.equal(result.total, 100)
      assert.ok(Math.abs(result.percentage - expected) < 1e-9)
    }
  }
})

test("applicable phase weights add up to 100 and Foundation is 15", () => {
  const scopes = {
    ...TYPES,
    "Mixed-Use without Design, Fire & Life Safety and Landscape": TYPES["Mixed-Use"].filter(n => !["Design", "Fire & Life Safety", "Landscape & Site Works"].includes(n)),
  }
  for (const [label, names] of Object.entries(scopes)) {
    const phases = build(names)
    const weights = phaseProjectWeights(phases, ids(phases), W)
    assert.equal(weights.size, names.length, label)
    assert.ok(Math.abs([...weights.values()].reduce((a, b) => a + b, 0) - 100) < 1e-9, `${label} sums to 100`)
    assert.equal(weights.get(`p${names.indexOf("Foundation")}`), FOUNDATION_PROJECT_WEIGHT)
  }
})

test("other phases share the remaining 85% in proportion to their required weights", () => {
  const phases = build(TYPES.Residential)
  const weights = phaseProjectWeights(phases, ids(phases), W)
  // Mobilization and Closeout carry 40 weight; the six other standard phases carry 30 each: pool 260.
  assert.ok(Math.abs(weights.get("p0") - 85 * 40 / 260) < 1e-9)
  assert.ok(Math.abs(weights.get("p1") - 85 * 30 / 260) < 1e-9)
  assert.ok(Math.abs(weights.get("p8") - 85 * 40 / 260) < 1e-9)
})

test("a fully verified project is exactly 100% for every type, including a Mixed-Use scope with excluded phases", () => {
  const scopes = {
    ...TYPES,
    "Mixed-Use (excluded phases)": TYPES["Mixed-Use"].filter(n => !["Podium Structure", "Retail/Commercial Fit-Out", "Landscape & Site Works"].includes(n)),
  }
  for (const [label, names] of Object.entries(scopes)) {
    const phases = build(names)
    const full = projectProgress(phases, ids(phases), { weighting: W })
    assert.equal(full.earned, 100, label)
    assert.equal(full.total, 100, label)
    assert.equal(full.percentage, 100, label)
    assert.equal(full.reason, null)
    assert.equal(projectProgress(build(names, () => false), ids(phases), { weighting: W }).percentage, 0, label)
  }
})

test("a partly verified phase earns its share of that phase's project weight", () => {
  // Design: 2 of 3 activities approved. Its project weight is 85 * 30 / 260, and two thirds of it counts.
  const phases = build(TYPES.Commercial, (name, i) => name === "Design" && i < 2)
  const result = projectProgress(phases, ids(phases), { weighting: W })
  assert.ok(Math.abs(result.earned - (85 * 30 / 260) * 2 / 3) < 1e-9)
})

test("rework withdrawal reduces the project by the phase's weight", () => {
  const phases = build(TYPES.Residential, name => name === "Foundation" || name === "Design")
  // Foundation has three activities of weight 10, so each activity point is worth 15 / 30 = 0.5 project points.
  assert.equal(projectPointsPerActivityPoint(phases, ids(phases), W, "p2"), 0.5)
  const impact = reworkImpact(phases, ids(phases), ["2:0"], { weighting: W })
  assert.equal(impact.before.earned, projectProgress(phases, ids(phases), { weighting: W }).earned)
  assert.ok(Math.abs(impact.before.earned - impact.after.earned - 5) < 1e-9, "withdrawing one 10-point activity removes 5 project points")
  // Legacy projects keep one-for-one points.
  assert.equal(projectPointsPerActivityPoint(phases, ids(phases), null, "p2"), 1)
  const legacy = reworkImpact(phases, ids(phases), ["2:0"])
  assert.equal(legacy.before.earned - legacy.after.earned, 10)
})

test("legacy projects and projects without Foundation keep the original calculation", () => {
  const phases = build(TYPES.Residential, name => name === "Foundation")
  const legacy = projectProgress(phases, ids(phases))
  assert.equal(legacy.total, 290, "legacy pools every required weight")
  assert.equal(legacy.earned, 30)
  assert.equal(projectProgress(phases, ids(phases), { weighting: "legacy" }).earned, 30)
  const noFoundation = build(TYPES.Residential.filter(n => n !== "Foundation"))
  assert.equal(phaseProjectWeights(noFoundation, ids(noFoundation), W), null)
  assert.equal(projectProgress(noFoundation, ids(noFoundation), { weighting: W }).percentage, 100)
})

test("the count-based overall figure on the project progress card applies the same weighting", () => {
  const names = TYPES.Residential
  const rows = approvedFor => names.map((name, position) => {
    const required = standardActivities(position, names.length).length
    return { id: `p${position}`, name, configured: true, required, approved: approvedFor(name, required), status: "Ongoing", locked: false }
  })
  assert.equal(overallChecklistProgress(names, rows((n, r) => r), W).percentage, 100)
  assert.equal(overallChecklistProgress(names, rows(() => 0), W).percentage, 0)
  const foundationOnly = rows((n, r) => (n === "Foundation" ? r : 0))
  assert.ok(Math.abs(overallChecklistProgress(names, foundationOnly, W).percentage - 15) < 1e-9, "a fully verified Foundation is worth 15 points")
  assert.ok(Math.abs(overallChecklistProgress(names, foundationOnly).percentage - 3000 / 290) < 1e-9, "legacy is unchanged")
})

test("the monthly report balance uses the project's stored weighting", () => {
  const names = TYPES.Residential
  const stateFor = weighting => {
    const stages = names.map((code, i) => ({ id: i + 1, code }))
    const items = [], evidence = []
    names.forEach((name, position) => standardActivities(position, names.length).forEach((a, i) => {
      const id = position * 10 + i + 1
      items.push({ id, project_stage_id: position + 1, required: true, weight: a.weight })
      if (name === "Foundation") evidence.push({ id, checklist_item_id: id, status: "approved", reviewed_by: "u", reviewed_at: "2026-11-01" })
    }))
    return {
      projects: [{ id: "x", project_type_id: 1, ...(weighting ? { progress_weighting: weighting } : {}) }],
      project_type_stages: stages.map((s, i) => ({ project_type_id: 1, project_stage_id: s.id, sort_order: i })),
      project_stages: stages,
      project_phase_checklists: stages.map(s => ({ project_stage_id: s.id })),
      project_phase_checklist_items: items, project_phase_evidence: evidence, project_phase_team: [],
    }
  }
  const weighted = reportBalance(stateFor(W)).project
  assert.ok(Math.abs(weighted.earned - 15) < 1e-9 && weighted.total === 100, "new projects: Foundation at 100% is 15 points")
  const legacy = reportBalance(stateFor("legacy")).project
  assert.equal(legacy.earned, 30)
  assert.equal(legacy.total, 290)
  assert.equal(reportBalance(stateFor(undefined)).project.total, 290, "snapshots without the flag stay legacy")
})
