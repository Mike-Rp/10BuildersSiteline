import test from "node:test"
import assert from "node:assert/strict"
import { allocatePhaseCoverage } from "../Thesis-Backend/src/domain/engineer-phase-coverage.js"
import {
  emptyState,
  spmCandidates,
  engineerAvailabilityLabel,
} from "../src/model.ts"
test("full specialization coverage needs complementary engineers, not a tag or personnel count", () => {
  const required = [
    "Civil",
    "Structural",
    "Mechanical",
    "Electrical",
    "Plumbing",
    "Acoustic",
  ]
  const result = allocatePhaseCoverage(required, [
    { id: "a", qualifiedTags: required.slice(0, 3) },
    { id: "b", qualifiedTags: required.slice(3) },
  ])
  assert.equal(result.complete, true)
  assert.equal(result.engineers.length, 2)
  assert.ok(result.engineers.every((e) => e.tags.length <= 3))
  assert.equal(new Set(result.engineers.flatMap((e) => e.tags)).size, 6)
  const gap = allocatePhaseCoverage(required, [
    { id: "a", qualifiedTags: required.slice(0, 3) },
    { id: "b", qualifiedTags: required.slice(0, 3) },
  ])
  assert.equal(gap.complete, false)
  assert.equal(gap.missing.length, 3)
  const augment = allocatePhaseCoverage(
    ["Civil", "Structural", "Mechanical", "Electrical"],
    [
      {
        id: "broad",
        qualifiedTags: ["Civil", "Structural", "Mechanical", "Electrical"],
      },
      { id: "narrow", qualifiedTags: ["Civil"] },
    ],
  )
  assert.equal(augment.complete, true)
  assert.ok(augment.engineers.every((e) => e.tags.length <= 3))
})
test("revised policy reserves a whole engineer for one project while allowing succeeding phases in that project", () => {
  const state = emptyState()
  const account = {
    id: "a",
    name: "Mika",
    role: "spm",
    status: "active",
    hasProfessionalCredentials: true,
    eligibleForNewAssignment: true,
    expiry: "2099-12-31",
    scope: ["Civil"],
    qualifiedRequirements: ["Civil"],
    singleProjectCommitment: true,
    engineerCommitments: [
      {
        project_id: "current",
        phase: "Mobilization",
        tags: ["Civil"],
        status: "pending",
      },
    ],
  }
  state.accounts = [account]
  assert.equal(
    engineerAvailabilityLabel(account),
    "Reserved — awaiting acceptance",
  )
  assert.equal(
    spmCandidates(state, "Residential", "Foundation", "another", ["Civil"])
      .length,
    0,
  )
  assert.equal(
    spmCandidates(state, "Residential", "Foundation", "current", ["Civil"])
      .length,
    1,
  )
  account.engineerCommitments[0].status = "confirmed"
  assert.equal(engineerAvailabilityLabel(account), "Committed to a project")
  account.engineerCommitments = []
  assert.equal(engineerAvailabilityLabel(account), "Available for allocation")
  assert.equal(
    spmCandidates(state, "Residential", "Foundation", "another", ["Civil"])
      .length,
    1,
  )
})
