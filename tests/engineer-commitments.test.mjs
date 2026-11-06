import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { installCredentialFixture } from "./helpers/credential-fixture.mjs"
import {
  prepareEngineerAssignments,
  saveEngineerScopes,
  engineerCommitments,
} from "../Thesis-Backend/src/services/projects/engineer-commitments.utility.js"
import { standardActivities } from "../Thesis-Backend/src/domain/standard-phase-checklist.js"
import { spmCandidates, emptyState } from "../src/model.ts"
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8")

test("phase-and-tag reservations preserve legacy scope, reserve offers, enforce two projects and release approved work", async (t) => {
  const pg = new PGlite({ extensions: { citext } })
  t.after(() => pg.close())
  const db = {
    exec: (sql) => pg.exec(sql),
    query: async (sql, args) => {
      const r = await pg.query(sql, args)
      return { ...r, rowCount: r.rows.length || r.affectedRows || 0 }
    },
  }
  await pg.exec(
    "create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;",
  )
  await pg.exec(
    read(
      "../supabase/migrations/20261017000002_thesis_backend_schema.sql",
    ).replace(/^create extension if not exists pgcrypto.*$/m, ""),
  )
  for (const file of [
    "001-phase-checklists.sql",
    "002-phase-update-confirmation.sql",
    "003-react-integration.sql",
    "004-verified-activity-progress.sql",
    "009-engineer-license-workflow.sql",
  ])
    await pg.exec(read("../Thesis-Backend/migrations/" + file))
  await pg.exec(read("../supabase/seed/dummy-data.sql"))
  await installCredentialFixture(db)
  const migration = read(
    "../Thesis-Backend/migrations/019-engineer-phase-commitments.sql",
  )
  await pg.exec(migration)
  await pg.exec(migration)
  assert.ok(
    (
      await db.query("select assigned_disciplines from project_phase_team")
    ).rows.every((r) => r.assigned_disciplines === null),
    "migration never guesses historical tags",
  )
  const user = (
    await db.query(
      "select id from users where email='karlo.espiritu@10builders.com'",
    )
  ).rows[0].id
  const admin = (
    await db.query(
      "select id from users where email='patricia.domingo@10builders.com'",
    )
  ).rows[0].id
  const source = (
    await db.query(
      "select * from projects where name like 'Alden Heights%' limit 1",
    )
  ).rows[0]
  await pg.exec("update project_phase_team set status='declined'")
  await db.query(
    `insert into project_stage_discipline_links(project_type_id,project_stage_id,discipline_id)
  select $1,s.id,d.id from project_stages s cross join disciplines d where s.code in ('Mobilization','Foundation') and d.code in ('Civil','Structural') on conflict do nothing`,
    [source.project_type_id],
  )
  const create = async () => {
    const id = randomUUID()
    await db.query(
      `insert into projects select(jsonb_populate_record(null::projects,to_jsonb(p)||jsonb_build_object('id',$2::text,'name','Engineer scope test','lifecycle_status','spm_review'))).* from projects p where id=$1`,
      [source.id, id],
    )
    return id
  }
  const p1 = await create(),
    p2 = await create(),
    p3 = await create()
  const team = (stage = "Mobilization", tags = ["Civil"]) => [
    { stage, user_id: user, assigned_disciplines: tags },
  ]
  const reserve = async (id, rows) => {
    await pg.exec("begin")
    try {
      await prepareEngineerAssignments(db, source.project_type_id, rows, {
        projectId: id,
      })
      for (const row of rows)
        await db.query(
          `insert into project_phase_team(project_id,project_stage_id,spm_user_id,status,is_lead) select $1,id,$2,'pending',false from project_stages where code=$3`,
          [id, user, row.stage],
        )
      await saveEngineerScopes(db, id, rows, admin)
      await pg.exec("commit")
    } catch (e) {
      await pg.exec("rollback")
      throw e
    }
  }
  await reserve(p1, team())
  await assert.rejects(
    prepareEngineerAssignments(db, source.project_type_id, team(), {
      projectId: p2,
    }),
    /committed/,
    "same phase AND tag blocked even before acceptance",
  )
  await prepareEngineerAssignments(
    db,
    source.project_type_id,
    team("Foundation"),
    { projectId: p2 },
  )
  await prepareEngineerAssignments(
    db,
    source.project_type_id,
    team("Mobilization", ["Structural"]),
    { projectId: p2 },
  )
  await assert.rejects(
    prepareEngineerAssignments(
      db,
      source.project_type_id,
      team("Mobilization", ["Structural", "Civil"]),
      { projectId: p2 },
    ),
    /committed/,
    "all explicit tags checked",
  )
  await reserve(p2, team("Mobilization", ["Structural"]))
  await assert.rejects(
    prepareEngineerAssignments(db, source.project_type_id, team("Foundation"), {
      projectId: p3,
    }),
    /two unfinished/,
  )
  await db.query(
    "update project_phase_team set status='declined' where project_id=$1",
    [p2],
  )
  await prepareEngineerAssignments(
    db,
    source.project_type_id,
    team("Foundation"),
    { projectId: p3 },
  )
  await db.query(
    "update project_phase_team set assigned_disciplines=null where project_id=$1",
    [p1],
  )
  await assert.rejects(
    prepareEngineerAssignments(
      db,
      source.project_type_id,
      team("Mobilization", ["Structural"]),
      { projectId: p2 },
    ),
    /legacy specialization/,
  )
  await prepareEngineerAssignments(
    db,
    source.project_type_id,
    team("Mobilization", ["Civil"]),
    { projectId: p1, legacyReview: true },
  )
  await saveEngineerScopes(db, p1, team(), admin)
  const stage = (
    await db.query("select id from project_stages where code='Mobilization'")
  ).rows[0].id
  await db.query(
    "insert into project_phase_checklists(project_id,project_stage_id) values($1,$2)",
    [p1, stage],
  )
  const count = (
    await db.query(
      "select count(*)::int as n from project_type_stages where project_type_id=$1",
      [source.project_type_id],
    )
  ).rows[0].n
  for (const [index, item] of standardActivities(0, count).entries()) {
    const row = (
      await db.query(
        "insert into project_phase_checklist_items(project_id,project_stage_id,code,title,required,sort_order) values($1,$2,$3,$4,true,$5) returning id",
        [p1, stage, item.code, item.title, index],
      )
    ).rows[0]
    const file = randomUUID()
    await db.query(
      "insert into project_phase_files(id,project_id,project_stage_id,original_name,content_type,byte_size,content,uploaded_by) values($1,$2,$3,'proof.pdf','application/pdf',1,'x',$4)",
      [file, p1, stage, user],
    )
    await db.query(
      "insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,file_id,status,submitted_by,reviewed_by,reviewed_at) values($1,$2,$3,$4,'approved',$5,$6,now())",
      [p1, stage, row.id, file, user, admin],
    )
  }
  assert.equal(
    (await engineerCommitments(db, [user])).filter((r) => r.project_id === p1)
      .length,
    0,
    "official phase approval releases slot while overall project remains open",
  )
  await prepareEngineerAssignments(db, source.project_type_id, team(), {
    projectId: p3,
  })
})

