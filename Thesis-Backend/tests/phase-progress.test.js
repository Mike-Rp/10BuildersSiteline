import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

const access = await import("../src/common/utilities/access.utility.js");
let client;
mock.module("../src/common/utilities/transaction.utility.js", {
  namedExports: { withTransaction: async callback => callback(client) },
});
mock.module("../src/common/utilities/access.utility.js", {
  namedExports: {
    ...access,
    requireUser: async (req, res, roles) => {
      if (!req.actor) { access.sendError(res, "Missing token.", 401); return null; }
      if (roles && !roles.includes(req.actor.role)) { access.sendError(res, "Forbidden.", 403); return null; }
      return req.actor;
    },
    hasProjectAccess: async user => user.allowed !== false,
    isProjectOpmOrAdmin: async user => ["opm", "admin"].includes(user.role) && user.allowed !== false,
  },
});
const archiveAudit=await import("../src/services/archive/audit.utility.js");
mock.module("../src/services/archive/audit.utility.js",{namedExports:{...archiveAudit,recordArchiveEvent:async()=>({id:"1",changed_at:"2026-10-09T00:00:00Z"})}});
const utility = await import("../src/services/progress/phase.utility.js");
const controller = await import("../src/services/progress/phase.controller.js");
const updateController = await import("../src/services/progress/phase-update.controller.js");
const updateUtility = await import("../src/services/progress/phase-update.utility.js");
const legacy = await import("../src/services/progress/controller.js");
const projects = await import("../src/services/projects/controller.js");
const { fileType } = await import("../src/services/progress/phase-upload.utility.js");

