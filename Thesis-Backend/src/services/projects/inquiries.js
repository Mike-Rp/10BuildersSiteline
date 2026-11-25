import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { requireUser, handleError, HttpError, isUuid } from "../../common/utilities/access.utility.js";
import { responseOk } from "../../common/utilities/response.utility.js";
import { mirrorLegacyNotifications } from "../notifications/notification.utility.js";
import { recommendedSitePms } from "../../domain/engineer-phase-coverage.js";
import { getOpm, getOpmCandidates, getSpm } from "./recommend.controller.js";
import { normalizePhaseDates } from "./staffing-license.utility.js";
import { inquiryScopeConfiguration } from "./phase-engineer-scopes.utility.js";
import { randomUUID } from "node:crypto";
import { isPhilippineMobile, PH_MOBILE_ERROR } from "../../domain/mobile-number.js";
import { clientLoginEmail } from "./client-onboarding.js";
import { findInquiryClients, inquiryClientIdentity, inquiryDraftDetails, resolveInquiryClient } from "./inquiry-clients.utility.js";
import { assessInquiry, earliestInquiryCompletion, inquiryAssessmentReady, normalizeFloorMeasurements, technicalOptions, arrangementOptions, MAX_INQUIRY_FLOORS } from "../../domain/inquiry-assessment.js";

export const inquiryTypes = ["Residential", "Commercial", "Mixed-Use"];
const classifications = ["Normal", "Priority", "Urgent"];

function validateInquiryContact(details, previous) {
  if (details.email !== previous?.email && !clientLoginEmail(details.email))
    throw new HttpError(422, "Enter the client's existing personal or business email.");
  if (details.phone !== previous?.phone && !isPhilippineMobile(details.phone))
    throw new HttpError(422, PH_MOBILE_ERROR);
}

export function inquiryDetails(input) {
  const details = inquiryClientIdentity(input);
  for (const key of ["client_name", "email", "phone", "name", "address"]) {
    const value = key === "client_name" && details.client_type === "company" ? details.company_name : input?.[key];
    if (typeof value !== "string" || !value.trim() || value.length > (key === "address" ? 500 : 150))
      throw new HttpError(422, `Enter a valid ${key.replaceAll("_", " ")}.`);
    details[key] = value.trim();
  }
  if (details.client_type === "company") details.client_name = details.company_name;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email))
    throw new HttpError(422, "Enter a valid email address.");
  if (!inquiryTypes.includes(input.project_type)) throw new HttpError(422, "Select a project type.");
  details.project_type = input.project_type;
  for (const key of ["lot_area", "floor_area_sqm", "floor_count"]) {
    const source = key === "lot_area" && (input.lot_area == null || input.lot_area === "") ? input.land_area : input[key];
    const value = Number(source);
    if (!Number.isFinite(value) || value <= 0 || (key === "floor_count" && (!Number.isInteger(value) || value > MAX_INQUIRY_FLOORS)))
      throw new HttpError(422, `Enter a positive ${key.replaceAll("_", " ")}.`);
    details[key] = value;
  }
  if (details.floor_area_sqm / details.floor_count > details.lot_area)
    throw new HttpError(422, "Total floor area must not exceed the lot area multiplied by the number of floors.");
  if (![30, 60, 1440].includes(input.consultation)) throw new HttpError(422, "Select a consultation timing.");
  details.consultation = input.consultation;
  if (input.classification != null) {
    if (!classifications.includes(input.classification)) throw new HttpError(422, "Select an inquiry classification.");
    details.classification = input.classification;
  }
  if (input.immediate_consultation != null) {
    if (!["yes", "no"].includes(input.immediate_consultation)) throw new HttpError(422, "Select an OPM consultation preference.");
    details.immediate_consultation = input.immediate_consultation;
  }
  for (const [key, limit] of [["primary_contact", 150], ["overview", 2000]]) {
    const value = input[key];
    if (value == null || value === "") continue;
    if (typeof value !== "string" || value.trim().length > limit)
      throw new HttpError(422, `Enter a valid ${key.replaceAll("_", " ")}.`);
    if (value.trim()) details[key] = value.trim();
  }
  if (input.anticipated_start != null && input.anticipated_start !== "") {
    if (!validSchedule(input.anticipated_start, input.anticipated_start))
      throw new HttpError(422, "Enter a valid anticipated start date.");
    details.anticipated_start = input.anticipated_start;
  }
  return details;
}

