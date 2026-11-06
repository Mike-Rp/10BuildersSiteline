import assert from "node:assert/strict"
import test from "node:test"
import { coversPhase, suggestCompanyPair } from "../src/allocation-suggestion.ts"
import { COMPANY_PHASE_TRADES } from "../Thesis-Backend/src/domain/company-trades.js"

const civil = ["Civil", "Structural", "Electrical", "Plumbing", "Landscape", "Facade", "Waterproofing"]
const mep = ["Structural", "Mechanical", "Electrical", "Plumbing", "Fire Protection", "Interior/Finishes", "Facade", "Civil"]
const company = (id, disciplines, commitments = 0) => ({ id, name: id, disciplines, commitments })
const phasesFor = (type) => Object.entries(COMPANY_PHASE_TRADES[type]).map(([name, disciplines]) => ({ name, disciplines }))

test("a civil/structural company and an MEP/finishes company together cover every phase of every project type", () => {
  for (const type of ["Residential", "Commercial", "Mixed-Use"]) {
    const phases = phasesFor(type)
    const pair = suggestCompanyPair([company("civil", civil), company("mep", mep)], phases)
    assert.ok(pair, type)
    assert.deepEqual([...pair.companyIds].sort(), ["civil", "mep"])
    assert.equal(pair.rows.length, phases.length)
    const byId = { civil: company("civil", civil), mep: company("mep", mep) }
    for (const row of pair.rows) {
      const phase = phases.find((p) => p.name === row.phase)
      assert.ok(coversPhase(byId[row.companyId], phase), `${type}: ${row.phase} goes to a company covering it`)
    }
    assert.ok(pair.rows.some((r) => r.companyId === "civil") && pair.rows.some((r) => r.companyId === "mep"), "both companies own phases")
  }
})

test("no pair is suggested when the companies cannot cover a phase, or when one company alone covers everything", () => {
  const phases = phasesFor("Commercial")
  assert.equal(suggestCompanyPair([company("civil-a", civil), company("civil-b", civil)], phases), undefined, "nobody covers MEP Rough-In")
  assert.equal(suggestCompanyPair([company("civil", civil)], phases), undefined)
  assert.equal(suggestCompanyPair([], phases), undefined)
  const all = [...new Set([...civil, ...mep])]
  assert.equal(suggestCompanyPair([company("all", all), company("other", ["Landscape"])], phases), undefined, "a single full-coverage company is not split")
})

test("the pair with fewer existing commitments is preferred", () => {
  const phases = phasesFor("Residential")
  const pair = suggestCompanyPair([company("busy-civil", civil, 1), company("free-civil", civil, 0), company("mep", mep, 0)], phases)
  assert.deepEqual([...pair.companyIds].sort(), ["free-civil", "mep"])
})