const projectId = "11111111-1111-4111-8111-111111111111";
const spm = { id: "22222222-2222-4222-8222-222222222222", role: "spm" };
const opm = { id: "33333333-3333-4333-8333-333333333333", role: "opm" };
const fileId = "44444444-4444-4444-8444-444444444444";

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}
function setup(options = {}) {
  const state = {
    p: { id: projectId, current_stage_id: 4, current_stage: "Structure", current_pct: 0,
      lifecycle_status: "active", project_type_id: 1 },
    phaseOwner: spm.id,
    evidence: { id: "7", project_id: projectId, project_stage_id: 4,
      checklist_item_id: "1", status: "pending", file_id: fileId, submitted_by: spm.id, phase_update_id: null },
    items: Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), required: true, status: "missing" })),
    queries: [], history: [], issues: [], update: null, next: null, fileRows: [],
    ...options,
  };
  client = {
    async query(sql, params = []) {
      sql = sql.replace(/\s+/g, " ").trim();
      state.queries.push({ sql, params });
      const result = rows => ({ rows, rowCount: rows.length });
      if (sql.startsWith("SELECT p.*")) return result([state.p]);
      if (sql.includes("FROM project_phase_team") && sql.startsWith("SELECT 1")) {
        return result(params[1] === state.phaseOwner ? [{}] : []);
      }
      
      if (sql.startsWith("SELECT s.id,s.code,w.sort_order FROM project_type_stages")) {
        const all = updateUtility.STAGES.map((code, i) => ({ id: i + 1, code, sort_order: i + 1 }));
        return result(all.filter(stage => (params[1] == null || stage.id === Number(params[1])) &&
          (params[2] == null || stage.code.toLowerCase() === params[2].toLowerCase())));
      }
      if (sql.startsWith("SELECT project_stage_id FROM project_phase_checklist_items")) return result([{ project_stage_id: 4 }]);
      if (sql.startsWith("SELECT id FROM project_phase_updates")) return result(state.update?.status === "pending" ? [state.update] : []);
      if (sql.startsWith("SELECT * FROM project_phase_updates")) return result(state.update ? [state.update] : []);
      if (sql.startsWith("INSERT INTO project_phase_updates")) {
        state.update = { id: "42", project_id: params[0], selected_stage_id: params[1], prior_stage_id: params[2],
          prior_pct: params[3], note: params[4], issue_categories: params[5], issue_reason: params[6], submitted_by: params[7], status: "pending" };
        return result([state.update]);
      }
      if (sql.startsWith("SELECT 1 FROM project_phase_evidence")) return result(state.evidence.status === "rejected" && state.evidence.phase_update_id === params[0] ? [{}] : []);
      if (sql.startsWith("UPDATE project_phase_updates")) { state.update.status = sql.includes("status = 'approved'") ? "approved" : "rejected"; return result([state.update]); }
      if (sql.startsWith("INSERT INTO pending_rework_requests")) {
        const issue = { id: "88", reason: params[2], issue_categories: params[3], phase_update_id: params[4], status: "pending" };
        state.issues.push(issue); return result([issue]);
      }
      if (sql.startsWith("UPDATE pending_rework_requests")) return result(state.issues);
      if (sql.startsWith("INSERT INTO project_phase_submission_files")) return result([{}]);
      if (sql.startsWith("SELECT id FROM project_stages")) return result([{ id: params[0] }]);
      if (sql.startsWith("INSERT INTO project_phase_checklists")) return result([]);
      if (sql.startsWith("SELECT i.id")) {
        const items = Number(params[1]) === 4 ? state.items : (state.extraStageItems?.[params[1]] ?? state.nextItems ?? []);
        const rows = items.map(item => ({ ...item,
          status: String(item.id) === String(state.evidence.checklist_item_id) ? state.evidence.status : item.status,
          evidence_id: state.evidence.id, file_id: state.evidence.file_id, submitted_by: state.evidence.submitted_by, phase_update_id: state.evidence.phase_update_id }));
        return result(rows);
      }
      if (sql.startsWith("SELECT * FROM project_phase_evidence")) return result([state.evidence]);
      if (sql.startsWith("SELECT id FROM project_phase_evidence")) return result([{ id: state.evidence.id }]);
      if (sql.startsWith("UPDATE project_phase_evidence")) {
        if (sql.includes("SET phase_update_id")) state.evidence.phase_update_id = params[1];
        else state.evidence.status = sql.includes("status = 'approved'") ? "approved" : sql.includes("status = 'rejected'") ? "rejected" : params[1];
        return result([{ id: params[0] }]);
      }
      if (sql.startsWith("INSERT INTO project_progress_history")) {
        state.history.push(params);
        return result([{ id: "90", recorded_at: "2026-10-09T00:00:00Z" }]);
      }
      if (sql.startsWith("UPDATE projects SET current_pct")) { if (params[3] === undefined || Number(params[3]) === Number(state.p.current_stage_id)) state.p.current_pct = params[1]; return result([state.p]); }
      if (sql.startsWith("UPDATE projects SET current_stage_id")) {
        state.p.current_stage_id = params[1]; state.p.current_pct = params[2]; return result([state.p]);
      }
      if (sql.startsWith("SELECT id FROM project_phase_files")) return result(state.fileRows.filter(file => params[0].includes(file.id)));
      if (sql.startsWith("SELECT s.id AS project_stage_id")) return result(state.next ? [state.next] : []);
      if (sql.startsWith("INSERT INTO project_phase_files")) { state.fileRows.push({ id: params[0] }); return result([{ id: params[0] }]); }
      if (sql.startsWith("INSERT INTO project_phase_evidence")) {
        state.evidence = { ...state.evidence, status: "pending", id: "8", file_id: params[3], phase_update_id: params[6] };
        return result([{ id: "8", status: "pending" }]);
      }
      if (sql.startsWith("INSERT INTO project_phase_update_files")) return result([{}]);
      if (sql.startsWith("UPDATE projects SET name")) return result([{ id: projectId, name: params[2] }]);
      throw new Error("Unexpected query: " + sql);
    },
  };
  return state;
}
const request = (actor = spm, body = {}, params = {}) => ({
  actor, body, params: { id: projectId, evidenceId: "7", itemId: "1", ...params },
});

test("required checklist progress rounds percentages and handles no configured items", () => {
  assert.equal(utility.checklistPct(0, 5), 0);
  assert.equal(utility.checklistPct(1, 5), 20);
  assert.equal(utility.checklistPct(5, 5), 100);
  assert.equal(utility.checklistPct(2, 3), 67);
  assert.equal(utility.checklistPct(0, 0), 0);
  assert.throws(() => utility.checklistPct(6, 5));
});

test("optional items do not change the denominator or progress", async () => {
  setup({ items: [{ id: "1", required: true }, { id: "2", required: false, status: "approved" }] });
  const summary = await utility.readChecklist(client, projectId, 4);
  assert.equal(summary.required_count, 1);
  assert.equal(summary.approved_count, 0);
  assert.equal(summary.pct, 0);
});

test("an SPM without a project assignment cannot submit", async () => {
  const state = setup({ phaseOwner: opm.id });
  const res = response();
  await controller.submitPhaseUpdate(request(), res);
  assert.equal(res.statusCode, 403);
  assert.equal(state.history.length, 0);
});

