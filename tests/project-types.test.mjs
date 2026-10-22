import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { PHASES, PROJECT_TYPES } from "../src/model.ts"
import { initialState } from "./fixtures/demo-state.ts"
import {
  INTAKE_TYPES,
  LEGACY_TYPES,
  bulkNewType,
  buildPlan,
  normalizeProjectTypes,
} from "../Thesis-Backend/scripts/project-type-normalization.js"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")
const schema = read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(
  /^create extension if not exists pgcrypto.*$/m,
  "",
)
const integration =
  read("../Thesis-Backend/migrations/003-react-integration.sql") +
  read("../Thesis-Backend/migrations/004-engineer-license-workflow.sql")

async function database(t, seedFile) {
  const db = new PGlite({ extensions: { citext } })
  t.after(() => db.close())
  await db.exec(
    "create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;",
  )
  await db.exec(schema)
  await db.exec(integration)
  await db.exec(read(seedFile))
  return db
}
const projects = async (db) =>
  (
    await db.query(`select p.id, p.name, t.code as type, s.code as phase
      from projects p join project_types t on t.id = p.project_type_id
      left join project_stages s on s.id = p.current_stage_id order by p.name`)
  ).rows

// The phases a type offers in the database are the stages linked to it.
async function phasesByType(db) {
  const rows = (
    await db.query(`select pt.code as type, s.code as stage
      from project_stage_discipline_links l join project_types pt on pt.id = l.project_type_id
      join project_stages s on s.id = l.project_stage_id
      group by pt.code, s.code, s.sort_order order by s.sort_order`)
  ).rows
  const out = {}
  for (const r of rows) (out[r.type] ??= []).push(r.stage)
  return out
}

async function assertSeedIsNormalized(db, label) {
  const stages = await phasesByType(db)
  const rows = await projects(db)
  assert.ok(rows.length > 0)
  for (const p of rows) {
    assert.ok(INTAKE_TYPES.includes(p.type), `${label}: ${p.name} has type ${p.type}`)
    assert.ok(
      !LEGACY_TYPES.some((legacy) => p.name.includes(legacy)),
      `${label}: ${p.name} still names an old type`,
    )
    if (p.phase) assert.ok(stages[p.type]?.includes(p.phase), `${label}: ${p.name} phase ${p.phase} is not a ${p.type} phase`)
  }
  const teamOutside = (
    await db.query(`select p.name, s.code as stage, t.code as type from project_phase_team f
      join projects p on p.id = f.project_id join project_types t on t.id = p.project_type_id
      join project_stages s on s.id = f.project_stage_id`)
  ).rows.filter((r) => !stages[r.type]?.includes(r.stage))
  assert.deepEqual(teamOutside, [], `${label}: every team phase exists in its type's phase list`)
  return rows
}

test("the local test fixture uses only Residential, Commercial and Mixed-Use, with valid phases", () => {
  assert.deepEqual(PROJECT_TYPES, ["Residential", "Commercial", "Mixed-Use"])
  const state = initialState()
  for (const p of state.projects) {
    assert.ok(INTAKE_TYPES.includes(p.type), `${p.name}: ${p.type}`)
    assert.ok(!LEGACY_TYPES.some((legacy) => p.name.includes(legacy)))
    // The fixture's projects use the generic phase list that the database gives every type.
    assert.ok(PHASES.includes(p.phase), `${p.name} phase ${p.phase}`)
    assert.ok(p.team.every((row) => PHASES.includes(row.phase)))
  }
})

test("every demo-seed project uses an intake type and a phase of that type", { timeout: 120000 }, async (t) => {
  const db = await database(t, "../supabase/seed/dummy-data.sql")
  const rows = await assertSeedIsNormalized(db, "demo")
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.type]))
  assert.equal(byName["Meralco Ave. Fit-out"], "Commercial")
  assert.equal(byName["Brookfield Warehouse Ext."], "Commercial")
  assert.equal(byName["Cavite Cold Storage Facility"], "Commercial")
  assert.equal(byName["Sto. Niño Townhomes — Phase 2"], "Residential")
})

