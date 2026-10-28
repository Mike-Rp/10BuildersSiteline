import { licenseState, type Account, type Project, type State } from "./model.ts"
import { activationChecks, assignmentBlock, isAssigned, leadConfirmed, leadId, registeredComplete, teamConfirmed } from "./workflows.ts"
import { requiredCompanies, tradeAllocationEnabled } from "./subcontractor-allocation.ts"

export type IntakeView = "all" | "action" | "waiting"
export type IntakeGuidance = {
  stage: string
  who: string
  next: string
  kind: "action" | "waiting"
  action: "edit" | "confirm" | "documents" | "reassign" | "assignment" | "coordinate" | "view"
  label: string
}
export const isIntake = (p: Project) => ["pending", "draft", "changes_requested"].includes(p.status)

// Presentation only: all destinations reuse existing screens and commands.
// Never call this with a client projection or infer access from an account scope label.
export function intakeGuidance(state: State, p: Project, actor: Account): IntakeGuidance | null {
  if (!isIntake(p) || actor.role === "client" ||
      (actor.role === "opm" && p.opmId !== actor.id) ||
      (actor.role === "spm" && !isAssigned(p, actor.id))) return null
  const person = (id: string | undefined, role: string) => !id ? "Unassigned" :
    state.accounts.find(a => a.id === id)?.name || `Assigned ${role}`
  const canAct = actor.status === "active" && licenseState(actor, state.rules.grace) !== "Grace expired"
  const lead = leadId(p)
  function step(stage: string, who: string, next: string, mine: boolean,
    action: IntakeGuidance["action"], label: string): IntakeGuidance {
    const available = mine && canAct
    return { stage, who, next, kind: available ? "action" : "waiting", action: available ? action : "view", label: available ? label : "View details" }
  }
  if (p.status === "draft" || p.status === "changes_requested")
    return step(p.status === "draft" ? "Draft" : "Changes requested", "Administrator",
      p.status === "draft" ? "Finish project details and staffing." : "Review the requested changes and resubmit intake.",
      actor.role === "admin", "edit", p.status === "draft" ? "Continue setup" : "Review changes")
  if (!p.opmId) return step("Office PM unassigned", "Unassigned", "Review the intake record; an Office PM assignment is missing.", false, "view", "View details")
  if (!p.opmAccepted) return step("Office PM acceptance", person(p.opmId, "Office PM"),
    "Office PM must review and accept the assignment or request changes.", actor.role === "opm", "confirm", "Review assignment")
  if (!registeredComplete(p)) return step("Required documents", person(p.opmId, "Office PM"),
    "Office PM must complete the six required documents before Site PM acceptance.", actor.role === "opm", "documents", "Open required documents")
  const ownPending = p.team.filter(row => row.accountId === actor.id && row.status === "pending")
  if (actor.role === "spm" && ownPending.length && !assignmentBlock(p, actor.id))
    return step(actor.id === lead ? "Lead Site PM acceptance" : "Site PM confirmations", person(actor.id, "Site PM"),
      `Review your assigned phases: ${ownPending.map(row => row.phase).join(", ")}. Accept or decline through your existing assignment controls.`, true, "assignment", "Review assignment")
  const incompleteTeam = p.team.filter(row => !row.accountId || row.status === "declined")
  if (incompleteTeam.length) return step("Phase reassignment", person(p.opmId, "Office PM"),
    `Office PM must review unassigned or declined phases: ${incompleteTeam.map(row => row.phase).join(", ")}.`,
    actor.role === "opm", "reassign", "Review phase assignments")
  if (!p.team.length || !lead) return step("Phase assignments incomplete", "Unassigned",
    "The stored phase team is incomplete. Review the intake details before continuing.", false, "view", "View details")
  if (!leadConfirmed(p)) return step("Lead Site PM acceptance", person(lead, "Lead Site PM"),
    "The project Lead must accept Mobilization before the remaining Site PMs can respond.",
    actor.role === "spm" && actor.id === lead && !assignmentBlock(p, actor.id) && p.team.some(row => row.accountId === actor.id && row.status === "pending"), "assignment", "Review assignment")
  if (!teamConfirmed(p)) {
    const pending = p.team.filter(row => row.status !== "confirmed")
    return step("Site PM confirmations", [...new Set(pending.map(row => person(row.accountId, "Site PM")))].join(", "),
      `Awaiting phase responses: ${pending.map(row => row.phase).join(", ")}.`,
      actor.role === "spm" && pending.some(row => row.accountId === actor.id && row.status === "pending") && !assignmentBlock(p, actor.id), "assignment", "Review assignment")
  }
  const checks = activationChecks(state, p)
  const clientReady = checks.find(check => check.id === "client")?.passed === true
  // Client readiness is also a gate on signed-agreement upload, not just activation.
  const mine = actor.role === "spm" && actor.id === lead
  const tradeBased = tradeAllocationEnabled(state, p)
  if (!checks.find(check => check.id === "subcontractors")?.passed)
    return step(tradeBased ? "Company team coordination" : p.clientSubcon ? "Client subcontractor review" : "Subcontractor coordination", person(lead, "Lead Site PM"),
      tradeBased ? `Lead Site PM must confirm complete discipline coverage and record acceptance from all ${requiredCompanies(p.type)} required companies.` : p.clientSubcon ? "Lead Site PM must review the client-provided subcontractor and resolve any open agreement issues." : "Lead Site PM must coordinate an approved subcontractor and record its response.", mine, "coordinate", "Review coordination")
  if (!clientReady) return step("Client account prerequisite", "Administrator",
    "The linked client record is missing or unavailable. Review the existing account and intake details; activation remains blocked.", false, "view", "View details")
  if (!tradeBased && p.clientSubcon && checks.every(check => check.passed)) return step("Ready for Lead activation", person(lead, "Lead Site PM"),
    "All existing activation checks pass. The project Lead can open the existing activation controls.", mine, "coordinate", "Review activation")
  if (!checks.find(check => check.id === "agreement")?.passed) return step("Signed agreement", person(lead, "Lead Site PM"),
    "Lead Site PM must upload the signed Site PM–Subcontractor Agreement through the existing activation workflow.", mine, "coordinate", "Open agreement requirements")
  return step("Activation verification", person(lead, "Lead Site PM"), "Review the existing activation record; no prerequisite is bypassed.", false, "view", "View details")
}

export function intakeViewCounts<T>(items: T[], pick: (item: T) => IntakeGuidance | null) {
  return { all: items.length, action: items.filter(item => pick(item)?.kind === "action").length,
    waiting: items.filter(item => pick(item)?.kind === "waiting").length }
}
