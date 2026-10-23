import { hasPendingSiteReview } from "../src/active-sites-review.ts"
import assert from "node:assert/strict"
import test from "node:test"
import { DOC_LABELS } from "../src/model.ts"
import {
  DOC_CODES,
  formatArea,
  mapAccount,
  mapCompany,
  mapEvent,
  mapProject,
  peopleFromProjects,
  projectStatus,
} from "../src/api/adapter.ts"

const registered = new Map()
const register = (id, url) => url && registered.set(id, url)

const base = {
  id: "p1",
  name: "Rosaria Business Park",
  client_name: "Maria L. Santos",
  project_type: "Commercial",
  floor_area_sqm: "9120.00",
  floor_count: 6,
  target_start_date: "2026-03-10",
  current_stage: "Structure",
  current_pct: 60,
  lifecycle_status: "active",
  suggested_opm_id: "opm-1",
  created_at: "2026-10-17T09:31:05.711Z",
}

test("trusted verified totals remain separate from current-phase and historical percentages", () => {
  const verifiedProgress = {
    project: { earned: 80, total: 270, percentage: 80/270*100, reason: null },
    phases: [{ id: "4", name: "Structure", earned: 20, total: 30, percentage: 20/30*100, reason: null }],
  }
  const project = mapProject(parts({verifiedProgress}))
  assert.deepEqual(project.verifiedProgress,verifiedProgress)
  assert.equal(project.progress,60)
  assert.ok(project.history.some(h=>h.progress===62))
  assert.equal(mapProject(parts()).verifiedProgress,undefined,"legacy progress is never converted into verified credit")
})
const parts = (over = {}) => ({
  list: base,
  detail: {
    phase_team: [
      { stage: "Mobilization", sort_order: 1, spm_user_id: "s1", spm_name: "Mikaela", status: "confirmed", required_disciplines: ["Civil"] },
      { stage: "Design", sort_order: 2, spm_user_id: "s2", spm_name: "Karlo", status: "auto_expired", required_disciplines: [] },
    ],
  },
  documents: DOC_CODES.map((code, i) => ({
    code,
    id: `d${i}`,
    uploaded: i < 6,
    client_visible: [0, 1, 3, 4].includes(i),
    uploaded_at: "2026-08-28T09:31:05.711Z",
    download_url: `/api/v1/documents/d${i}/download`,
  })),
  history: [
    { recorded_at: "2026-10-11T00:00:00Z", pct: 62, note: "later", stage_code: "Structure", is_issue: false },
    { recorded_at: "2026-09-01T00:00:00Z", pct: 40, note: "earlier", stage_code: "Structure", is_issue: false },
  ],
  photos: [{ id: "ph1", caption: "Rebar", taken_date: "2026-10-11", download_url: "/api/v1/documents/ph1/download" }],
  notes: [{ id: "n1", note_text: "Hello", noted_at: "2026-10-16T03:31:05.711Z" }],
  overview: { checklist: { items: [{ id: 1, title: "Work inspection", status: "approved" }, { id: 2, title: "Testing", status: "missing" }] } },
  assignments: [{ subcontractor_id: "c1", status: "active" }, { subcontractor_id: "c2", status: "released" }],
  contracts: [{ contract_type: "client_subcon_agreement", subcontractor_name: "Isla Glass" }],
  pending: { id: 7, submitted_at: "2026-10-16T13:31:05.711Z", prior_stage: "Structure", prior_pct: 60, requested_stage: "Structure", requested_pct: 70, note: "slab" },
  clientId: "client-1",
  register,
  ...over,
})

test("backend lifecycle statuses map to the app's project statuses", () => {
  const status = (s) => projectStatus({ lifecycle_status: s })
  assert.equal(status("active"), "active")
  assert.equal(status("draft"), "draft")
  assert.equal(status("archived"), "completed")
  for (const s of ["suggested_allocation", "confirmed", "sent_to_opm", "spm_review"]) assert.equal(status(s), "pending")
})