test("every bulk-seed project uses an intake type, a phase of that type, and an Office PM who holds it", { timeout: 240000 }, async (t) => {
  const db = await database(t, "../supabase/seed/bulk-test-data.sql")
  const rows = await assertSeedIsNormalized(db, "bulk")
  const counts = {}
  for (const r of rows) counts[r.type] = (counts[r.type] || 0) + 1
  assert.deepEqual(counts, { Commercial: 21, Residential: 21, "Mixed-Use": 8 })
  assert.equal(
    (
      await db.query(`select count(*)::int as n from projects p where p.suggested_opm_id is not null and not exists (
        select 1 from user_project_type_specializations s
        where s.user_id = p.suggested_opm_id and s.project_type_id = p.project_type_id)`)
    ).rows[0].n,
    0,
  )
  // No bulk Office PM is specialized in an old type any more.
  assert.equal(
    (
      await db.query(`select count(*)::int as n from user_project_type_specializations s
        join project_types t on t.id = s.project_type_id where t.code = any($1)`, [LEGACY_TYPES])
    ).rows[0].n,
    0,
  )
  // The migration plan and the seed agree on every bulk number.
  const plan = buildPlan().filter((item) => item.name.match(/ \d{3}$/) && item.id.length === 36 && rows.some((r) => r.id === item.id))
  assert.equal(plan.length, 24)
  for (const item of plan) {
    const row = rows.find((r) => r.id === item.id)
    assert.equal(row.type, item.to)
    assert.equal(row.name, item.newName)
  }
  for (let n = 1; n <= 50; n++) assert.ok(INTAKE_TYPES.includes(bulkNewType(n)))
})

async function checkMigration(t, seedFile, expectedChanged) {
  const db = await database(t, seedFile)
  const intended = await projects(db)
  const plan = buildPlan()
  const preserved = async () =>
    (
      await db.query(`select
        (select count(*)::int from project_documents) as documents,
        (select count(*)::int from project_phase_team) as team,
        (select count(*)::int from project_progress_history) as history,
        (select count(*)::int from project_phase_checklist_items) as checklist,
        (select coalesce(sum(current_pct), 0)::int from projects) as progress,
        (select count(*)::int from projects) as projects`)
    ).rows[0]
  const before = await preserved()
  // Put the database back in its old (legacy) state, as the hosted one may still be.
  const present = []
  for (const item of plan) {
    const hit = intended.find((r) => r.id === item.id)
    if (!hit) continue
    present.push(item)
    await db.query(
      "update projects set project_type_id = (select id from project_types where code = $2), name = $3 where id = $1",
      [item.id, item.from, item.name],
    )
  }
  assert.equal(present.length, expectedChanged)
  const legacy = await projects(db)
  assert.ok(legacy.some((r) => LEGACY_TYPES.includes(r.type)))

  // Dry run: reports every change and writes nothing.
  const dry = await normalizeProjectTypes(db, { apply: false })
  assert.equal(dry.filter((r) => r.status === "will change").length, expectedChanged)
  assert.deepEqual(await projects(db), legacy, "a dry run changes nothing")

  // A project someone edited by hand, and one outside the plan, are never touched.
  const edited = present[0]
  await db.query("update projects set name = $2 where id = $1", [edited.id, "Edited by hand"])
  const outsider = (await projects(db)).find((r) => !plan.some((p) => p.id === r.id))
  const applied = await normalizeProjectTypes(db, { apply: true })
  assert.equal(applied.find((r) => r.id === edited.id).status, "differs (not touched)")
  assert.equal(applied.filter((r) => r.status === "changed").length, expectedChanged - 1)
  const after = await projects(db)
  assert.equal(after.find((r) => r.id === edited.id).name, "Edited by hand")
  assert.deepEqual(after.find((r) => r.id === outsider.id), outsider)

  // Re-running is safe: everything already updated is skipped; the rest still differs.
  const again = await normalizeProjectTypes(db, { apply: true })
  assert.equal(again.filter((r) => r.status === "changed").length, 0)
  assert.equal(again.filter((r) => r.status === "already updated").length, expectedChanged - 1)

  // Restore the hand-edited one and finish: the result equals the new seed exactly.
  await db.query("update projects set name = $2 where id = $1", [edited.id, edited.name])
  const final = await normalizeProjectTypes(db, { apply: true })
  assert.equal(final.filter((r) => r.status === "changed").length, 1)
  assert.deepEqual(await projects(db), intended)
  assert.deepEqual(await preserved(), before, "documents, teams, history, checklists and progress are untouched")
}

test("the migration is dry-run first, re-runnable and only changes type and name (demo data)", { timeout: 120000 }, async (t) => {
  await checkMigration(t, "../supabase/seed/dummy-data.sql", 4)
})
test("the migration is dry-run first, re-runnable and only changes type and name (bulk data)", { timeout: 240000 }, async (t) => {
  await checkMigration(t, "../supabase/seed/bulk-test-data.sql", 24)
})
