import { initialState } from "./fixtures/demo-state.ts"
import { applyWorkflow, subcontractorRecommendations } from "../src/workflows.ts"
export const NOW = Date.parse("2026-10-14T08:00:00Z")
export const currentProject = (state) =>
  state.projects.find((p) => p.id === "p4")
// The company the system ranks first (no conflicting commitment, has manpower).
export const suggestedCompanyId = (state) =>
  subcontractorRecommendations(state, currentProject(state)).find(
    (candidate) => !candidate.committed && candidate.availableManpower > 0,
  ).company.id
export const evidence = (name = "evidence.png") => ({
  id: crypto.randomUUID(),
  label: "Selected evidence",
  name,
  uploaded: true,
  owner: "Demo",
  date: "2026-10-14",
  size: 200,
  mime: "image/png",
  clientVisible: false,
})
export const execute = (state, actor, command, now = NOW) =>
  applyWorkflow(state, actor, { projectId: "p4", ...command }, now)
export function activeFixture() {
  let state = execute(initialState(), "a2", { type: "accept_opm" })
  for (let i = 0; i < 6; i++)
    state = execute(state, "a2", {
      type: "upload_registered",
      docIndex: i,
      doc: evidence(`required-${i}.png`),
    })
  state = execute(state, "a4", { type: "accept_assignment" })
  state = execute(state, "a5", { type: "accept_assignment" })
  const companyId = suggestedCompanyId(state)
  state = execute(state, "a4", { type: "contact_company", companyId })
  state = execute(state, "a4", {
    type: "respond_company",
    companyId,
    accepted: true,
  })
  return execute(state, "a4", {
    type: "upload_agreement",
    doc: evidence("signed.png"),
  })
}
