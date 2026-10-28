import test from "node:test"
import assert from "node:assert/strict"
import { allocationLocationIssue, locationError, locationLabel, normalizeLocation, sameLocation } from "../Thesis-Backend/src/domain/operating-location.js"
import { eligibility, recommendTeam, validatePlan, replacementCandidates, replaceCompany } from "../Thesis-Backend/src/domain/subcontractor-allocation.js"
import { allocationCandidates } from "../src/subcontractor-allocation.ts"
import { activeFixture, currentProject, execute } from "./fixtures.mjs"
import { DISCIPLINES } from "../src/model.ts"
import { LOCATION_REGIONS, LOCATION_GROUPS, LOCATION_CITIES, provinceOptions, cityOptions, locationForCity, resolveLocation } from "../Thesis-Backend/src/domain/philippine-locations.js"
const cebu = { region: "Central Visayas", province: "Cebu", city: "Cebu City" }
const manila = { region: "Metro Manila (NCR)", province: "Metro Manila", city: "Manila" }

test("the bundled catalog covers all regions and every city has valid regional and area parents", () => {
  assert.equal(LOCATION_REGIONS.length, 18)
  assert.equal(LOCATION_GROUPS.filter(group => group.kind === "province").length, 82)
  assert.equal(LOCATION_CITIES.length, 1642)
  assert.equal(new Set(LOCATION_CITIES.map(city => city.code)).size, LOCATION_CITIES.length)
  for (const city of LOCATION_CITIES) {
    assert.match(city.code, /^\d{10}$/)
    assert.ok(LOCATION_REGIONS.some(region => region.code === city.regionCode))
    assert.ok(LOCATION_GROUPS.some(group => group.code === city.groupCode && group.regionCode === city.regionCode))
    assert.equal(resolveLocation(locationForCity(city.code))?.code, city.code)
  }
})
test("NCR contains 17 cities/municipalities, independent cities do not appear under provinces, and Negros has its own region", () => {
  const ncr = provinceOptions("1300000000")
  assert.deepEqual(ncr.map(group => group.name), ["Metro Manila"])
  const ncrCities = cityOptions("1300000000", "ncr")
  assert.equal(ncrCities.length, 17)
  assert.ok(ncrCities.some(city => city.name === "City of Manila"))
  assert.ok(ncrCities.some(city => city.name === "Pateros"))
  assert.ok(!ncrCities.some(city => city.name === "Ermita"))
  assert.ok(!cityOptions("0700000000", "0702200000").some(city => city.code === "0730600000"))
  assert.ok(cityOptions("0700000000", "independent:0700000000").some(city => city.code === "0730600000"))
  assert.ok(LOCATION_REGIONS.some(region => region.code === "1800000000"))
  assert.equal(LOCATION_GROUPS.find(group => group.name === "Negros Oriental").regionCode, "1800000000")
  assert.equal(LOCATION_GROUPS.find(group => group.name === "Sulu").regionCode, "0900000000")
})
test("standard city codes match exact legacy aliases but cannot spoof names, regions or area parents", () => {
  const selected = locationForCity("0730600000")
  assert.equal(sameLocation(selected, cebu), true)
  assert.equal(sameLocation(locationForCity("1380600000"), manila), true)
  assert.equal(normalizeLocation(selected).psgcCode, "0730600000")
  for (const bad of [{ ...selected, city: "City of Manila" }, { ...selected, province: "Cebu" }, { ...selected, region: "Metro Manila (NCR)" }, { ...selected, psgcCode: "1380600000" }, { ...selected, psgcCode: "9999999999" }, { ...cebu, province: "Leyte" }, { ...cebu, city: "A fictional city" }]) {
    assert.ok(locationError(bad)); assert.equal(sameLocation(selected, bad), false)
  }
  assert.throws(() => locationForCity("9999999999"), /catalog/)
  assert.equal(locationLabel({ region: "Legacy region", province: "Legacy province", city: "Legacy city" }), "Legacy city, Legacy province · Legacy region")
})

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
test("auto-allocation and manual plans ignore historical company operating areas", () => {
  const state = fixture(), project = currentProject(state), outside = state.companies[0]
  outside.capabilityReview.operatingLocation = manila
  outside.operatingLocation = cebu // a proposed location cannot override the reviewed area
  const candidates = allocationCandidates(state, project)
  assert.equal(eligibility(candidates.find(c => c.id === outside.id)), "")
  const phases = [{ name: "Mobilization", disciplines: ["Civil", "Structural"] }]
  const plan = recommendTeam("Residential", phases, candidates)
  assert.ok(plan)
  assert.equal(validatePlan("Residential", phases, plan, candidates), true)
  const alternative = candidates.find(c => !plan.companyIds.includes(c.id))
  assert.ok(replacementCandidates(plan, plan.companyIds[0], candidates).some(c => c.id === alternative.id))
})
test("companies can qualify without project or company locations", () => {
  const state = fixture(), project = currentProject(state)
  delete project.siteLocation; project.location = "Cebu City"
  assert.ok(allocationCandidates(state, project).every(c => eligibility(c) === ""))
  project.siteLocation = cebu
  const company = state.companies[0]; delete company.capabilityReview.operatingLocation
  company.operatingLocation = cebu
  assert.equal(eligibility(allocationCandidates(state, project)[0]), "")
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
  state = execute(state, "a4", { type: "respond_company", allocationRevision: 2, companyId, accepted: true, note: "Company accepted its scope" })
  assert.equal(currentProject(state).workflow.selections.find(s => s.companyId === companyId).status, "accepted")
})
test("changing an uncontacted intake location clears the old proposal rather than retaining an ineligible team", () => {
  let state = execute(fixture(), "a4", { type: "auto_allocate_company", allocationRevision: 0 })
  state = execute(state, "a4", { type: "set_allocation_location", allocationRevision: 1, siteLocation: manila })
  assert.equal(currentProject(state).subcontractorAllocation, undefined)
  assert.equal(currentProject(state).workflow.selections.length, 0)
  state = execute(state, "a4", { type: "auto_allocate_company", allocationRevision: 0 })
  assert.ok(currentProject(state).subcontractorAllocation)
})