test("a project keeps its team, documents, history, notes and checklist", () => {
  const p = mapProject(parts())
  assert.equal(p.area, "9,120")
  assert.equal(p.floors, "6")
  assert.equal(p.phase, "Structure")
  assert.equal(p.progress, 60)
  assert.equal(p.clientId, "client-1")
  assert.equal(p.opmId, "opm-1")
  assert.equal(p.opmAccepted, true)
  assert.deepEqual(p.team.map((t) => [t.phase, t.accountId, t.status]), [
    ["Mobilization", "s1", "confirmed"],
    ["Design", "s2", "declined"],
  ])
  assert.equal(p.docs.length, DOC_LABELS.length)
  assert.deepEqual(p.docs.map((d) => d.label), DOC_LABELS)
  assert.equal(p.docs.filter((d) => d.uploaded).length, 6)
  assert.equal(p.docs[6].uploaded, false)
  assert.equal(p.docs[0].clientVisible, true)
  assert.equal(p.docs[2].clientVisible, false)
  assert.deepEqual(p.history.map((h) => h.text), ["earlier", "later"], "history is oldest first")
  assert.equal(p.workflow.notes[0].text, "Hello")
  assert.equal(p.workflow.photos[0].id, "ph1")
  assert.deepEqual(p.workflow.checklist.Structure.map((i) => i.status), ["approved", "missing"])
  assert.deepEqual(p.workflow.selections.map((s) => s.status), ["accepted", "archived"])
  assert.equal(p.workflow.pendingUpdate.requestedProgress, 70)
  assert.equal(p.clientSubcon, "Isla Glass")
  assert.equal(registered.get("d0"), "/api/v1/documents/d0/download", "downloads are registered by document id")
  assert.equal(registered.get("ph1"), "/api/v1/documents/ph1/download")
})

test("archived projects show as finished, and un-uploaded documents get stable ids", () => {
  const p = mapProject(parts({ list: { ...base, lifecycle_status: "archived", current_pct: 0 }, documents: [] }))
  assert.equal(p.status, "completed")
  assert.equal(p.progress, 100)
  assert.equal(p.docs[3].id, "p1:doc:3")
  assert.equal(p.docs.every((d) => !d.uploaded), true)
})

test("accounts: client scope is resolved from project names, SPM scope from disciplines", () => {
  const ids = new Map([["rosaria business park", "p1"]])
  const client = mapAccount({ id: "c", full_name: "Maria", role: "client", status: "active", scope: ["Rosaria Business Park", "Unknown"] }, undefined, ids)
  assert.deepEqual(client.scope, ["p1"])
  const spm = mapAccount(
    { id: "s", full_name: "Karlo", role: "spm", status: "active", scope: ["Civil"] },
    { scope: { disciplines: ["Civil", "Structural"] }, license: { license_number: "PRC 1", license_expiry: "2028-03-15" }, certifications: ["PRC-Civil"] },
  )
  assert.deepEqual(spm.scope, ["Civil", "Structural"])
  assert.equal(spm.license, "PRC 1")
  assert.equal(spm.expiry, "2028-03-15")
  assert.deepEqual(spm.certifications, ["PRC-Civil"])
  assert.equal(mapAccount({ id: "x", full_name: "J", role: "spm", status: "suspended" }).status, "suspended")
})

test("other roles learn about people from the project: team, Office PM and client", () => {
  const me = mapAccount({ id: "s1", full_name: "Mikaela", role: "spm", status: "active" })
  const details = new Map([["p1", { phase_team: [{ spm_user_id: "s2", spm_name: "Karlo" }], opm_assignment: { target_user_id: "opm-1", name: "Lea" } }]])
  const { accounts, clientIds } = peopleFromProjects(me, [base], details)
  assert.deepEqual(accounts.map((a) => [a.id, a.name, a.role]).sort(), [
    ["client:maria l. santos", "Maria L. Santos", "client"],
    ["opm-1", "Lea", "opm"],
    ["s1", "Mikaela", "spm"],
    ["s2", "Karlo", "spm"],
  ])
  assert.equal(clientIds.get("p1"), "client:maria l. santos")
  const asClient = mapAccount({ id: "c", full_name: "Maria L. Santos", role: "client", status: "active" })
  assert.equal(peopleFromProjects(asClient, [base], new Map()).clientIds.get("p1"), "c", "a client's own projects link to their account")
})

