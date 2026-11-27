import assert from "node:assert/strict"
import test from "node:test"
import { assertAcceptancePrerequisites, assertLeadResponded } from "../Thesis-Backend/src/services/projects/assignment-prerequisites.utility.js"

test("all Site PMs may respond while the Lead is pending or declined", async () => {
  for (const status of ["pending", "declined", "confirmed"]) {
    const db = { async query(sql) {
      if (sql.includes("project_phase_team")) return { rows: [{ spm_user_id: "lead", is_lead: true, status }] }
      if (sql.includes("project_documents")) return { rows: [{ n: 6 }] }
      throw new Error("Unexpected query")
    } }
    for (const inquiry_intake of [null, { name: "Test" }]) {
      const project = { id: "project", lifecycle_status: "spm_review", inquiry_intake }
      await assertAcceptancePrerequisites(db, project, { id: "other-spm" })
      await assertLeadResponded(db, project, { id: "other-spm" })
    }
  }
})

test("independent acceptance preserves OPM, legacy document and saved Lead checks", async () => {
  const db = { async query(sql) { return { rows: sql.includes("project_documents") ? [{ n: 0 }] : [] } } }
  await assert.rejects(assertAcceptancePrerequisites(db, { id: "p", lifecycle_status: "draft" }, { id: "spm" }), /Wait for the assigned Office PM/)
  await assert.rejects(assertAcceptancePrerequisites(db, { id: "p", lifecycle_status: "spm_review" }, { id: "spm" }), /Waiting for Office PM documents/)
  await assert.rejects(assertAcceptancePrerequisites(db, { id: "p", lifecycle_status: "spm_review", inquiry_intake: {} }, { id: "spm" }), /saved Lead Site PM assignment is required/)
})
