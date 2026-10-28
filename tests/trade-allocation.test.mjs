import assert from "node:assert/strict"
import test from "node:test"
import {
  requiredCompanies,
  eligibility,
  recommendTeam,
  validatePlan,
  protectScope,
  replacementCandidates,
  replaceCompany,
  scopeFor,
} from "../Thesis-Backend/src/domain/subcontractor-allocation.js"
import {
  allocationCandidates,
  allocationConsented,
  canReleaseCompany,
} from "../src/subcontractor-allocation.ts"
import { activeFixture, currentProject, execute } from "./fixtures.mjs"
import { phaseDefinitions, DISCIPLINES } from "../src/model.ts"
import { COMPANY_TRADES } from "../Thesis-Backend/src/domain/company-trades.js"

const phases = [
  { name: "Mobilization", disciplines: ["Civil"] },
  { name: "Structure", disciplines: ["Structural"] },
  { name: "MEP", disciplines: ["Electrical"] },
  { name: "Fit-Out", disciplines: ["Interior/Finishes"] },
  { name: "Closeout", disciplines: ["Civil", "Interior/Finishes"] },
]
const candidate = (id, disciplines, extra = {}) => ({
  id,
  name: `Company ${id}`,
  status: "approved",
  reviewed: true,
  disciplines,
  commitments: 0,
  unavailable: false,
  declined: false,
  ...extra,
})
const companies = () => [
  candidate("A", ["Civil", "Structural", "Interior/Finishes"]),
  candidate("B", ["Electrical"]),
  candidate("C", ["Interior/Finishes"]),
  candidate("E", ["Interior/Finishes"]),
]

