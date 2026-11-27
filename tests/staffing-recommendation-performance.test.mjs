import assert from "node:assert/strict"
import test from "node:test"
import { getSpm } from "../Thesis-Backend/src/services/projects/recommend.controller.js"

test("staffing reuses request reads, bounds checks, preserves ranking and refreshes next request", async () => {
  let rankedReads = 0
  let qualificationReads = 0
  let active = 0
  let peak = 0
  const db = { async query(sql) {
    if (sql.includes("information_schema.columns")) return { rows: [{ ready: true }] }
    if (sql.includes("to_regclass")) return { rows: [{ ready: false }] }
    if (sql.includes("select id from project_types")) return { rows: [{ id: 1 }] }
    if (sql.includes("select u.id from users")) return { rows: [] }
    if (sql.includes("select t.spm_user_id")) return { rows: [] }
    if (sql.includes("WITH ORDINALITY")) return { rows: [
      { project_stage_id: 1, code: "Design", disciplines: [1] },
      { project_stage_id: 2, code: "Foundation", disciplines: [1] },
    ] }
    if (sql.includes("WITH search_params")) {
      rankedReads++
      return { rows: Array.from({ length: 6 }, (_, i) => ({
        "MAIN.id": `engineer-${i}`, "MAIN.full_name": `Engineer ${i}`,
        "MAIN.availability": "available", "MAIN.experience_years": 6 - i,
        "MAIN.matching_scopes": ["Civil"],
      })) }
    }
    if (sql.includes("select distinct d.code")) {
      qualificationReads++
      peak = Math.max(peak, ++active)
      await new Promise(resolve => setTimeout(resolve, 2))
      active--
      return { rows: [{ code: "Civil" }] }
    }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  const run = async () => {
    const candidates = {}
    const team = await getSpm("Mixed-Use", ["Design", "Foundation"], candidates, undefined, {}, {
      requiredScopes: { Design: ["Civil"], Foundation: ["Civil"] }, db,
    })
    assert.deepEqual(team.map(row => row.stage), ["Design", "Foundation"])
    assert.deepEqual(candidates.Design.map(row => row.id), Array.from({ length: 6 }, (_, i) => `engineer-${i}`))
    assert.equal(team[0].user_id, "engineer-0")
  }
  await run()
  assert.equal(rankedReads, 1)
  assert.equal(qualificationReads, 6)
  assert.ok(peak > 1 && peak <= 4)
  await run()
  assert.equal(rankedReads, 2)
  assert.equal(qualificationReads, 12)
})