test("Admin recommendations exclude exact pairs, allow different tags/phases and enforce project limit", () => {
  const state = emptyState()
  const a = {
    id: "engineer",
    name: "Mika",
    role: "spm",
    status: "active",
    hasProfessionalCredentials: true,
    eligibleForNewAssignment: true,
    expiry: "2099-12-31",
    qualifiedRequirements: ["Civil", "Structural"],
    scope: ["Civil", "Structural"],
    engineerCommitments: [
      {
        project_id: "a",
        phase: "Mobilization",
        tags: ["Civil"],
        status: "pending",
      },
    ],
  }
  state.accounts = [a]
  assert.equal(
    spmCandidates(state, "Residential", "Mobilization", "new", ["Civil"])
      .length,
    0,
  )
  assert.deepEqual(
    spmCandidates(state, "Residential", "Mobilization", "new", [
      "Civil",
      "Structural",
    ])[0].availableTags,
    ["Structural"],
  )
  assert.equal(
    spmCandidates(state, "Residential", "Foundation", "new", ["Civil"]).length,
    1,
  )
  a.engineerCommitments.push({
    project_id: "b",
    phase: "Foundation",
    tags: ["Structural"],
    status: "confirmed",
  })
  assert.equal(
    spmCandidates(state, "Residential", "Design", "new", ["Civil"]).length,
    0,
  )
})