export function validSchedule(start, end) {
  const isDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  return isDay(start) && isDay(end) && start <= end;
}

export async function assertInquiryUpload(db, actorId, fileId, lock = false) {
  if (!isUuid(fileId)) throw new HttpError(422, "Upload a valid project document.");
  const uploaded = await db.query(`SELECT id, original_name, content_type FROM stored_files WHERE id=$1 AND uploaded_by=$2
    AND purpose='upload' AND project_id IS NULL ${lock ? "FOR UPDATE" : ""}`, [fileId, actorId]);
  if (!uploaded.rowCount) throw new HttpError(422, "Select a new document uploaded to your account.");
  return uploaded.rows[0];
}

export async function inquiryPhases(db, type) {
  return (await db.query(`SELECT s.code FROM project_type_stages w
    JOIN project_stages s ON s.id=w.project_stage_id JOIN project_types t ON t.id=w.project_type_id
    WHERE t.code=$1 ORDER BY w.sort_order`, [type])).rows.map(row => row.code);
}

export function confirmedPhases(available, submitted) {
  if (!Array.isArray(submitted) || !submitted.length || new Set(submitted).size !== submitted.length ||
      submitted.some(phase => !available.includes(phase)))
    throw new HttpError(422, "Select at least one valid construction phase.");
  return available.filter(phase => submitted.includes(phase));
}

function validateInquiryCompletion(start, end, estimate) {
  const minimum = earliestInquiryCompletion(start, estimate);
  if (!minimum) throw new HttpError(422, "The estimated completion is outside the supported date range. Review the project information or start date.");
  if (end < minimum) throw new HttpError(422, `Choose an estimated completion date of ${minimum} or later based on the calculated duration.`);
}

function recordInquiryBudget(workflow, input, audit) {
  const amount = Number(input);
  if (!["number", "string"].includes(typeof input) || !Number.isFinite(amount) ||
      amount < 0.01 || amount > 999999999999.99 || Math.round(amount * 100) / 100 !== amount)
    throw new HttpError(422, "Enter a positive PHP amount with at most two decimal places.");
  if (amount !== workflow.budget) {
    workflow.budget_history = [...(workflow.budget_history ?? []), { ...audit, amount }];
    workflow.budget = amount;
    delete workflow.assessment;
  }
}

export async function notifyInquiry(db, actorId, recipientId, title, detail, projectId = null) {
  const result = await db.query(`WITH notice AS (
    INSERT INTO activity_log(activity_type_id,title,detail,actor_user_id,related_project_id)
    SELECT id,$1,$2,$3,$5 FROM activity_types WHERE code='notice' RETURNING id
  ) INSERT INTO notification_recipients(activity_log_id,recipient_user_id)
    SELECT id,$4 FROM notice ON CONFLICT DO NOTHING RETURNING activity_log_id`, [title, detail, actorId, recipientId, projectId]);
  await mirrorLegacyNotifications(db, result.rows.map(row => row.activity_log_id));
}

const transition = {
  send: ["admin", ["draft", "returned"], "offered"],
  confirm: ["opm", ["offered"], "consulting"],
  cancel: ["opm", ["offered"], "returned"],
  approve: ["opm", ["consulting"], "approved"],
  revise: ["opm", ["consulting"], "consulting"],
  withdraw: ["opm", ["consulting"], "withdrawn"],
  drop: ["admin", ["withdrawn"], "dropped"],
};

function recordRoutingEvent(details, event) {
  details.routing_history = [...(details.routing_history ?? []), { ...event, at: new Date().toISOString() }];
}

function inquiryResponse(row, includeHistory = false) {
  const { routing_history, opm_workflow, opm_match, land_area, ...details } = row.details;
  if (!details.lot_area && land_area) details.lot_area = land_area;
  return { ...row, details, ...(includeHistory
    ? { routing_history }
    : { workflow: opm_workflow }) };
}