test("an assigned SPM can select another stage and submit it for OPM confirmation", async () => {
  const state = setup();
  const res = response();
  await controller.submitPhaseUpdate(request(spm, { stage_id: 5 }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.status, "pending");
  assert.equal(state.p.current_stage_id, 4);
  assert.equal(state.update.selected_stage_id, 5);
  assert.equal(state.history.length, 0);
});

test("manual percentage is rejected even if it equals the calculated percentage", async () => {
  const state = setup();
  const res = response();
  await controller.submitPhaseUpdate(request(spm, { pct: 0 }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(state.history.length, 0);
});

test("OPM approval advances progress by one fifth and records approved history", async () => {
  const state = setup();
  const res = response();
  await controller.approveEvidence(request(opm), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.current_pct, 20);
  assert.equal(state.p.current_pct, 20);
  assert.equal(state.history[0][2], 20);
  assert.equal(state.history[0][4], false);
  assert.match(state.queries[0].sql, /FOR UPDATE OF p/);
});

test("a second approval cannot increment progress again", async () => {
  const state = setup();
  await controller.approveEvidence(request(opm), response());
  const res = response();
  await controller.approveEvidence(request(opm), res);
  assert.equal(res.statusCode, 409);
  assert.equal(state.history.length, 1);
  assert.equal(state.p.current_pct, 20);
});

test("SPM cannot approve evidence", async () => {
  const state = setup();
  const res = response();
  await controller.approveEvidence(request(spm), res);
  assert.equal(res.statusCode, 403);
  assert.equal(state.queries.length, 0);
});

test("an unrelated OPM cannot review the project", async () => {
  const state = setup();
  const res = response();
  await controller.approveEvidence(request({ ...opm, allowed: false }), res);
  assert.equal(res.statusCode, 404);
  assert.equal(state.evidence.status, "pending");
});

test("rejected evidence requires a reason and contributes no progress", async () => {
  const state = setup();
  const empty = response();
  await controller.rejectEvidence(request(opm), empty);
  assert.equal(empty.statusCode, 400);
  const res = response();
  await controller.rejectEvidence(request(opm, { review_note: "Missing test results." }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.current_pct, 0);
  assert.equal(state.evidence.status, "rejected");
  assert.equal(state.history.length, 0);
});

test("reviewing a previous stage does not overwrite the current stage percentage", async () => {
  const state = setup();
  state.evidence.project_stage_id = 3;
  const res = response();
  await controller.approveEvidence(request(opm), res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.p.current_pct, 0);
  assert.equal(state.history[0][1], 3);
});

test("a pending or approved item cannot be overwritten with another upload", async () => {
  const state = setup();
  const req = request();
  req.user = spm;
  req.file = { originalname: "test.pdf", buffer: Buffer.from("%PDF-test") };
  const res = response();
  await controller.uploadEvidence(req, res);
  assert.equal(res.statusCode, 409);
  assert.equal(state.queries.some(q => q.sql.startsWith("INSERT INTO project_phase_files")), false);
});

test("rejected evidence can be resubmitted without erasing the prior review", async () => {
  const state = setup();
  state.evidence.status = "rejected";
  const req = request();
  req.user = spm;
  req.file = { originalname: "test.pdf", buffer: Buffer.from("%PDF-test") };
  const res = response();
  await controller.uploadEvidence(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(state.queries.some(q => q.sql.startsWith("INSERT INTO project_phase_evidence")), true);
  assert.equal(state.queries.some(q => q.sql.startsWith("DELETE FROM project_phase_evidence")), false);
});

test("file signatures are validated instead of trusting a supplied MIME type", () => {
  assert.equal(fileType({ buffer: Buffer.from("%PDF-test"), mimetype: "text/plain" }), "application/pdf");
  assert.throws(() => fileType({ buffer: Buffer.from("<script>test</script>"), mimetype: "application/pdf" }),
    /Supported files/);
  assert.throws(() => fileType({ buffer: Buffer.alloc(0) }), /non-empty/);
});

test("an update cannot attach files from another user or phase", async () => {
  const state = setup();
  const res = response();
  await controller.submitPhaseUpdate(request(spm, { file_ids: [fileId] }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(state.history.length, 0);
});

test("note-only updates wait for OPM confirmation", async () => {
  const state = setup();
  state.evidence.status = "approved";
  const res = response();
  await controller.submitPhaseUpdate(request(spm, { note: "Pour complete." }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.status, "pending");
  assert.equal(state.p.current_pct, 0);
  assert.equal(state.update.note, "Pour complete.");
  assert.equal(state.history.length, 0);
});

test("advancing a phase requires every required approval", async () => {
  const state = setup({ next: { project_stage_id: 5, status: "confirmed", code: "MEP Rough-in" } });
  const res = response();
  await controller.advancePhase(request(opm), res);
  assert.equal(res.statusCode, 422);
  assert.equal(state.p.current_stage_id, 4);
});

test("the legacy progress submission endpoint cannot bypass system progress", async () => {
  const state = setup();
  const res = response();
  await legacy.submitProgressUpdate(request(spm, { stage_id: 4, pct: 99 }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(state.history.length, 0);
});

test("legacy progress approvals are retired instead of changing progress", async () => {
  const state = setup();
  const res = response();
  await legacy.approveProgressUpdate(request(opm), res);
  assert.equal(res.statusCode, 410);
  assert.equal(state.queries.length, 0);
});

test("project detail edits update projects and never users", async () => {
  const state = setup();
  const res = response();
  await projects.updateProject(request(opm, { name: "Rosaria Business Park" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.queries.some(q => /UPDATE users/.test(q.sql)), false);
});

test("project detail endpoint rejects current_pct edits", async () => {
  const state = setup();
  const res = response();
  await projects.updateProject(request(opm, { current_pct: 100 }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(state.queries.length, 0);
});

const subcontractors = await import("../src/services/subcontractors/controller.js");
test("approving a crew assigns available workers and refreshes the project numerator", async () => {
  const workerIds = ["55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"];
  const queries = [];
  client = { async query(sql, params = []) {
    sql = sql.replace(/\s+/g, " ").trim();
    queries.push({ sql, params });
    const result = rows => ({ rows, rowCount: rows.length });
    if (sql.startsWith("SELECT lifecycle_status FROM projects")) return result([{lifecycle_status:"active"}]);
    if (sql.startsWith("SELECT r.id")) return result([{ id: fileId, project_id: projectId,
      subcontractor_id: opm.id, status: "pending", trade_id: 1 }]);
    if (sql.startsWith("SELECT 1 FROM project_subcontractor_assignments")) return result([]);
    if (sql.startsWith("SELECT id FROM subcontractor_workers")) return result(workerIds.map(id => ({ id })));
    if (sql.startsWith("INSERT INTO project_subcontractor_assignments")) return result([{ id: fileId }]);
    if (sql.startsWith("UPDATE")) return result([{}]);
    throw new Error("Unexpected crew query: " + sql);
  } };
  const res = response();
  await subcontractors.approveRequest(request(opm, {}, { id: fileId }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.worker_count, 2);
  assert.match(queries.find(q => q.sql.startsWith("SELECT id FROM subcontractor_workers")).sql, /FOR UPDATE/);
  const assign = queries.find(q => q.sql.startsWith("UPDATE subcontractor_workers"));
  assert.deepEqual(assign.params[0], workerIds);
  assert.equal(assign.params[1], projectId);
  assert.equal(queries.some(q => q.sql.startsWith("UPDATE projects SET crew_assigned")), true);
});

test("crew approval with zero available workers does not create an assignment", async () => {
  const queries = [];
  client = { async query(sql) {
    sql = sql.replace(/\s+/g, " ").trim();
    queries.push(sql);
    const result = rows => ({ rows, rowCount: rows.length });
    if (sql.startsWith("SELECT r.id")) return result([{ id: fileId, project_id: projectId,
      subcontractor_id: opm.id, status: "pending", trade_id: 1 }]);
    return result([]);
  } };
  const res = response();
  await subcontractors.approveRequest(request(opm, {}, { id: fileId }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(queries.some(sql => sql.startsWith("INSERT INTO project_subcontractor_assignments")), false);
});

const confirmations = await import("../src/services/confirmations/controller.js");
test("confirming a phase locks the project before checking final activation", async () => {
  const queries = [];
  client = { async query(sql, params) {
    sql = sql.replace(/\s+/g, " ").trim();
    queries.push({ sql, params });
    const result = rows => ({ rows, rowCount: rows.length });
    if (sql.startsWith("SELECT id, lifecycle_status FROM projects")) return result([{ id: projectId, lifecycle_status: "spm_review" }]);
    if (sql.startsWith("SELECT id, status, response_deadline_at")) return result([{ id: "1", status: "pending", response_deadline_at: null }]);
    if (sql.startsWith("UPDATE project_phase_team")) return result([{ stage_id: 4, status: "confirmed" }]);
    if (sql.startsWith("SELECT 1 FROM project_phase_team")) return result([]);
    if (sql.startsWith("UPDATE projects")) return result([{}]);
    throw new Error("Unexpected confirmation query: " + sql);
  } };
  const res = response();
  await confirmations.acceptPhase(request(spm, {}, { stageId: "4" }), res);
  assert.equal(res.statusCode, 200);
  assert.match(queries[0].sql, /FROM projects.*FOR UPDATE/);
  const activation = queries.find(q => q.sql.startsWith("UPDATE projects"));
  assert.match(activation.sql, /current_stage_id = COALESCE/);
});

test("phase confirmation waits for the Office PM to accept", async () => {
  const queries = [];
  client = { async query(sql) {
    queries.push(sql);
    return { rows: [{ id: projectId, lifecycle_status: "sent_to_opm" }], rowCount: 1 };
  } };
  const res = response();
  await confirmations.acceptPhase(request(spm, {}, { stageId: "4" }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(queries.length, 1);
});

test("a completed checklist advances to the next confirmed phase and resets progress", async () => {
  const state = setup({
    next: { project_stage_id: 5, status: "confirmed", code: "MEP Rough-in" },
    nextItems: [{ id: "6", required: true, status: "missing" }],
  });
  state.items.forEach(i => i.status = "approved");
  state.evidence.status = "approved";
  const res = response();
  await controller.advancePhase(request(opm), res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.p.current_stage_id, 5);
  assert.equal(res.body.data.current_pct, 0);
});

test("a completed phase cannot advance into an unconfigured checklist", async () => {
  const state = setup({ next: { project_stage_id: 5, status: "confirmed", code: "MEP Rough-in" }, nextItems: [] });
  state.items.forEach(i => i.status = "approved");
  state.evidence.status = "approved";
  const res = response();
  await controller.advancePhase(request(opm), res);
  assert.equal(res.statusCode, 422);
  assert.equal(state.p.current_stage_id, 4);
});

test("the next SPM must confirm before their phase is activated", async () => {
  const state = setup({ next: { project_stage_id: 5, status: "pending", code: "MEP Rough-in" } });
  state.items.forEach(i => i.status = "approved");
  state.evidence.status = "approved";
  const res = response();
  await controller.advancePhase(request(opm), res);
  assert.equal(res.statusCode, 422);
  assert.equal(state.p.current_stage_id, 4);
});

test("every dropdown stage can be selected by a project SPM", async () => {
  for (const [index, stage] of updateUtility.STAGES.entries()) {
    const state = setup();
    const res = response();
    await controller.submitPhaseUpdate(request(spm, { stage }), res);
    assert.equal(res.statusCode, 201, stage);
    assert.equal(state.update.selected_stage_id, index + 1);
    assert.equal(state.p.current_stage_id, 4);
  }
});

test("one update saves notes, a site report, issue chips, and file-free checklist submissions", async () => {
  const state = setup();
  state.evidence.status = "missing";
  const req = request(spm, { stage_id: 4, note: "Site paused.",
    issue_categories: ["weather_delay", "safety_incident"], submitted_item_ids: ["1"] });
  req.file = { originalname: "report.pdf", buffer: Buffer.from("%PDF-test") };
  const res = response();
  await controller.submitPhaseUpdate(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.status, "pending");
  assert.deepEqual(state.update.issue_categories, ["weather_delay", "safety_incident"]);
  assert.equal(state.issues.length, 1);
  assert.equal(state.issues[0].phase_update_id, "42");
  assert.equal(state.evidence.file_id, null);
  assert.equal(state.evidence.status, "pending");
  assert.equal(state.evidence.phase_update_id, "42");
  assert.equal(state.history.length, 0);
  assert.equal(state.p.current_pct, 0);
  assert.equal(res.body.data.file_ids.length, 1);
});

test("OPM confirmation approves the marked items and creates one combined history entry", async () => {
  const state = setup();
  state.evidence.status = "missing";
  await controller.submitPhaseUpdate(request(spm, { note: "Rain and unsafe conditions.",
    issue_categories: ["weather_delay", "safety_incident"], submitted_item_ids: ["1"] }), response());
  const res = response();
  await updateController.approvePhaseUpdate(request(opm, {}, { updateId: "42" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.update.status, "approved");
  assert.equal(state.evidence.status, "approved");
  assert.equal(state.p.current_pct, 20);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0][4], true);
  assert.deepEqual(state.history[0][7], ["weather_delay", "safety_incident"]);
});

test("selected stage changes only when OPM confirms the update", async () => {
  const state = setup();
  await controller.submitPhaseUpdate(request(spm, { stage: "Finishes" }), response());
  assert.equal(state.p.current_stage_id, 4);
  const res = response();
  await updateController.approvePhaseUpdate(request(opm, {}, { updateId: "42" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.p.current_stage_id, 6);
});

test("SPMs cannot confirm their own updates", async () => {
  const state = setup();
  await controller.submitPhaseUpdate(request(), response());
  const res = response();
  await updateController.approvePhaseUpdate(request(spm, {}, { updateId: "42" }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(state.update.status, "pending");
});

test("a second OPM confirmation cannot duplicate history", async () => {
  const state = setup();
  await controller.submitPhaseUpdate(request(), response());
  await updateController.approvePhaseUpdate(request(opm, {}, { updateId: "42" }), response());
  const res = response();
  await updateController.approvePhaseUpdate(request(opm, {}, { updateId: "42" }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(state.history.length, 1);
});

test("OPM rejection keeps stage and progress unchanged and rejects submitted items", async () => {
  const state = setup();
  state.evidence.status = "missing";
  await controller.submitPhaseUpdate(request(spm, { submitted_item_ids: ["1"] }), response());
  const res = response();
  await updateController.rejectPhaseUpdate(request(opm, { resolution_note: "Inspection is incomplete." }, { updateId: "42" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.update.status, "rejected");
  assert.equal(state.evidence.status, "rejected");
  assert.equal(state.p.current_stage_id, 4);
  assert.equal(state.p.current_pct, 0);
  assert.equal(state.history.length, 0);
});

test("an update with a stale prior stage cannot be confirmed", async () => {
  const state = setup();
  await controller.submitPhaseUpdate(request(), response());
  state.p.current_stage_id = 5;
  const res = response();
  await updateController.approvePhaseUpdate(request(opm, {}, { updateId: "42" }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(state.update.status, "pending");
  assert.equal(state.history.length, 0);
});

test("only one update per project may await OPM confirmation", async () => {
  const state = setup();
  await controller.submitPhaseUpdate(request(), response());
  const res = response();
  await controller.submitPhaseUpdate(request(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(state.update.status, "pending");
});

test("unknown issue categories and invalid stages are rejected", async () => {
  setup();
  const invalidCategory = response();
  await controller.submitPhaseUpdate(request(spm, { issue_categories: ["unknown"] }), invalidCategory);
  assert.equal(invalidCategory.statusCode, 400);
  const invalidStage = response();
  await controller.submitPhaseUpdate(request(spm, { stage_id: 99 }), invalidStage);
  assert.equal(invalidStage.statusCode, 400);
});

test("mark as submitted does not require a file and does not grant approval", async () => {
  const state = setup();
  state.evidence.status = "missing";
  const res = response();
  await controller.markChecklistSubmitted(request(spm), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.file_id, null);
  assert.equal(state.evidence.status, "pending");
  assert.equal(state.p.current_pct, 0);
});

test("a separately marked item can join the final update without another evidence version", async () => {
  const state = setup();
  await controller.submitPhaseUpdate(request(spm, { submitted_item_ids: ["1"] }), response());
  assert.equal(state.evidence.phase_update_id, "42");
  assert.equal(state.queries.some(q => q.sql.startsWith("INSERT INTO project_phase_evidence")), false);
});

test("individual evidence approval cannot bypass combined update confirmation", async () => {
  const state = setup();
  await controller.submitPhaseUpdate(request(spm, { submitted_item_ids: ["1"] }), response());
  const res = response();
  await controller.approveEvidence(request(opm), res);
  assert.equal(res.statusCode, 409);
  assert.equal(state.evidence.status, "pending");
});

test("multipart payload accepts issue chips and submitted item arrays", () => {
  const body = updateUtility.updateBody({ payload: JSON.stringify({
    stage: "Structure", issue_categories: ["weather_delay"], submitted_item_ids: ["1"],
  }) });
  assert.deepEqual(body.issue_categories, ["weather_delay"]);
  assert.equal(body.checklist_submissions[0].item_id, "1");
  assert.throws(() => updateUtility.updateBody({ submitted_item_ids: ["1", "1"] }), /unique/);
  assert.throws(() => updateUtility.updateBody({ payload: "bad-json" }), /JSON object/);
});
