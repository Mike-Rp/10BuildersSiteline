import assert from "node:assert/strict"
import test from "node:test"
import { matchingInquiryTags, selectInquiryLead } from "../Thesis-Backend/src/domain/inquiry-lead.js"
import { leadConfirmed, leadId } from "../src/workflows.ts"

test("the first included phase supplies the lead even when a later phase has more experience", () => {
  const team = [
    { stage: "Design", user_id: "designer", assigned_disciplines: ["Civil"] },
    { stage: "Structure", user_id: "coordinator", engineers: [
      { user_id: "coordinator", assigned_disciplines: ["Structural"] },
      { user_id: "specialist", assigned_disciplines: ["Structural"] },
      { user_id: "wrong-tag", assigned_disciplines: ["Electrical"] },
      { user_id: "uncovered", assigned_disciplines: [] },
    ] },
  ]
  const experience = new Map([["designer", 7], ["coordinator", 9], ["specialist", 12], ["unassigned", 20], ["wrong-tag", 22], ["uncovered", 24]])
  const eligible = stage => stage === "Design" ? ["Civil"] : ["Structural"]
  assert.deepEqual(selectInquiryLead(["Design", "Structure"], team, experience, eligible), { stage: "Design", id: "designer", years: 7, tags: ["Civil"] })
  assert.deepEqual(selectInquiryLead(["Structure"], team, experience, eligible), { stage: "Structure", id: "specialist", years: 12, tags: ["Structural"] })
  assert.equal(selectInquiryLead(["Design", "Structure"], team, experience, () => ["Structural"]), null)
  assert.deepEqual(matchingInquiryTags(["Structural", "Electrical"], ["Structural"]), [])
})

test("experience ties within the first phase use account ID", () => {
  const team = [
    { stage: "Structure", user_id: "a", assigned_disciplines: ["Structural"] },
    { stage: "Design", user_id: "z", engineers: [{ user_id: "z", assigned_disciplines: ["Structural"] }, { user_id: "b", assigned_disciplines: ["Structural"] }] },
  ]
  assert.deepEqual(selectInquiryLead(["Design", "Structure"], team, new Map(), () => ["Structural"]), { stage: "Design", id: "b", years: 0, tags: ["Structural"] })
  assert.equal(selectInquiryLead(["Design", "Structure"], team, new Map(), () => []), null)
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
  assert.equal(leadId({ inquiryOrigin: true, team: [mobilization] }), "")
})