export function staffingAssessment(row, input) {
  const workflow = row.details.opm_workflow;
  const assessment = workflow?.assessment;
  if (!assessment || !assessment.id || input?.assessment_id !== assessment.id)
    throw new HttpError(409, "Complete the current project assessment before opening staffing.");
  const original = inquiryDetails(row.details);
  const submitted = inquiryDetails(input);
  if (Object.keys(original).length !== Object.keys(submitted).length ||
      Object.entries(original).some(([key, value]) => submitted[key] !== value) ||
      input.target_start_date !== workflow.review.start || input.target_end_date !== workflow.review.end ||
      Number(input.estimated_budget) !== workflow.budget)
    throw new HttpError(409, "The assessed project information changed. Reopen staffing with the saved record.");
  return assessment;
}

function excludedOpmIds(row) {
  return [row.opm_id, ...(row.details.routing_history ?? [])
    .filter(event => event.kind === "declined").map(event => event.opm_id)].filter(Boolean);
}

async function matchInquiry(db, row, actorId, requestedId) {
  const details = { ...row.details };
  const candidate = await getOpm(details.project_type, excludedOpmIds(row), db);
  if (requestedId !== undefined && (candidate?.id ?? null) !== requestedId)
    throw new HttpError(409, "The Office PM recommendation changed. Review the updated candidates before submitting.", "INQUIRY_RECOMMENDATION_CHANGED");
  recordRoutingEvent(details, candidate
    ? { kind: "offered", opm: candidate.full_name, opm_id: candidate.id }
    : { kind: "no_match" });
  if (candidate) details.opm_match = { experience_years: candidate.experience_years, project_type: details.project_type };
  else delete details.opm_match;
  const updated = (await db.query(
    "UPDATE project_inquiries SET status=$2,opm_id=$3,details=$4,updated_at=now() WHERE id=$1 RETURNING *",
    [row.id, candidate ? "offered" : row.status, candidate?.id ?? row.opm_id, JSON.stringify(details)],
  )).rows[0];
  if (candidate) await notifyInquiry(db, actorId, candidate.id, "Consultation request", details.name);
  return candidate ? { ...updated, opm_name: candidate.full_name } : updated;
}

function endpoint(roles, action) {
  return async (req, res) => {
    try {
      const actor = await requireUser(req, res, roles);
      if (actor) return responseOk(res, "Inquiry updated.", 1, await action(req, actor));
    } catch (error) { return handleError(res, error); }
  };
}

