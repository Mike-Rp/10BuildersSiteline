import assert from "node:assert/strict"
import test from "node:test"
import { selectInquiryLead } from "../Thesis-Backend/src/domain/inquiry-lead.js"
import { leadConfirmed, leadId } from "../src/workflows.ts"

test("a more experienced assigned engineer in a later phase can lead the inquiry", () => {
  const team = [
    { stage: "Design", user_id: "designer" },
    { stage: "Structure", user_id: "coordinator", engineers: [{ user_id: "coordinator" }, { user_id: "specialist" }] },
  ]
  const experience = new Map([["designer", 7], ["coordinator", 9], ["specialist", 12], ["unassigned", 20]])
  assert.deepEqual(selectInquiryLead(["Design", "Structure"], team, experience), { stage: "Structure", id: "specialist", years: 12 })
})

test("experience ties use phase order and then account ID", () => {
  const team = [
    { stage: "Structure", user_id: "a" },
    { stage: "Design", user_id: "z", engineers: [{ user_id: "z" }, { user_id: "b" }] },
  ]
  assert.deepEqual(selectInquiryLead(["Design", "Structure"], team, new Map()), { stage: "Design", id: "b", years: 0 })
  assert.equal(selectInquiryLead(["Design"], [], new Map()), null)
})

test("the Site PM workspace uses the saved lead phase for identity and confirmation", () => {
  const mobilization = { phase: "Mobilization", accountId: "first", status: "confirmed" }
  const structure = { phase: "Structure", accountId: "lead", status: "pending", isLead: true }
  const project = { team: [mobilization, structure] }
  assert.equal(leadId(project), "lead")
  assert.equal(leadConfirmed(project), false)
  structure.status = "confirmed"
  assert.equal(leadConfirmed({ team: [structure] }), true)
  assert.equal(leadId({ team: [mobilization] }), "first")
})
