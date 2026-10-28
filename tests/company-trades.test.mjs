import assert from "node:assert/strict"
import test from "node:test"
import { COMPANY_TRADES, companyTradePhases, companyTradeOptions, normalizeCompanyTrades } from "../Thesis-Backend/src/domain/company-trades.js"
import { allocationPhases, recommendTeam, validatePlan } from "../src/subcontractor-allocation.ts"
import { emptyState, phaseDefinitions, requiredTags } from "../src/model.ts"

// These expected rows transcribe the supplied document, independently of policy.
const expected = {
  Residential: [
    ["Mobilization", "Civil,Electrical,Plumbing"], ["Design", "Civil,Structural,Electrical"],
    ["Foundation", "Civil,Structural"], ["Structure", "Structural,Civil"],
    ["Envelope", "Civil,Facade,Waterproofing"], ["MEP Rough-In", "Electrical,Plumbing,Mechanical"],
    ["Finishes", "Interior/Finishes"], ["Landscape & Site Works", "Landscape,Civil,Plumbing"],
    ["Closeout", "Civil,Electrical,Interior/Finishes"],
  ],
  Commercial: [
    ["Mobilization", "Civil,Electrical,Plumbing"], ["Design", "Structural,Mechanical,Electrical"],
    ["Foundation", "Civil,Structural"], ["Structure", "Structural,Civil"],
    ["Envelope / Curtain Wall", "Facade,Waterproofing"], ["MEP Rough-In", "Electrical,Plumbing,Mechanical,Fire Protection"],
    ["Fire & Life Safety", "Fire Protection,Electrical"], ["Fit-Out / Finishes", "Interior/Finishes,Electrical"],
    ["Closeout", "Electrical,Mechanical,Plumbing"],
  ],
  "Mixed-Use": [
    ["Mobilization", "Civil,Electrical,Plumbing"], ["Design", "Structural,Mechanical,Electrical"],
    ["Foundation", "Civil,Structural"], ["Podium Structure", "Structural,Civil"], ["Tower Structure", "Structural,Civil"],
    ["Envelope / Curtain Wall", "Facade,Waterproofing"], ["MEP Rough-In", "Electrical,Plumbing,Mechanical,Fire Protection"],
    ["Fire & Life Safety", "Fire Protection,Electrical"], ["Retail/Commercial Fit-Out", "Interior/Finishes,Facade,Electrical"],
    ["Residential Fit-Out", "Interior/Finishes,Plumbing"], ["Landscape & Site Works", "Landscape,Civil,Plumbing"],
    ["Closeout", "Electrical,Mechanical,Interior/Finishes"],
  ],
}

test("all default company phase requirements match the document without changing engineer qualifications", () => {
  for (const [type, rows] of Object.entries(expected)) {
    const state = emptyState(), phases = phaseDefinitions(type), original = structuredClone(phases)
    // A loaded engineer catalog must not override company trade requirements.
    state.backendPhases = { [type]: phases }
    const result = allocationPhases(state, { type, team: [] })
    assert.deepEqual(result.map(p => [p.name, p.disciplines.join(",")]), rows)
    assert.deepEqual(phases, original)
    assert.ok(result.every(p => p.disciplines.every(d => COMPANY_TRADES.includes(d))))
  }
  assert.deepEqual(requiredTags("Residential", "Mobilization"), ["Civil", "Geotechnical"])
  assert.deepEqual(normalizeCompanyTrades(["Structural", "Structural", "Façade", "Facade"]), ["Structural", "Facade"])
  assert.equal(COMPANY_TRADES.length, 10)
})

test("mixed-use alternatives use only selected phases with the document's optional trade requirements", () => {
  const rows = [
    ["Hotel Fit-Out", "Interior/Finishes,Plumbing,Mechanical"], ["Structure", "Structural,Civil"],
    ["Envelope", "Civil,Facade,Waterproofing"], ["Site Works", "Civil,Plumbing"],
    ["Office Fit-Out", "Interior/Finishes,Electrical"],
  ]
  const project = { type: "Mixed-Use", phaseScope: {}, team: rows.map(([phase], sequence) => ({ phase, sequence, requiredDisciplines: ["Acoustic"] })) }
  assert.deepEqual(allocationPhases(emptyState(), project).map(p => [p.name, p.disciplines.join(",")]), rows)
  assert.deepEqual(companyTradePhases("Commercial", [{ name: "MEP Rough-in" }])[0].disciplines, ["Electrical", "Plumbing", "Mechanical", "Fire Protection"])
  assert.deepEqual(companyTradePhases("Residential", [{ name: "Unconfigured phase" }])[0].disciplines, [])
})

test("saved allocation requirements and legacy company tags remain recorded without expanding the new catalog", () => {
  const requirements = [{ name: "Envelope", disciplines: ["Structural", "Civil"] }]
  const project = { type: "Residential", team: [], subcontractorAllocation: { requirements } }
  assert.deepEqual(allocationPhases(emptyState(), project), requirements)
  assert.deepEqual(companyTradeOptions(), COMPANY_TRADES)
  assert.deepEqual(companyTradeOptions(["Geotechnical"]), [...COMPANY_TRADES, "Geotechnical"])
  assert.ok(!COMPANY_TRADES.includes("Geotechnical"))
})

test("a complete team must include verified facade and waterproofing coverage rather than structural tags alone", () => {
  const phases = companyTradePhases("Commercial", phaseDefinitions("Commercial"))
  const company = (id, disciplines) => ({ id, name: id, status: "approved", reviewed: true, disciplines, commitments: 0, unavailable: false, declined: false })
  const companies = [
    company("builder", ["Civil", "Structural", "Interior/Finishes"]),
    company("services", ["Electrical", "Plumbing", "Mechanical", "Fire Protection"]),
    company("enclosure", ["Facade", "Waterproofing"]),
  ]
  const plan = recommendTeam("Commercial", phases, companies)
  assert.ok(plan)
  assert.equal(validatePlan("Commercial", phases, plan, companies), true)
  assert.deepEqual(plan.coverage.filter(r => r.phase === "Envelope / Curtain Wall").map(r => r.companyId), ["enclosure", "enclosure"])
  assert.equal(recommendTeam("Commercial", phases, companies.map(c => c.id === "enclosure" ? { ...c, disciplines: ["Structural", "Civil"] } : c)), null)
  assert.equal(recommendTeam("Commercial", phases, companies.map(c => c.id === "enclosure" ? { ...c, reviewed: false } : c)), null)
})