test("companies and notifications map their key fields", () => {
  const c = mapCompany({ id: "c1", company_name: "Cordova", directory_status: "declined", contact_person: { name: "Alexis" }, contact_email: "a@b.c", crew_count: 3, availability: "committed", assigned_projects: ["Rosaria Business Park"], committed_until: "2026-12-01" }, new Map([["rosaria business park", "p1"]]))
  assert.equal(c.status, "rejected")
  assert.equal(c.contact, "Alexis")
  assert.equal(c.manpowerCount, 3)
  assert.deepEqual(c.activeProjectIds, ["p1"])
  assert.equal(c.committedUntil, "2026-12-01")
  const e = mapEvent({ id: 5, title: "T", detail: null, type: "request", occurred_at: "2026-10-17T00:00:00Z", is_read: false, related_project_id: "p1" }, "u1")
  assert.deepEqual([e.id, e.type, e.read, e.projectId, e.recipientIds], ["5", "request", false, "p1", ["u1"]])
  assert.equal(formatArea(null), "")
  assert.equal(formatArea("18400.00"), "18,400")
})

test("linked client identity and contact details come from the project link, not a matching name", () => {
  const me=mapAccount({id:"opm",full_name:"Office PM",role:"opm",status:"active"})
  const contact={id:"actual-client",full_name:"Client Contact",email:"linked@example.test",phone:"09123456789",contact_person:"Owner Representative"}
  const details=new Map([["p1",{client_accounts:[contact]}]])
  const existing=[mapAccount({id:"unrelated",full_name:base.client_name,role:"client",status:"active",email:"wrong@example.test"})]
  const people=peopleFromProjects(me,[base],details,existing)
  assert.equal(people.clientIds.get("p1"),"actual-client")
  assert.equal(people.accounts.find(a=>a.id==="actual-client").email,"linked@example.test")
  const p=mapProject(parts({detail:details.get("p1"),clientId:people.clientIds.get("p1")}))
  assert.deepEqual(p.clientAccounts,[{id:contact.id,name:contact.full_name,email:contact.email,phone:contact.phone,contactPerson:contact.contact_person}])
  const unlinked=peopleFromProjects(me,[base],new Map([["p1",{client_accounts:[]}]]),existing)
  assert.equal(unlinked.clientIds.has("p1"),false,"an absent link must not borrow another account with the same name")
})

test("an empty current review queue does not revive retired manual-percentage requests",()=>{
 const p=mapProject(parts({overview:{pending_update:null,checklist:{items:[]}}}))
 assert.equal(p.workflow.pendingUpdate,undefined)
})


test("Active Sites review membership follows current backend queues and ignores resolved issues and retired updates", () => {
  const mapped = (pending_update, issues = []) => mapProject(parts({ overview: { pending_update, issues } }))
  const update = { id: "pending-update", prior_pct: 60, requested_pct: 60 }
  const issue = { id: "pending-issue", status: "pending" }
  assert.equal(hasPendingSiteReview(mapped(update)), true)
  assert.equal(hasPendingSiteReview(mapped(null, [issue])), true)
  const both = mapped(update, [issue])
  assert.ok(both.workflow.pendingUpdate)
  assert.ok(both.workflow.pendingRework)
  assert.equal(hasPendingSiteReview(both), true)
  // A retired legacy pending-update response must not restore a resolved review.
  const resolved = mapped(null, [{ ...issue, status: "resolved" }])
  assert.equal(hasPendingSiteReview(resolved), false)
  assert.equal(resolved.workflow.pendingUpdate, undefined)
  assert.equal(resolved.workflow.pendingRework, undefined)
  assert.equal(hasPendingSiteReview({ ...both, status: "pending" }), false)
  assert.equal(hasPendingSiteReview({ ...both, status: "completed" }), false)
})

