import test from "node:test"
import assert from "node:assert/strict"
import { allocationLocationIssue, locationError, locationLabel, normalizeLocation, sameLocation } from "../Thesis-Backend/src/domain/operating-location.js"
import { eligibility, recommendTeam, validatePlan, replacementCandidates, replaceCompany } from "../Thesis-Backend/src/domain/subcontractor-allocation.js"
import { allocationCandidates } from "../src/subcontractor-allocation.ts"
import { activeFixture, currentProject, execute } from "./fixtures.mjs"
import { DISCIPLINES } from "../src/model.ts"
const cebu = { region: "Central Visayas", province: "Cebu", city: "Cebu City" }
const manila = { region: "Metro Manila (NCR)", province: "Metro Manila", city: "Manila" }

test("structured areas require every component and normalize spacing and case without guessing addresses", () => {
  for (const bad of [undefined, null, "Cebu City", [], {}, { ...cebu, city: "" }, { ...cebu, region: 3 }, { ...cebu, province: "x".repeat(101) }, { ...cebu, city: "Cebu\nCity" }]) {
    assert.ok(locationError(bad)); assert.throws(() => normalizeLocation(bad))
    assert.equal(sameLocation(cebu, bad), false)
  }
  const original = { region: " Central   Visayas ", province: " CEBU ", city: " cebu city " }
  assert.equal(sameLocation(cebu, original), true)
  assert.equal(original.region, " Central   Visayas ")
  assert.equal(locationLabel(cebu), "Cebu City, Cebu · Central Visayas")
  assert.equal(sameLocation(cebu, { ...cebu, city: "Mandaue City" }), false)
  assert.equal(sameLocation(cebu, { ...cebu, province: "Different province" }), false)
  assert.equal(sameLocation(cebu, manila), false)
})
function fixture() {
  const state = activeFixture(), project = currentProject(state)
  project.status = "pending"; project.workflow.activation = undefined; project.workflow.selections = []; project.subcontractorAllocationVersion = 1; project.siteLocation = cebu
  for (const company of state.companies) {
    company.activeProjectIds = []; company.commitmentCount = 0; company.status = "approved"
    company.capabilityReview = { disciplines: DISCIPLINES, reviewedAt: "2026-10-28", operatingLocation: cebu, unavailable: false }
  }
  return state
}
test("auto-allocation, manual plans and replacements all exclude companies outside the project area", () => {
  const state = fixture(), project = currentProject(state), outside = state.companies[0]
  outside.capabilityReview.operatingLocation = manila
  outside.operatingLocation = cebu // a proposed location cannot override the reviewed area
  const candidates = allocationCandidates(state, project)
  assert.equal(eligibility(candidates.find(c => c.id === outside.id)), "Outside project operating area")
  const phases = [{ name: "Mobilization", disciplines: ["Civil", "Structural"] }]
  const plan = recommendTeam("Residential", phases, candidates)
  assert.ok(plan); assert.ok(!plan.companyIds.includes(outside.id))
  const forced = replaceCompany(plan, plan.companyIds[0], outside.id)
  assert.throws(() => validatePlan("Residential", phases, forced, candidates), /Outside project operating area/)
  assert.ok(!replacementCandidates(plan, plan.companyIds[0], candidates).some(c => c.id === outside.id))
})
test("unreviewed or missing locations never qualify even if old free-text locations appear to match", () => {
  const state = fixture(), project = currentProject(state)
  delete project.siteLocation; project.location = "Cebu City"
  assert.ok(allocationCandidates(state, project).every(c => eligibility(c) === "Project site location required"))
  project.siteLocation = cebu
  const company = state.companies[0]; delete company.capabilityReview.operatingLocation
  company.operatingLocation = cebu
  assert.equal(eligibility(allocationCandidates(state, project)[0]), "Site PM operating-area review required")
  assert.equal(allocationLocationIssue(cebu, manila), "Outside project operating area")
})
test("Lead can complete a pending intake location, but contact locks the location and non-Leads cannot change it", () => {
  let state = fixture()
  delete currentProject(state).siteLocation
  state = execute(state, "a4", { type: "set_allocation_location", allocationRevision: 0, siteLocation: cebu })
  assert.deepEqual(currentProject(state).siteLocation, cebu)
  assert.throws(() => execute(state, "a5", { type: "set_allocation_location", allocationRevision: 0, siteLocation: manila }), /Lead/)
  state = execute(state, "a4", { type: "auto_allocate_company", allocationRevision: 0 })
  const companyId = currentProject(state).subcontractorAllocation.companyIds[0]
  state = execute(state, "a4", { type: "contact_company", allocationRevision: 1, companyId, note: "Contacted local representative" })
  assert.throws(() => execute(state, "a4", { type: "set_allocation_location", allocationRevision: 2, siteLocation: manila }), /locked/)
  state.companies.find(c => c.id === companyId).capabilityReview.operatingLocation = manila
  assert.throws(() => execute(state, "a4", { type: "respond_company", allocationRevision: 2, companyId, accepted: true, note: "Attempted acceptance" }), /Outside project operating area/)
})
test("changing an uncontacted intake location clears the old proposal rather than retaining an ineligible team", () => {
  let state = execute(fixture(), "a4", { type: "auto_allocate_company", allocationRevision: 0 })
  state = execute(state, "a4", { type: "set_allocation_location", allocationRevision: 1, siteLocation: manila })
  assert.equal(currentProject(state).subcontractorAllocation, undefined)
  assert.equal(currentProject(state).workflow.selections.length, 0)
  assert.throws(() => execute(state, "a4", { type: "auto_allocate_company", allocationRevision: 0 }), /eligible team/)
})
