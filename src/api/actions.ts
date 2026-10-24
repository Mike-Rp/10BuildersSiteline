import { api, apiList, downloadApiFile, registerFileUrl } from "./client.ts";
import { headcount, type Account, type Company, type Doc, type Project, type State } from "../model.ts";
import type { WorkflowCommand } from "../workflows.ts";
import { DOC_CODES, type Dto } from "./adapter.ts";
const post = (path: string, json: unknown = {}) => api<Dto>(path, { method: "POST", json });
const issueCodes: Record<string, string> = {
    "Failed inspection": "failed_inspection", "Material defect / damage": "material_defect",
    "Rework required": "rework_required", "Design / plan change": "design_change", "Weather delay": "weather_delay",
    "Subcontractor manpower shortage": "manpower_shortage", "Safety incident": "safety_incident", "Other": "other",
};
export async function uploadFile(id: string, file: File, purpose: "document" | "manpower" = "document") {
    const body = new FormData();
    body.set("id", id);
    body.set("file", file);
    body.set("purpose", purpose);
    const saved = await api<Dto>("/files", { method: "POST", body });
    registerFileUrl(id, saved.download_url);
}
async function phaseFile(projectId: string, doc: Doc) {
    const blob = await downloadApiFile(doc.id);
    if (!blob)
        throw new Error("The uploaded evidence file is unavailable.");
    const form = new FormData();
    form.set("file", blob, doc.name);
    const saved = await api<Dto>("/projects/" + projectId + "/phase-files", { method: "POST", body: form });
    return saved.file?.id || saved.id;
}
export async function sendApiWorkflow(state: State, actor: Account, command: WorkflowCommand) {
    const id = command.projectId;
    if (!id)
        throw new Error("Select a project first.");
    const project = state.projects.find(p => p.id === id);
    if (!project)
        throw new Error("Project not found.");
    const base = "/projects/" + id;
    switch (command.type) {
        case "view_document": {
            if (!command.doc || !await downloadApiFile(command.doc.id))
                throw new Error("The document is unavailable.");
            return;
        }
        case "accept_opm":
        case "request_changes": {
            const confirmations = await apiList<Dto>("/confirmations");
            const confirmation = confirmations.find(c => c.project_id === id && c.role_context === "opm" && c.status === "pending");
            if (!confirmation)
                throw new Error("This intake has no pending confirmation for your account.");
            await post("/confirmations/" + confirmation.id + (command.type === "accept_opm" ? "/accept" : "/decline"), { note: command.note || "Intake changes requested." });
            return;
        }
        case "accept_assignment":
        case "decline_assignment": {
            const detail = await api<Dto>(base);
            const team = (detail.phase_team || []).filter((t: Dto) => t.spm_user_id === actor.id && t.status === "pending" && (!command.phase || t.stage === command.phase));
            if (!team.length)
                throw new Error("No pending phase assignments were found.");
            for (const t of team)
                await post("/confirmations/projects/" + id + "/phase-team/" + t.stage_id +
                    (command.type === "accept_assignment" ? "/accept" : "/decline"), { note: command.note || "Assignment declined." });
            return;
        }
        case "reassign_phase": {
            const assignments = await api<Dto[]>("/confirmations/projects/" + id + "/phase-team");
            const assignment = assignments.find(t => t.stage_code === command.phase);
            if (assignment && (!assignment.spm_user_id || ["declined", "auto_expired"].includes(assignment.status))) {
                await post("/archive/phase-assignments/" + assignment.assignment_id + "/reassign", { new_user_id: command.accountId, note: command.note || "Phase assignment replaced." });
                return;
            }
            const detail = await api<Dto>(base);
            await api("/projects/recommendations/update-phase-team", { method: "PUT", json: {
                    project_id: id, phase_team: detail.phase_team.map((t: Dto) => ({
                        stage: t.stage, user_id: t.stage === command.phase ? command.accountId : t.spm_user_id, is_lead: t.is_lead,
                    })),
                } });
            return;
        }
        case "submit_progress": {
            const file_ids = command.evidence ? [await phaseFile(id, command.evidence)] : [];
            if(command.issues?.length){
                await post(base+"/rework-requests",{stage:project.phase,reason:command.note,
                    issue_categories:command.issues.map(v=>issueCodes[v]||v),affected_activity_ids:command.affectedActivityIds||[],file_ids});
                return;
            }
            await post(base + "/phase-updates", { stage: command.phase || project.phase, note: command.note,
                issue_categories: (command.issues || []).map(v => issueCodes[v] || v), file_ids });
            return;
        }
        case "submit_checklist": {
            if (!command.doc)
                throw new Error("Choose checklist evidence.");
            const file_id = await phaseFile(id, command.doc);
            await post(base + "/checklist-items/" + command.itemId + "/submit", { file_id, submission_note: command.note });
            return;
        }
        case "approve_checklist":
        case "reject_checklist": {
            const item = project.workflow?.checklist[command.phase || project.phase]?.find(i => i.id === command.itemId);
            const evidenceId = command.evidenceId || item?.evidenceId;
            if (!evidenceId)
                throw new Error("No submitted evidence was found.");
            if (!command.expectedReviewToken) throw new Error("Open a fresh review preview before reviewing evidence.");
            const rejected = command.type === "reject_checklist";
            return await post(base + "/evidence/" + evidenceId + (rejected ? "/reject" : "/approve"), {
                review_note: command.note,
                expected_review_token:command.expectedReviewToken,
            });
        }
        case "approve_update":
        case "request_update": {
            if (command.type === "request_update") {
                await post(base + "/notes", { note_text: command.note || "Office PM requested a progress update." });
                return;
            }
            const pending = project.workflow?.pendingUpdate;
            if (!pending)
                throw new Error("No pending phase update was found.");
            await post(base + "/phase-updates/" + pending.id + "/approve", { resolution_note: command.note || "Reviewed." });
            return;
        }
        case "reject_update": {
            // Only the report is rejected: no checklist credit changes and no phase advances.
            const pending = project.workflow?.pendingUpdate;
            if (!pending)
                throw new Error("No pending phase update was found.");
            const reason = command.note?.trim();
            if (!reason)
                throw new Error("Enter the reason for rejecting this report. The Site PM will see it.");
            await post(base + "/phase-updates/" + pending.id + "/reject", { resolution_note: reason });
            return;
        }
        case "approve_rework":
        case "decline_rework": {
            const requestId=command.requestId||project.workflow?.pendingRework?.id;
            if (!requestId)
                throw new Error("No pending rework request was found.");
            await post("/rework-requests/" + requestId + (command.type === "approve_rework" ? "/approve" : "/reject"), {
                resolution_note:command.note,selected_activity_ids:command.selectedActivityIds,
                expected_review_token:command.expectedReviewToken,
            });
            return;
        }
        case "add_note":
            await post(base + "/notes", { note_text: command.note });
            return;
        case "request_company":
            await post(base + "/workspace-command", command);
            return;
        case "replace_company":
            await post(base + "/workspace-command", { ...command, type: "contact_company", companyId: command.replacementCompanyId });
            return;
        case "select_company": throw new Error("Contact the recommended company to start allocation.");
        default: await post(base + "/workspace-command", command);
    }
}
function accountPayload(account: Account) {
    const scope = account.role === "spm" ? { disciplines: account.scope } : account.role === "opm" ?
        { project_types: account.projectTypes } : account.role === "client" ? { projects: account.scope } : undefined;
    return { full_name: account.name, email: account.email, phone: account.phone, role: account.role, scope };
}
// New staff are sent as name parts; the server assigns the ID number and builds the work email from it.
// Clients are sent as before, with the email they were given.
function newAccountPayload(account: Account) {
    const { email, full_name, ...rest } = accountPayload(account);
    if (account.role === "client")
        return { email, full_name, ...rest };
    return { ...rest, first_name: account.firstName, middle_name: account.middleName || undefined,
        last_name: account.lastName, suffix: account.suffix || undefined };
}
export async function saveApiAccount(account: Account, existing: boolean, password?: string) {
    const previous = existing ? await api<Dto>("/accounts/" + account.id) : undefined;
    const payload = existing ? accountPayload(account) : newAccountPayload(account);
    if (existing)
        delete (payload as Partial<ReturnType<typeof accountPayload>>).role;
    const saved = await api<Dto>(existing ? "/accounts/" + account.id : "/accounts", {
        method: existing ? "PATCH" : "POST", json: { ...payload, ...(!existing && password ? { password } : {}) },
    });
    const id = saved.id || account.id;
    if (existing && account.status !== previous?.status && ["active", "suspended", "invited"].includes(account.status))
        await api("/accounts/" + id + "/status", { method: "PATCH", json: { status: account.status } });
    // Keep the real email and ID in the workspace copy, not the preview shown while the form was open.
    const stored = existing ? account : { ...account, email: saved.email ?? account.email,
        idNumber: saved.id_number ?? account.idNumber, workEmail: saved.work_email ?? account.workEmail };
    await api("/accounts/" + id + "/workspace", {
        method: "PUT", json: stored,
    });
    return { id, password: saved.temp_password || password, idNumber: saved.id_number as string | undefined,
        email: (saved.email ?? account.email) as string, generatedEmail: Boolean(saved.work_email) };
}
export async function createCompany(company: Company) {
    const saved = await post("/subcontractors", { company_name: company.name, contact_email: company.email || undefined,
        trade: "Structural / Rebar", meta_description: company.note || undefined });
    await api("/subcontractors/" + saved.id + "/workspace", { method: "PUT", json: { ...company, status: company.status === "pending" ? "pending" : "approved" } });
    return saved;
}
export async function saveApiProject(project: Project, existing: boolean) {
    const result = await post("/projects/intake", {
        name: project.name, project_type: project.type, floor_area_sqm: Number(project.area.replace(/,/g, "")),
        floor_count: Number(project.floors), target_start_date: project.start, client_user_id: project.clientId,
        suggested_opm_id: project.opmId, crew_required: headcount(project.type, project.area, project.floors).total,
        phase_team: project.team.map((t, index) => ({ stage: t.phase, user_id: t.accountId, is_lead: index === 0 })),
        ...(existing ? { draft_project_id: project.id } : { intake_id: project.id }),
    });
    const id = result.project.id;
    try {
        await api("/projects/" + id + "/workspace", { method: "PUT", json: project });
    }
    catch (error) {
        throw new PartialProjectSave(id, (error as Error).message);
    }
    return id as string;
}
// The project and its OPM confirmation exist; only the follow-up workspace details failed to save.
export class PartialProjectSave extends Error {
    id: string;
    constructor(id: string, reason: string) {
        super("Project sent, some details did not save: " + reason);
        this.id = id;
    }
}
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
export async function persistAdminChanges(before: State, after: State) {
    for (const account of after.accounts) {
        const old = before.accounts.find(a => a.id === account.id);
        if (changed(old, account)) {
            if (old && account.status === "deactivated" && old.status !== "deactivated") {
                await post("/archive/accounts/" + account.id + "/remove", { reason: "Administrator archived inactive account." });
            }
            else
                await saveApiAccount(account, !!old);
        }
    }
    for (const company of after.companies) {
        const old = before.companies.find(c => c.id === company.id);
        if (!old)
            await createCompany(company);
        else if (changed(old, company))
            await api("/subcontractors/" + company.id + "/workspace", { method: "PUT", json: company });
    }
    for (const project of after.projects) {
        const old = before.projects.find(p => p.id === project.id);
        if (!old)
            await saveApiProject(project, false);
        else if (changed(old, project)) {
            if (old.status !== project.status && project.status === "completed")
                await post("/archive/projects/" + project.id + "/close", {});
            if (changed(old.team, project.team)) {
                const assignments = await api<Dto[]>("/confirmations/projects/" + project.id + "/phase-team");
                const replaced = project.team.filter(t => old.team.find(a => a.phase === t.phase)?.accountId !== t.accountId);
                if (assignments.some(t => t.status === "confirmed")) {
                    for (const row of replaced) {
                        const assignment = assignments.find(t => t.stage_code === row.phase);
                        if (!assignment)
                            throw new Error("Phase assignment was not found.");
                        await post("/archive/phase-assignments/" + assignment.assignment_id + "/reassign", { new_user_id: row.accountId, note: "Administrator reassigned the phase." });
                    }
                }
                else
                    await api("/projects/recommendations/update-phase-team", { method: "PUT", json: { project_id: project.id,
                            phase_team: project.team.map((t, index) => ({ stage: t.phase, user_id: t.accountId, is_lead: index === 0 })) } });
            }
            await api("/projects/" + project.id + "/workspace", { method: "PUT", json: project });
        }
    }
    if (changed(before.muted, after.muted))
        await post("/workspace/preferences", { muted: after.muted });
    if (changed(before.rules, after.rules))
        await api("/workspace/settings", { method: "PUT", json: after.rules });
    const ids = after.events.filter(e => e.read && !before.events.find(p => p.id === e.id)?.read).map(e => e.id);
    if (ids.length)
        await post("/notifications/read", { ids });
}