test("checklist items keep the submitter's note and the reviewer's rejection reason apart", () => {
  const SUBMITTED = "Uploaded the signed inspection sheet"
  const REJECTED = "Photo is blurry; re-shoot the rebar spacing"
  const REWORK = "Withdrawn after the slab crack report"
  const overview = {
    checklist: {
      items: [
        { id: 1, title: "Rejected", status: "rejected", submission_note: SUBMITTED, review_note: REJECTED, evidence_id: 11 },
        { id: 2, title: "Waiting", status: "pending", submission_note: SUBMITTED, review_note: null, evidence_id: 12 },
        { id: 3, title: "Approved", status: "approved", submission_note: SUBMITTED, review_note: "Looks good", evidence_id: 13 },
        { id: 4, title: "Rework", status: "rework_required", submission_note: SUBMITTED, review_note: REWORK, rework_reason: REWORK, evidence_id: 14 },
        { id: 5, title: "Never submitted", status: "missing" },
      ],
    },
  }
  const items = mapProject(parts({ overview })).workflow.checklist.Structure
  const byLabel = Object.fromEntries(items.map((i) => [i.label, i]))
  assert.equal(byLabel.Rejected.status, "missing")
  assert.equal(byLabel.Rejected.reviewNote, REJECTED)
  assert.equal(byLabel.Rejected.submissionNote, SUBMITTED)
  assert.notEqual(byLabel.Rejected.reviewNote, byLabel.Rejected.submissionNote)
  assert.equal(byLabel.Waiting.reviewNote, undefined)
  assert.equal(byLabel.Waiting.submissionNote, SUBMITTED)
  assert.equal(byLabel["Never submitted"].submissionNote, undefined)
  assert.equal(byLabel["Never submitted"].reviewNote, undefined)
  assert.equal(byLabel.Rework.reworkReason, REWORK, "the rework reason keeps its own field")
  assert.equal(byLabel.Rework.status, "rework_required")
  // The old mixed-up field is gone.
  for (const item of items) assert.equal("note" in item, false)
})

test("a pending report maps every attachment to an authorised file URL, and nothing else", () => {
  registered.clear()
  const files = [
    { id: "11111111-1111-4111-8111-111111111111", name: "site-photo.png", content_type: "image/png", byte_size: 2048 },
    { id: "22222222-2222-4222-8222-222222222222", name: "inspection sheet.pdf", content_type: "application/pdf", byte_size: 1500000 },
    { id: "33333333-3333-4333-8333-333333333333", name: "close-up.jpg", content_type: "image/jpeg", byte_size: 900 },
  ]
  const pending = { id: 9, submitted_at: "2026-10-16T13:31:05.711Z", prior_stage: "Structure", prior_pct: 60, requested_stage: "Structure", note: "Slab poured", issue_categories: [], files }
  const checklistFile = "99999999-9999-4999-8999-999999999999"
  const overview = { pending_update: pending, issues: [], checklist: { items: [{ id: 5, title: "Rebar", status: "pending", file_id: checklistFile, original_name: "rebar.pdf" }] } }
  const work = mapProject(parts({ overview })).workflow
  const docs = work.pendingUpdate.attachments
  assert.deepEqual(docs.map((d) => [d.id, d.name, d.mime, d.size]), files.map((f) => [f.id, f.name, f.content_type, f.byte_size]), "every attachment, in order")
  assert.ok(docs.every((d) => d.uploaded && d.clientVisible === false))
  assert.equal(work.pendingUpdate.evidence.id, files[0].id, "the first attachment stays available as evidence")
  // URLs are the existing authorised project file route, and only the report's own files are registered for it.
  for (const f of files) assert.equal(registered.get(f.id), "/api/v1/projects/p1/phase-files/" + f.id)
  assert.equal(registered.get(checklistFile), "/api/v1/projects/p1/phase-files/" + checklistFile, "checklist files keep their own registration")
  assert.ok(!docs.some((d) => d.id === checklistFile), "checklist evidence is never listed as a report attachment")
})

test("a report without attachments, or with a malformed list, shows none", () => {
  for (const files of [undefined, null, [], "nope", {}]) {
    const pending = { id: 9, submitted_at: "2026-10-16T13:31:05.711Z", prior_stage: "Structure", prior_pct: 60, requested_stage: "Structure", note: "x", issue_categories: [], files }
    const update = mapProject(parts({ overview: { pending_update: pending, issues: [], checklist: { items: [] } } })).workflow.pendingUpdate
    assert.equal(update.attachments, undefined, JSON.stringify(files))
    assert.equal(update.evidence, undefined)
  }
})
