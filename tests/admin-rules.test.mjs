import assert from "node:assert/strict"
import test from "node:test"
import {
  accountError,
  clientForEmail,
  eligible,
  headcount,
  initialState,
  licenseState,
  opmCandidates,
  phaseDefinitions,
  projectDocs,
  projectPhaseNames,
  requiredTags,
  spmCandidates,
  validateFile,
  workload,
} from "../src/model.ts"
import {
  activeAssignmentsForAccount,
  beginAccountResignation,
  checklistFor,
  processWorkflowTimers,
  projectStageFloor,
  teamConfirmed,
} from "../src/workflows.ts"

const RESIGNATION_NOW = Date.parse("2026-10-14T08:00:00Z")
const resignationLetter = () => ({
  id: crypto.randomUUID(),
  label: "Resignation Letter",
  name: "resignation.pdf",
  uploaded: true,
  owner: "Administrator",
  date: "2026-10-14",
  size: 200,
  mime: "application/pdf",
  clientVisible: false,
})

test("registered document visibility fails closed for internal agreements and budgets", () => {
  const docs = projectDocs()
  assert.deepEqual(
    docs.map((d) => d.clientVisible),
    [true, true, false, true, true, false, false],
  )
  assert.ok(docs.every((d) => !d.uploaded))
})
test("upload presets preserve exact size limits and case-insensitive extensions", () => {
  assert.equal(
    validateFile(new File([new Uint8Array(10 * 1024 * 1024)], "contract.PDF")),
    "",
  )
  assert.match(
    validateFile(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "contract.pdf"),
    ),
    /10 MB/,
  )
  assert.match(validateFile(new File(["bad"], "contract.exe")), /PDF/)
  assert.equal(
    validateFile(
      new File([new Uint8Array(15 * 1024 * 1024)], "crew.XLSX"),
      true,
    ),
    "",
  )
  assert.match(
    validateFile(
      new File([new Uint8Array(15 * 1024 * 1024 + 1)], "crew.xls"),
      true,
    ),
    /15 MB/,
  )
})
test("account email uniqueness is case-insensitive and scope limits are enforced", () => {
  const state = initialState()
  const sample = {
    ...state.accounts[3],
    id: "new",
    email: state.accounts[0].email.toUpperCase(),
  }
  assert.match(accountError(sample, state), /already assigned/)
  assert.match(
    accountError({ ...sample, email: "unique@example.com", scope: [] }, state),
    /one to three/,
  )
  assert.match(
    accountError(
      {
        ...sample,
        email: "unique@example.com",
        scope: ["Civil", "Structural", "Electrical", "Mechanical"],
      },
      state,
    ),
    /one to three/,
  )
  assert.equal(
    accountError({ ...sample, email: "unique@example.com" }, state),
    "",
  )
})
test("existing client lookup is case-insensitive and never returns staff accounts", () => {
  const state = initialState()
  assert.equal(clientForEmail(state, " F.UY@ALDENHEIGHTS-HOA.COM ").id, "a9")
  assert.equal(clientForEmail(state, state.accounts[0].email), undefined)
})
test("active workload counts project ownership once, excluding historical projects", () => {
  const state = initialState()
  assert.equal(workload(state, "a2"), 1)
  assert.equal(workload(state, "a3"), 2)
  assert.equal(workload(state, "a2", "p1"), 0)
})
test("Office PM recommendations honor capacity, suspension, cooldown and exclusion", () => {
  const state = initialState()
  assert.equal(opmCandidates(state, "Residential")[0].id, "a2")
  assert.equal(opmCandidates(state, "Residential", "", ["a2"]).length, 0)
  state.accounts[1].cooldown = Date.now() + 86400000
  assert.equal(opmCandidates(state, "Residential").length, 0)
  state.accounts[1].cooldown = undefined
  state.accounts[1].status = "suspended"
  assert.equal(eligible(state, state.accounts[1], "opm"), false)
})
test("active project leads cannot be recommended to another project", () => {
  const state = initialState()
  const names = spmCandidates(state, "Residential", "Mobilization").map(
    (c) => c.account.id,
  )
  assert.ok(
    !names.includes("a6") && !names.includes("a7") && !names.includes("a8"),
  )
  assert.ok(names.includes("a4"))
  assert.ok(
    spmCandidates(state, "Commercial", "Structure", "p1").some(
      (c) => c.account.id === "a6",
    ),
  )
})
test("routine resignation blocks active assignments and holds eligible employees", () => {
  const state = initialState()
  assert.ok(activeAssignmentsForAccount(state, "a6").length > 0)
  assert.throws(
    () =>
      beginAccountResignation(
        state,
        "a1",
        "a6",
        resignationLetter(),
        30,
        RESIGNATION_NOW,
      ),
    /active project assignments/,
  )
  const assignments = structuredClone(
    state.projects.find((project) => project.id === "p4").team,
  )
  const held = beginAccountResignation(
    state,
    "a1",
    "a4",
    resignationLetter(),
    30,
    RESIGNATION_NOW,
  )
  const employee = held.accounts.find((account) => account.id === "a4")
  assert.equal(employee.status, "active")
  assert.equal(employee.assignmentHold, true)
  assert.equal(employee.resignation.status, "notice")
  assert.equal(employee.resignation.noticeDays, 30)
  assert.equal(employee.docs.at(-1).label, "Resignation Letter")
  assert.equal(eligible(held, employee, "spm"), false)
  assert.deepEqual(
    held.projects.find((project) => project.id === "p4").team,
    assignments,
  )
  assert.equal(
    state.accounts.find((account) => account.id === "a4").assignmentHold,
    undefined,
  )
})
test("notice-period completion deactivates the account and retains its audit record", () => {
  const held = beginAccountResignation(
    initialState(),
    "a1",
    "a4",
    resignationLetter(),
    2,
    RESIGNATION_NOW,
  )
  const completed = processWorkflowTimers(
    held,
    RESIGNATION_NOW + 2 * 86400000 + 1,
  )
  const employee = completed.accounts.find((account) => account.id === "a4")
  assert.equal(employee.status, "deactivated")
  assert.equal(employee.resignation.status, "deactivated")
  assert.ok(employee.resignation.deactivatedAt)
  assert.equal(employee.assignmentHold, true)
  assert.match(completed.events[0].title, /deactivated/)
})
test("size-tier recommendations preserve source area/floor thresholds", () => {
  assert.deepEqual(requiredTags("Residential", "Foundation"), [
    "Geotechnical",
    "Structural",
  ])
  assert.equal(headcount("Residential", "9,999", "9").multiplier, 1)
  assert.equal(headcount("Residential", "10,000", "9").multiplier, 2)
  assert.equal(headcount("Residential", "1,000", "25").multiplier, 3)
  const result = headcount("Commercial", "30,000", "3")
  assert.equal(result.total, result.base * 3)
})
test("project types generate the required construction sequences and disciplines", () => {
  const residential = phaseDefinitions("Residential")
  const commercial = phaseDefinitions("Commercial")
  const mixed = phaseDefinitions("Mixed-Use")
  assert.deepEqual(
    residential.map((phase) => phase.name),
    [
      "Mobilization",
      "Design",
      "Foundation",
      "Structure",
      "Envelope",
      "MEP Rough-In",
      "Finishes",
      "Landscape & Site Works",
      "Closeout",
    ],
  )
  assert.equal(commercial.length, 9)
  assert.equal(mixed.length, 12)
  assert.deepEqual(
    commercial.find((phase) => phase.name === "Fire & Life Safety").disciplines,
    ["Fire Protection", "Electrical"],
  )
  assert.deepEqual(
    mixed.find((phase) => phase.name === "Residential Fit-Out").disciplines,
    ["Interior/Finishes", "Plumbing", "Electrical"],
  )
})
test("historical projects retain their stored phase assignments", () => {
  const historical = initialState().projects.find(
    (project) => project.id === "p4",
  )
  assert.equal(projectPhaseNames(historical).length, 7)
  assert.equal(projectPhaseNames(historical)[4], "MEP Rough-in")
})
test("project-specific phases drive acceptance, monitoring, and checklist reuse", () => {
  const project = initialState().projects.find((item) => item.id === "p4")
  project.type = "Mixed-Use"
  project.phase = "Tower Structure"
  project.team = phaseDefinitions(project.type).map((phase, sequence) => ({
    phase: phase.name,
    accountId: sequence % 2 ? "a5" : "a4",
    status: "confirmed",
    requiredDisciplines: phase.disciplines,
    sequence,
  }))
  assert.equal(teamConfirmed(project), true)
  assert.equal(projectStageFloor(project), 36)
  assert.deepEqual(project.team[9].requiredDisciplines, [
    "Interior/Finishes",
    "Plumbing",
    "Electrical",
  ])
  assert.ok(checklistFor(project, "Envelope / Curtain Wall").length > 0)
})
test("license grace states are based on current date rather than frozen demo dates", () => {
  assert.equal(licenseState({ expiry: "" }), "Not on file")
  const daysAgo = (d) =>
    new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
  assert.equal(licenseState({ expiry: daysAgo(2) }, 7), "Expired")
  assert.equal(licenseState({ expiry: daysAgo(20) }, 7), "Grace expired")
})
