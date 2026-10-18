import assert from "node:assert/strict"
import test from "node:test"
import { initialState } from "../src/model.ts"
import {
  eligibleCandidates,
  featuredCandidate,
  recommendationReason,
} from "../src/featuredCompany.ts"
import {
  subcontractorRecommendations,
  workflowFor,
} from "../src/workflows.ts"
import {
  currentProject,
  evidence,
  execute,
} from "./fixtures.mjs"

function teamReady() {
  let state = execute(initialState(), "a2", { type: "accept_opm" })
  for (let i = 0; i < 6; i++)
    state = execute(state, "a2", {
      type: "upload_registered",
      docIndex: i,
      doc: evidence(`required-${i}.png`),
    })
  state = execute(state, "a4", { type: "accept_assignment" })
  return execute(state, "a5", { type: "accept_assignment" })
}
const ranked = (state) =>
  subcontractorRecommendations(state, currentProject(state)).map(
    (r) => r.company.id,
  )
const featuredId = (state) =>
  featuredCandidate(state, currentProject(state))?.company.id

test("the featured company is the top-ranked approved company", () => {
  const state = teamReady()
  const [top] = ranked(state)
  assert.equal(featuredId(state), top)
  // Unapproved companies are never ranked or featured.
  const pending = state.companies.filter((c) => c.status !== "approved")
  assert.ok(pending.length > 0)
  assert.ok(!ranked(state).some((id) => pending.some((c) => c.id === id)))
})

test("featuring creates no selection record until the Lead contacts a company", () => {
  const state = teamReady()
  const before = JSON.stringify(state)
  featuredCandidate(state, currentProject(state))
  eligibleCandidates(state, currentProject(state))
  assert.equal(JSON.stringify(state), before)
  assert.equal(workflowFor(currentProject(state)).selections.length, 0)
})

test("after a decline the featured company becomes the next eligible one", () => {
  let state = teamReady()
  const [first, second] = ranked(state)
  assert.equal(featuredId(state), first)
  state = execute(state, "a4", { type: "contact_company", companyId: first })
  // While awaiting a reply nothing is featured (the Project subcontractor card takes over).
  assert.equal(featuredId(state), undefined)
  state = execute(state, "a4", {
    type: "respond_company",
    companyId: first,
    accepted: false,
  })
  assert.equal(featuredId(state), second)
  assert.ok(
    !eligibleCandidates(state, currentProject(state)).some(
      (c) => c.company.id === first,
    ),
  )
})

test("nothing is featured after an acceptance, or when no company is eligible", () => {
  let state = teamReady()
  const [first] = ranked(state)
  const accepted = execute(
    execute(state, "a4", { type: "contact_company", companyId: first }),
    "a4",
    { type: "respond_company", companyId: first, accepted: true },
  )
  assert.equal(featuredId(accepted), undefined)
  for (const c of state.companies) if (c.status === "approved") c.status = "archived"
  assert.equal(featuredId(state), undefined)
  assert.equal(eligibleCandidates(state, currentProject(state)).length, 0)
})

test("the why-recommended line uses only ranking factors", () => {
  const state = teamReady()
  const pool = eligibleCandidates(state, currentProject(state))
  const reason = recommendationReason(pool[0], pool)
  assert.match(reason, /commitment/)
  assert.match(reason, /^[A-Za-z0-9 ,()·\-’']+$/)
  const solo = recommendationReason(pool[0], [pool[0]])
  assert.match(solo, /other active project/)
})