test("project type policy selects two residential partners and three commercial or mixed-use partners", () => {
  for (const [type, count] of [
    ["Residential", 2],
    ["Commercial", 3],
    ["Mixed-Use", 3],
  ]) {
    assert.equal(requiredCompanies(type), count)
    const plan = recommendTeam(type, phases, companies())
    assert.equal(plan.companyIds.length, count)
    assert.equal(validatePlan(type, phases, plan, companies()), true)
  }
  assert.throws(
    () => requiredCompanies("Unknown"),
    /no company allocation policy/,
  )
})
test("a company can cover multiple trades, share phases and return in later phases without extra project slots", () => {
  const plan = recommendTeam("Commercial", phases, companies())
  assert.deepEqual(plan.companyIds, ["A", "B", "C"])
  assert.deepEqual(
    scopeFor(plan, "A").map((r) => r.phase),
    ["Mobilization", "Structure", "Closeout", "Closeout"],
  )
  assert.equal(scopeFor(plan, "C")[0].phase, "Fit-Out")
  assert.equal(
    new Set(
      plan.coverage
        .filter((r) => r.phase === "Closeout")
        .map((r) => r.companyId),
    ).size,
    1,
  )
  const realPhases = phaseDefinitions("Commercial")
  const team = [
    candidate("A", DISCIPLINES),
    candidate("B", DISCIPLINES),
    candidate("C", DISCIPLINES),
  ]
  const realPlan = recommendTeam("Commercial", realPhases, team)
  assert.equal(validatePlan("Commercial", realPhases, realPlan, team), true)
  assert.equal(
    realPhases.some(
      (phase) =>
        new Set(
          realPlan.coverage
            .filter((r) => r.phase === phase.name)
            .map((r) => r.companyId),
        ).size > 1,
    ),
    true,
  )
})
test("recommendations prioritize complete coverage and fewer commitments with stable tie-breaking", () => {
  const source = companies()
  source[2].commitments = 1
  assert.deepEqual(recommendTeam("Commercial", phases, source).companyIds, [
    "A",
    "B",
    "E",
  ])
  const before = structuredClone(source)
  assert.deepEqual(
    recommendTeam("Commercial", phases, source),
    recommendTeam("Commercial", phases, [...source].reverse()),
  )
  assert.deepEqual(
    source,
    before,
    "pure recommendation must not mutate directory data",
  )
})
test("nested company capabilities still produce a complete team with meaningful scope for every partner", () => {
  const phases = [{ name: "Shared phase", disciplines: ["Civil", "Electrical", "Structural"] }]
  const companies = [candidate("A", ["Civil", "Electrical", "Structural"]), candidate("B", ["Civil", "Electrical"]), candidate("C", ["Civil"])]
  const plan = recommendTeam("Commercial", phases, companies)
  assert.ok(plan)
  assert.equal(validatePlan("Commercial", phases, plan, companies), true)
  assert.deepEqual(plan.coverage.map(row => [row.discipline, row.companyId]), [["Civil", "C"], ["Electrical", "B"], ["Structural", "A"]])
})
test("unreviewed, unapproved, unavailable, declined and full companies are excluded without guessing capabilities", () => {
  for (const extra of [
    { reviewed: false },
    { status: "pending" },
    { unavailable: true },
    { declined: true },
    { commitments: 2 },
  ]) {
    const source = companies()
    source[1] = { ...source[1], ...extra }
    assert.ok(eligibility(source[1]))
    assert.equal(recommendTeam("Commercial", phases, source), null)
  }
  assert.equal(
    eligibility(candidate("eligible", ["Civil"], { commitments: 1 })),
    "",
  )
  assert.equal(
    recommendTeam(
      "Commercial",
      phases,
      companies().map((c) => ({ ...c, disciplines: [] })),
    ),
    null,
  )
})
test("a declined company is replaced only by a full-scope eligible alternative, leaving other coverage intact", () => {
  const source = companies(),
    plan = recommendTeam("Commercial", phases, source)
  source.find((c) => c.id === "C").declined = true
  source.push(
    candidate("Full", ["Interior/Finishes"], { commitments: 2 }),
    candidate("Wrong", ["Electrical"]),
    candidate("Unverified", ["Interior/Finishes"], { reviewed: false }),
  )
  assert.deepEqual(
    replacementCandidates(plan, "C", source).map((c) => c.id),
    ["E"],
  )
  const replacement = replaceCompany(plan, "C", "E")
  protectScope(plan, replacement, ["A", "B"])
  assert.deepEqual(scopeFor(replacement, "A"), scopeFor(plan, "A"))
  assert.deepEqual(
    scopeFor(replacement, "E").map(({ companyId, ...r }) => r),
    scopeFor(plan, "C").map(({ companyId, ...r }) => r),
  )
  source.find((c) => c.id === "E").declined = true
  assert.deepEqual(replacementCandidates(plan, "C", source), [])
  assert.deepEqual(
    plan.companyIds,
    ["A", "B", "C"],
    "no replacement must not silently remove the gap",
  )
})
test("coverage cannot omit, duplicate or invent a discipline, give work to an outsider, or alter protected scope", () => {
  const source = companies(),
    plan = recommendTeam("Commercial", phases, source)
  for (const bad of [
    { ...plan, coverage: plan.coverage.slice(1) },
    { ...plan, companyIds: ["A", "A", "B"] },
    {
      ...plan,
      coverage: plan.coverage.map((r, i) => (i ? r : { ...r, companyId: "B" })),
    },
    {
      ...plan,
      coverage: plan.coverage.map((r, i) =>
        i ? r : { ...r, discipline: "Invented" },
      ),
    },
  ])
    assert.throws(() => validatePlan("Commercial", phases, bad, source))
  assert.throws(
    () => protectScope(plan, replaceCompany(plan, "C", "E"), ["C"]),
    /locked/,
  )
  assert.throws(
    () =>
      validatePlan(
        "Commercial",
        [{ name: "Unknown", disciplines: [] }],
        plan,
        source,
      ),
    /incomplete/,
  )
})
function fixture() {
  const state = activeFixture(),
    project = currentProject(state)
  project.status = "pending"
  project.siteLocation = { region: "Central Visayas", province: "Cebu", city: "Cebu City" }
  project.workflow.activation = undefined
  project.workflow.selections = []
  project.subcontractorAllocationVersion = 1
  for (const c of state.companies) {
    c.status = "approved"
    c.activeProjectIds = []
    c.commitmentCount = 0
    c.capabilityReview = {
      operatingLocation: project.siteLocation,
      disciplines: [...COMPANY_TRADES],
      reviewedAt: "2026-10-27",
      unavailable: false,
    }
  }
  return state
}
test("proposals and contacts do not reserve capacity; acceptance reserves once, rejects a stale response and never activates", () => {
  let state = fixture()
  state = execute(state, "a4", {
    type: "auto_allocate_company",
    allocationRevision: 0,
  })
  let p = currentProject(state),
    id = p.subcontractorAllocation.companyIds[0]
  assert.equal(allocationConsented(state, p), false)
  assert.equal(state.companies.find((c) => c.id === id).commitmentCount, 0)
  state = execute(state, "a4", {
    type: "contact_company",
    companyId: id,
    allocationRevision: 1,
    note: "Phone call to company representative",
  })
  assert.equal(state.companies.find((c) => c.id === id).commitmentCount, 0)
  assert.throws(
    () =>
      execute(state, "a4", {
        type: "respond_company",
        companyId: id,
        accepted: true,
        allocationRevision: 1,
        note: "Accepted by phone",
      }),
    /changed/,
  )
  state = execute(state, "a4", {
    type: "respond_company",
    companyId: id,
    accepted: true,
    allocationRevision: 2,
    note: "Accepted by phone",
  })
  assert.equal(state.companies.find((c) => c.id === id).commitmentCount, 1)
  assert.equal(currentProject(state).status, "pending")
  assert.equal(
    allocationCandidates(state, currentProject(state)).find((c) => c.id === id)
      .commitments,
    0,
    "exclude the same project from the two-project gate",
  )
  assert.throws(
    () =>
      execute(state, "a4", {
        type: "auto_allocate_company",
        companyId: id,
        allocationRevision: 3,
      }),
    /locked/,
  )
  assert.throws(
    () =>
      execute(state, "a5", {
        type: "auto_allocate_company",
        companyId: id,
        allocationRevision: 3,
      }),
    /Lead/,
  )
})
test("capacity uses directory totals even when another project is outside the current user's scope", () => {
  const state = fixture(),
    project = currentProject(state),
    company = state.companies[0]
  company.commitmentCount = 2
  assert.equal(
    eligibility(allocationCandidates(state, project)[0]),
    "Two project commitments already reserved",
  )
})
test("formal release stays blocked until every returning phase is complete", () => {
  const state = fixture(),
    project = currentProject(state)
  project.status = "active"
  project.team = phases.map((p) => ({
    phase: p.name,
    status: "confirmed",
    accountId: "a4",
  }))
  project.subcontractorAllocation = {
    ...recommendTeam("Commercial", phases, companies()),
    requirements: phases,
  }
  project.phase = "MEP"
  assert.equal(canReleaseCompany(project, "A"), false)
  project.phase = "Closeout"
  assert.equal(canReleaseCompany(project, "C"), true)
  assert.equal(canReleaseCompany(project, "A"), false)
})
