import assert from "node:assert/strict"
import test from "node:test"
import { LOCATION_CITIES, locationForCity } from "../Thesis-Backend/src/domain/philippine-locations.js"
import { coordinatesError, normalizeLocation, locationError, distanceKm, locationProximity, proximityLabel, serviceAreasError, normalizeServiceAreas, allocationLocationIssue, sameLocationRecord } from "../Thesis-Backend/src/domain/operating-location.js"
import { recommendTeam, replacementCandidates, compareCandidatePreference, validatePlan } from "../Thesis-Backend/src/domain/subcontractor-allocation.js"
import { allocationCandidates } from "../src/subcontractor-allocation.ts"
import { activeFixture, currentProject } from "./fixtures.mjs"
const city = name => locationForCity(LOCATION_CITIES.find(city => city.name.includes(name)).code)
const point = (location, latitude, longitude) => ({ ...location, coordinates: { latitude, longitude } })
const imus = city("Imus"), bacoor = city("Bacoor"), manila = city("Manila"), cebu = city("City of Cebu")
const site = point(imus, 14.43, 120.94)
const near = point(bacoor, 14.431, 120.941), far = point(imus, 14.35, 120.94)
const company = (id, disciplines, base, extra = {}) => ({ id, name: id, status: "approved", reviewed: true, disciplines, commitments: 0, unavailable: false, declined: false, proximity: locationProximity(site, base), ...extra })
const phases = [{ name: "Foundation", disciplines: ["Civil", "Electrical"] }]

test("optional coordinates normalize safely and incomplete or malformed pairs cannot be saved", () => {
  assert.deepEqual(normalizeLocation(point(imus, "14.43", "120.94")).coordinates, site.coordinates)
  assert.equal(normalizeLocation(imus).coordinates, undefined)
  for (const coordinates of [null, {}, [], { latitude: 1 }, { latitude: "", longitude: 1 }, { latitude: false, longitude: 1 }, { latitude: "0x10", longitude: 1 }, { latitude: Infinity, longitude: 1 }, { latitude: 91, longitude: 1 }, { latitude: 1, longitude: -181 }]) {
    assert.ok(coordinatesError(coordinates))
    assert.ok(locationError({ ...imus, coordinates }))
    assert.throws(() => normalizeLocation({ ...imus, coordinates }))
  }
  assert.equal(coordinatesError({ latitude: 0, longitude: 0 }), "")
  assert.equal(sameLocationRecord(site, point(imus, 14.44, 120.94)), false)
  assert.equal(sameLocationRecord(site, point(imus, "14.43", "120.94")), true)
})

test("straight-line distance has correct scale, symmetry, zero and missing-data handling", () => {
  const origin = { latitude: 0, longitude: 0 }, east = { latitude: 0, longitude: 1 }
  assert.ok(Math.abs(distanceKm(origin, east) - 111.19508) < 0.001)
  assert.equal(distanceKm(origin, origin), 0)
  assert.equal(distanceKm(origin, east), distanceKm(east, origin))
  assert.equal(distanceKm(undefined, east), null)
  assert.equal(distanceKm({ latitude: "", longitude: 0 }, east), null)
  assert.ok(Number.isFinite(distanceKm(origin, { latitude: 0, longitude: 180 })))
  assert.match(proximityLabel(locationProximity(site, imus)), /Distance unavailable.*Same city.*Area fallback/)
  assert.match(proximityLabel(locationProximity(site, near)), /km straight-line.*Same province/)
})

test("reviewed service areas permit cross-city work without guessing coverage from distance", () => {
  assert.equal(allocationLocationIssue(site, near), "Outside project operating area")
  for (const scope of ["province", "region"]) assert.equal(allocationLocationIssue(site, near, [{ scope, location: bacoor }]), "")
  assert.equal(allocationLocationIssue(site, near, [{ scope: "city", location: imus }]), "")
  assert.equal(allocationLocationIssue(site, near, [{ scope: "city", location: manila }]), "Outside project operating area")
  assert.ok(serviceAreasError([{ scope: "country", location: imus }]))
  assert.ok(serviceAreasError([{ scope: "province", location: cebu }]), "Independent cities cannot stand in for a province")
  assert.ok(serviceAreasError([{ scope: "region", location: imus }, { scope: "region", location: bacoor }]))
  assert.ok(serviceAreasError(Array(31).fill({ scope: "city", location: imus })))
  assert.equal(normalizeServiceAreas([{ scope: "city", location: site }])[0].location.coordinates, undefined)
})

test("fallback ranks real province groups, then regions, without treating independent cities as a province", () => {
  assert.equal(locationProximity(imus, imus).areaRank, 0)
  assert.equal(locationProximity(imus, bacoor).areaRank, 1)
  assert.equal(locationProximity(imus, city("Calamba")).areaRank, 2)
  assert.equal(locationProximity(imus, cebu).areaRank, 3)
  assert.equal(locationProximity(cebu, city("Mandaue")).areaRank, 2)
  assert.equal(locationProximity(manila, city("Quezon City")).areaRank, 1)
})

test("company teams use coverage and commitments while ignoring historical proximity", () => {
  const companies = [company("far", ["Civil"], far), company("near", ["Civil"], near, { commitments: 1 }), company("electric", ["Electrical"], site)]
  const plan = recommendTeam("Residential", phases, companies)
  assert.ok(plan.companyIds.includes("far"), "Fewer commitments win regardless of historical coordinates")
  assert.equal(validatePlan("Residential", phases, plan, companies), true)
  assert.deepEqual(recommendTeam("Residential", phases, [...companies].reverse()), plan)
  companies[1].commitments = 2
  assert.ok(recommendTeam("Residential", phases, companies).companyIds.includes("far"))
  companies[2].unavailable = true
  assert.equal(recommendTeam("Residential", phases, companies), null, "A close civil company cannot replace an unavailable electrical specialist")
})

test("historical distances and area fallback do not influence company preference", () => {
  const known = company("known", ["Civil"], far), unknown = company("unknown", ["Civil"], imus)
  assert.equal(compareCandidatePreference(known, unknown), 0)
  const electrical = company("electric", ["Electrical"], imus)
  assert.ok(recommendTeam("Residential", phases, [known, unknown, electrical]).companyIds.includes("known"))
  const fallback = [company("province", ["Civil"], bacoor), unknown, electrical, company("region", ["Civil"], city("Calamba"))]
  assert.ok(recommendTeam("Residential", phases, fallback).companyIds.includes("province"), "Equal commitments use stable company-name ordering")
  const plan = { companyIds: ["current", "electric"], coverage: [{ phase: "Foundation", discipline: "Civil", companyId: "current" }, { phase: "Foundation", discipline: "Electrical", companyId: "electric" }] }
  assert.deepEqual(replacementCandidates(plan, "current", [known, unknown, company("closer", ["Civil"], near)]).map(company => company.id), ["closer", "known", "unknown"])
})

test("frontend candidates no longer derive location restrictions or proximity", () => {
  const state = activeFixture(), project = currentProject(state), base = state.companies[0]
  project.siteLocation = site
  base.operatingLocation = site
  base.capabilityReview = { disciplines: ["Civil"], reviewedAt: "2026-10-28", operatingLocation: near, serviceAreas: [], unavailable: false }
  let candidate = allocationCandidates(state, project)[0]
  assert.equal(candidate.locationIssue, undefined)
  base.capabilityReview.serviceAreas = [{ scope: "province", location: bacoor }]
  candidate = allocationCandidates(state, project)[0]
  assert.equal(candidate.locationIssue, undefined)
  assert.equal(candidate.proximity, undefined)
})