export function mountInquiries(router) {
  router.get("/inquiries/clients", endpoint(["admin"], req => findInquiryClients({ query: execute }, req.query.q)));

  router.post("/inquiries/draft", endpoint(["admin"], (req, actor) => withTransaction(async db => {
    const details = inquiryDraftDetails(req.body?.details);
    let row;
    if (req.body?.id) {
      if (!isUuid(req.body.id)) throw new HttpError(422, "Invalid inquiry draft.");
      row = (await db.query(`UPDATE project_inquiries SET details=$3,updated_at=now()
        WHERE id=$1 AND admin_id=$2 AND status='draft' AND details->>'intake_draft'='yes' RETURNING *`,
        [req.body.id, actor.id, JSON.stringify(details)])).rows[0];
      if (!row) throw new HttpError(409, "This draft is unavailable or has already been submitted.");
    } else row = (await db.query("INSERT INTO project_inquiries(details,status,admin_id) VALUES($1,'draft',$2) RETURNING *", [JSON.stringify(details), actor.id])).rows[0];
    return inquiryResponse(row, true);
  })));
  router.get("/inquiries", endpoint(["admin", "opm"], async (_, actor) =>
    (await execute(`SELECT i.*,u.full_name AS opm_name,p.lifecycle_status AS project_status,p.target_start_date,p.target_end_date FROM project_inquiries i
      LEFT JOIN users u ON u.id=i.opm_id LEFT JOIN projects p ON p.id=i.project_id WHERE $1='admin' OR (i.opm_id=$2 AND i.status NOT IN ('draft','returned'))
      ORDER BY i.updated_at DESC`, [actor.role, actor.id])).rows.map(row => inquiryResponse(row, actor.role === "admin"))));

  router.get("/inquiries/opm-candidates", endpoint(["admin"], async req => {
    const type = req.query.project_type;
    if (!inquiryTypes.includes(type)) throw new HttpError(422, "Select a project type.");
    return (await getOpmCandidates(type)).map(person => ({
      id: person.id, name: person.full_name, experience_years: person.experience_years,
    }));
  }));

  router.post("/inquiries", endpoint(["admin"], (req, actor) => withTransaction(async db => {
    const input = req.body ?? {};
    const regular = input.immediate_consultation === "no";
    const clientInput = await resolveInquiryClient(db, input);
    const details = inquiryDetails(regular ? { ...clientInput, classification: "Normal", consultation: 1440 } : clientInput);
    validateInquiryContact(details);
    const expected = input.expected_opm_id;
    if (expected !== undefined && expected !== null && !isUuid(expected))
      throw new HttpError(422, "Invalid Office PM recommendation.");
    let row;
    if (input.draft_id) {
      if (!isUuid(input.draft_id)) throw new HttpError(422, "Invalid inquiry draft.");
      row = (await db.query(`UPDATE project_inquiries SET details=$3,updated_at=now()
        WHERE id=$1 AND admin_id=$2 AND status='draft' AND details->>'intake_draft'='yes' RETURNING *`,
        [input.draft_id, actor.id, JSON.stringify(details)])).rows[0];
      if (!row) throw new HttpError(409, "This draft is unavailable or has already been submitted.");
    } else row = (await db.query("INSERT INTO project_inquiries(details,status,admin_id) VALUES($1,'draft',$2) RETURNING *",
      [JSON.stringify(details), actor.id])).rows[0];
    return inquiryResponse(details.immediate_consultation ? await matchInquiry(db, row, actor.id, expected) : row, true);
  })));

  router.post("/inquiries/:id/match", endpoint(["admin"], (req, actor) => withTransaction(async db => {
    if (!isUuid(req.params.id)) throw new HttpError(404, "Inquiry not found.");
    const row = (await db.query("SELECT * FROM project_inquiries WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!row || row.details.intake_draft === "yes" || !["draft", "returned"].includes(row.status)) throw new HttpError(409, "Complete and submit the inquiry draft before matching.");
    return inquiryResponse(await matchInquiry(db, row, actor.id), true);
  })));

  router.get("/inquiries/:id/recommendation", endpoint(["admin"], async req => {
    if (!isUuid(req.params.id)) throw new HttpError(404, "Inquiry not found.");
    const row = (await execute("SELECT details,opm_id,status FROM project_inquiries WHERE id=$1", [req.params.id])).rows[0];
    if (!row || row.details.intake_draft === "yes" || !["draft","returned"].includes(row.status)) throw new HttpError(409, "Complete and submit the inquiry draft before routing.");
    return getOpm(row.details.project_type, excludedOpmIds(row));
  }));

  router.post("/inquiries/:id/decision", endpoint(["admin","opm"], (req, actor) => withTransaction(async db => {
    if (!isUuid(req.params.id)) throw new HttpError(404, "Inquiry not found.");
    const [role, from, status] = Object.hasOwn(transition, req.body?.action) ? transition[req.body.action] : [];
    if (role !== actor.role) throw new HttpError(403, "This action is not available to your role.");
    const row = (await db.query("SELECT * FROM project_inquiries WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!row || (role === "opm" && row.opm_id !== actor.id)) throw new HttpError(404, "Inquiry not found.");
    if (!from.includes(row.status)) throw new HttpError(409, "The inquiry has already moved to another step.");
    let reason = row.reason;
    const details = { ...row.details };
    if (status === "offered") {
      if (row.details.intake_draft === "yes") throw new HttpError(409, "Complete and submit the inquiry draft before routing.");
      if (!isUuid(req.body.opm_id)) throw new HttpError(422, "Select a valid OPM recommendation.");
      return inquiryResponse(await matchInquiry(db, row, actor.id, req.body.opm_id), true);
    }
    if (status === "returned" || req.body.action === "confirm") {
      const name = (await db.query("SELECT full_name FROM users WHERE id=$1", [actor.id])).rows[0]?.full_name;
      recordRoutingEvent(details, { kind: status === "returned" ? "declined" : "accepted", opm: name, opm_id: actor.id });
    }
    if (status === "withdrawn") {
      reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
      if (!reason || reason.length > 1000) throw new HttpError(422, "Enter a withdrawal reason of up to 1,000 characters.");
    }
    if (status === "approved" || status === "withdrawn" || req.body.action === "revise") {
      const { decision_date, decision_note } = req.body;
      if (decision_date != null) {
        const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", dateStyle: "short" }).format(new Date());
        if (!validSchedule(decision_date, today)) throw new HttpError(422, "Enter a valid client decision date.");
        if (req.body.action !== "revise") details.client_decision_date = decision_date;
      }
      if (decision_note != null) {
        if (typeof decision_note !== "string" || decision_note.length > 1000)
          throw new HttpError(422, "Enter an internal note of up to 1,000 characters.");
        if (req.body.action !== "revise" && decision_note.trim()) details.client_decision_note = decision_note.trim();
      }
      if (req.body.action === "revise") {
        if (!decision_date || !decision_note?.trim())
          throw new HttpError(422, "Enter the discussion date and requested revisions.");
        const workflow = details.opm_workflow ?? {};
        details.opm_workflow = { ...workflow, revisions: [...(workflow.revisions ?? []), {
          date: decision_date, note: decision_note.trim(), at: new Date().toISOString(), by: actor.id,
        }] };
      }
    }
    const result = await db.query("UPDATE project_inquiries SET status=$2,reason=$3,details=$4,updated_at=now() WHERE id=$1 RETURNING *",
      [row.id, status, reason, JSON.stringify(details)]);
    if (status === "returned") {
      const rematched = await matchInquiry(db, result.rows[0], actor.id);
      if (rematched.status === "returned")
        await notifyInquiry(db, actor.id, row.admin_id, "Inquiry returned", row.details.name);
      return { id: row.id, status: "returned" };
    }
    if (status === "withdrawn") await notifyInquiry(db, actor.id, row.admin_id, "Client withdrew", `${row.details.name}: ${reason}`);
    return inquiryResponse(result.rows[0], actor.role === "admin");
  })));

  router.post("/inquiries/:id/workflow", endpoint(["opm"], (req, actor) => withTransaction(async db => {
    if (!isUuid(req.params.id)) throw new HttpError(404, "Inquiry not found.");
    const row = (await db.query("SELECT * FROM project_inquiries WHERE id=$1 AND opm_id=$2 FOR UPDATE",
      [req.params.id, actor.id])).rows[0];
    if (!row) throw new HttpError(404, "Inquiry not found.");
    if (row.status !== "approved") throw new HttpError(409, "Project review requires client proposal approval.");
    const input = req.body ?? {};
    const details = { ...row.details };
    const workflow = { ...details.opm_workflow };
    if ((workflow.review?.version ?? 0) !== input.version)
      throw new HttpError(409, "The project record changed. Reopen the inquiry to load the latest version.");
    const intakeLocked = inquiryAssessmentReady(details, workflow);
    if (intakeLocked && (input.action === "review" || input.action === "budget"))
      throw new HttpError(409, "Project information and budget are locked once project assessment is available.");
    const audit = { by: actor.id, at: new Date().toISOString() };
    switch (input.action) {
      case "contract": {
        const previousId = workflow.signed_contract?.id ?? workflow.staffing?.contract_file_id ?? null;
        if (previousId && previousId === input.contract_file_id && input.request_id === previousId) return inquiryResponse(row);
        if (intakeLocked && previousId)
          throw new HttpError(409, "The confirmed client contract is locked once project assessment is available.");
        if ((input.expected_contract_file_id ?? null) !== previousId)
          throw new HttpError(409, "The signed contract changed. Refresh the inquiry before replacing it.");
        const file = await assertInquiryUpload(db, actor.id, input.contract_file_id, true);
        if (!["application/pdf", "image/png", "image/jpeg"].includes(file.content_type))
          throw new HttpError(422, "Choose a PDF, PNG, or JPEG signed contract.");
        workflow.signed_contract = { id: file.id, name: file.original_name };
        if (workflow.staffing) workflow.staffing = { ...workflow.staffing, contract_file_id: file.id };
        break;
      }
      case "review": {
        if (!validSchedule(input.start, input.end)) throw new HttpError(422, "Enter a valid project start and completion date.");
        const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", dateStyle: "short" }).format(new Date());
        if (input.start < today) throw new HttpError(422, "Choose an estimated start date of today or later.");
        const technical = input.technical ?? workflow.review?.technical ?? technicalOptions[0];
        const arrangement = input.arrangement ?? workflow.review?.arrangement ?? arrangementOptions[0];
        if (!technicalOptions.includes(technical) || !arrangementOptions.includes(arrangement))
          throw new HttpError(422, "Select the technical requirements and phase arrangement.");
        const before = inquiryDetails(details);
        const corrected = { ...before, ...input.correction,
          consultation: before.consultation, classification: before.classification, immediate_consultation: before.immediate_consultation,
        };
        for (const key of ["client_record", "existing_client_source", "existing_client_id", "existing_client_verified"]) {
          if (before[key] === undefined) delete corrected[key];
          else corrected[key] = before[key];
        }
        const areas = input.floorMeasurements === undefined ? undefined :
          normalizeFloorMeasurements(input.floorMeasurements, Number(corrected.floor_count), Number(corrected.lot_area));
        if (areas === null) throw new HttpError(422, "Enter a positive area for every floor. Each floor must not exceed the lot area.");
        if (areas) corrected.floor_area_sqm = areas.total;
        const after = inquiryDetails(corrected);
        if (input.correction) validateInquiryContact(after, before);
        const localToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const earliestStartDate = new Date(localToday + "T00:00:00Z");
        earliestStartDate.setUTCDate(earliestStartDate.getUTCDate() + 14);
        const earliestStart = earliestStartDate.toISOString().slice(0, 10);
        if (typeof input.start !== "string" || input.start < earliestStart)
          throw new HttpError(422, "Choose an estimated start date at least 14 calendar days from today.");
        const suggestion = assessInquiry(after, input.start, input.end, technical, arrangement);
        validateInquiryCompletion(input.start, input.end, suggestion);
        const changes = Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
          .filter(key => before[key] !== after[key]).map(key => [key, { before: before[key] ?? null, after: after[key] ?? null }]));
        const schedule = { start: input.start, end: input.end, technical, arrangement };
        for (const key of Object.keys(schedule)) {
          const previous = workflow.review?.[key] ?? (key === "start" ? before.anticipated_start : undefined);
          if (previous !== schedule[key]) changes[key] = { before: previous ?? null, after: schedule[key] };
        }
        const reason = typeof input.reason === "string" ? input.reason.trim() : "";
        if ((input.correction || changes.floor_area_sqm || (workflow.review && Object.keys(changes).length)) && (!reason || reason.length > 1000))
          throw new HttpError(422, "Enter a modification reason of up to 1,000 characters.");
        for (const key of Object.keys(before)) delete details[key];
        Object.assign(details, after);
        const version = (workflow.review?.version ?? 0) + 1;
        // Old callers can still save a total. Clear an old breakdown if it no longer matches those measurements.
        const floorMeasurements = areas?.measurements ?? (after.floor_count === before.floor_count &&
          after.floor_area_sqm === before.floor_area_sqm ? workflow.review?.floorMeasurements : undefined);
        if (floorMeasurements && !normalizeFloorMeasurements(floorMeasurements, after.floor_count, after.lot_area))
          throw new HttpError(422, "Each floor must not exceed the lot area. Update the floor measurements.");
        workflow.review = { ...schedule, version, estimate: { size: suggestion.size, end: suggestion.suggestedEnd },
          ...(floorMeasurements ? { floorMeasurements } : {}) };
        workflow.review_history = [...(workflow.review_history ?? []), { ...audit, version, changes, reason }];
        delete workflow.assessment;
        if (input.amount !== undefined) recordInquiryBudget(workflow, input.amount, audit);
        break;
      }
      case "budget": {
        if (!workflow.review) throw new HttpError(409, "Confirm the project information before saving the budget.");
        recordInquiryBudget(workflow, input.amount, audit);
        break;
      }
      case "assessment": {
        if (!workflow.review || !workflow.budget || !intakeLocked)
          throw new HttpError(409, "Confirm the project schedule and save the approved budget first.");
        if (!technicalOptions.includes(input.technical) || !arrangementOptions.includes(input.arrangement))
          throw new HttpError(422, "Select the technical requirements and phase arrangement.");
        const { start, end } = workflow.review;
        if (workflow.assessment?.technical !== input.technical || workflow.assessment?.arrangement !== input.arrangement) {
          const estimate = assessInquiry(details, start, end, input.technical, input.arrangement);
          validateInquiryCompletion(start, end, estimate);
          workflow.assessment = { ...estimate, id: randomUUID(), completed_at: audit.at };
        }
        break;
      }
      default: throw new HttpError(422, "Select a valid project workflow action.");
    }
    if (workflow.assessment?.id !== row.details.opm_workflow?.assessment?.id) delete workflow.staffing;
    details.opm_workflow = workflow;
    const updated = (await db.query("UPDATE project_inquiries SET details=$2,updated_at=now() WHERE id=$1 RETURNING *",
      [row.id, JSON.stringify(details)])).rows[0];
    return inquiryResponse(updated);
  })));

  router.post("/inquiries/:id/planning", endpoint(["opm"], async (req, actor) => {
    if (!isUuid(req.params.id)) throw new HttpError(404, "Inquiry not found.");
    const row = (await execute("SELECT * FROM project_inquiries WHERE id=$1 AND opm_id=$2 AND status='approved'",
      [req.params.id, actor.id])).rows[0];
    if (!row) throw new HttpError(404, "Approved inquiry not found.");
    const assessment = staffingAssessment(row, req.body);
    const type = row.details.project_type;
    const phases = await inquiryPhases({query: execute}, type);
    const estimate = { size: assessment.size, end: assessment.suggestedEnd };
    if (!req.body.phases) {
      const saved = row.details.opm_workflow.staffing;
      const configuration = await inquiryScopeConfiguration({ query: execute }, type, phases, saved?.additional_scopes || {});
      return { phases, estimate, staffing: saved, ...(configuration.options ? { additional_scope_options: configuration.options } : {}) };
    }
    const signedContractId = row.details.opm_workflow.signed_contract?.id ?? null;
    if (signedContractId && req.body.contract_file_id !== signedContractId)
      throw new HttpError(409, "The signed contract changed. Reopen staffing with the confirmed contract.");
    await assertInquiryUpload({ query:execute },actor.id,req.body.contract_file_id);
    const selected = confirmedPhases(phases, req.body.phases);
    const review = row.details.opm_workflow.review;
    const storedDates = row.details.opm_workflow.staffing?.phase_dates;
    const phaseDates = normalizePhaseDates(req.body.phase_dates ?? Object.fromEntries(
      selected.filter(phase => storedDates?.[phase]).map(phase => [phase, storedDates[phase]])), selected, review);
    const candidates = {};
    const licenseUnavailable = {};
    const candidateBlockers = {};
    const blockedCandidates = {};
    const stored = row.details.opm_workflow.staffing?.additional_scopes || {};
    const configuration = await inquiryScopeConfiguration({ query: execute }, type, selected,
      req.body.additional_scopes ?? Object.fromEntries(selected.map(phase => [phase, stored[phase] || []])));
    const scopes = configuration.required;
    const staffingTarget = recommendedSitePms(assessment.size, assessment.complexity);
    const team = await getSpm(type, selected, candidates, review, candidateBlockers, {
      requiredScopes: scopes, setupAdditionalScopes: configuration.additional, staffingTarget, blockedCandidates, phaseDates, licenseUnavailable,
    });
    for (const phase of selected) {
      if (!Object.hasOwn(candidates, phase)) {
        candidates[phase] = [];
        candidateBlockers[phase] = "phase_disciplines";
      }
    }
    const staffing = {assessment_id:assessment.id, phases:selected, contract_file_id:req.body.contract_file_id,
      ...(req.body.phase_dates !== undefined || storedDates ? { phase_dates: phaseDates } : {}),
      ...(configuration.options ? { additional_scopes: configuration.additional } : {})};
    // A correction or conversion can finish while the recommendations are being calculated.
    const saved = await execute(`UPDATE project_inquiries
      SET details=jsonb_set(details,'{opm_workflow,staffing}',$3::jsonb), updated_at=now()
      WHERE id=$1 AND opm_id=$2 AND status='approved' AND details #>> '{opm_workflow,assessment,id}'=$4
        AND (details #>> '{opm_workflow,signed_contract,id}') IS NOT DISTINCT FROM $5::text`,
      [row.id, actor.id, JSON.stringify(staffing), assessment.id, signedContractId]);
    if (!saved.rowCount) throw new HttpError(409, "The inquiry changed. Reopen staffing with the current assessment.");
    return { phases, estimate, recommended_site_pms:staffingTarget, team, candidates, candidateBlockers, blockedCandidates, licenseUnavailable, staffing,
      ...(configuration.options ? { additional_scope_options: configuration.options } : {}) };
  }));
}
