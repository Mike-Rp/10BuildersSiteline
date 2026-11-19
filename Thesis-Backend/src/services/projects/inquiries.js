import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { requireUser, handleError, HttpError, isUuid } from "../../common/utilities/access.utility.js";
import { responseOk } from "../../common/utilities/response.utility.js";
import { mirrorLegacyNotifications } from "../notifications/notification.utility.js";
import { getOpm, getSpm } from "./recommend.controller.js";

export const inquiryTypes = ["Residential", "Commercial", "Mixed-Use"];
const classifications = ["Normal", "Priority", "Urgent"];

export function inquiryDetails(input) {
  const details = {};
  for (const key of ["client_name", "email", "phone", "name", "address"]) {
    if (typeof input?.[key] !== "string" || !input[key].trim() || input[key].length > (key === "address" ? 500 : 150))
      throw new HttpError(422, `Enter a valid ${key.replaceAll("_", " ")}.`);
    details[key] = input[key].trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email))
    throw new HttpError(422, "Enter a valid email address.");
  if (!inquiryTypes.includes(input.project_type)) throw new HttpError(422, "Select a project type.");
  details.project_type = input.project_type;
  for (const key of ["lot_area", "land_area", "floor_area_sqm", "floor_count"]) {
    if (key === "land_area" && (input[key] == null || input[key] === "")) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value <= 0 || (key === "floor_count" && (!Number.isInteger(value) || value > 32767)))
      throw new HttpError(422, `Enter a positive ${key.replaceAll("_", " ")}.`);
    details[key] = value;
  }
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

export function estimateInquiry(details, start) {
  const config = JSON.parse(process.env.INQUIRY_PLANNING_RULES || "{}");
  const rule = config[details.project_type];
  const keys = ["lot_area", "land_area", "floor_area_sqm", "floor_count"].filter(key => details[key] != null);
  const matches = (size) => keys.every(key => Number.isFinite(rule?.[size]?.[key]) && details[key] <= rule[size][key]);
  const size = matches("Small") ? "Small" : matches("Medium") ? "Medium"
    : keys.every(key => Number.isFinite(rule?.Medium?.[key])) ? "Large" : null;
  const duration = size && rule?.durationDays?.[size];
  const date = new Date(`${start}T00:00:00Z`);
  let end = null;
  if (Number.isInteger(duration) && duration > 0 && duration <= 36500 && Number.isFinite(date.valueOf())) {
    date.setUTCDate(date.getUTCDate() + duration);
    end = date.toISOString().slice(0, 10);
  }
  return { size, end };
}

export async function assertInquiryUpload(db, actorId, fileId, lock = false) {
  if (!isUuid(fileId)) throw new HttpError(422, "Upload a valid project document.");
  const uploaded = await db.query(`SELECT id FROM stored_files WHERE id=$1 AND uploaded_by=$2
    AND purpose='upload' AND project_id IS NULL ${lock ? "FOR UPDATE" : ""}`, [fileId, actorId]);
  if (!uploaded.rowCount) throw new HttpError(422, "Select a new document uploaded to your account.");
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
  withdraw: ["opm", ["consulting"], "withdrawn"],
  drop: ["admin", ["withdrawn"], "dropped"],
};

function recordRoutingEvent(details, event) {
  details.routing_history = [...(details.routing_history ?? []), { ...event, at: new Date().toISOString() }];
}

function inquiryResponse(row, includeHistory = false) {
  const { routing_history, ...details } = row.details;
  return { ...row, details, ...(includeHistory && routing_history ? { routing_history } : {}) };
}

function excludedOpmIds(row) {
  return [row.opm_id, ...(row.details.routing_history ?? [])
    .filter(event => event.kind === "declined").map(event => event.opm_id)].filter(Boolean);
}

async function matchInquiry(db, row, actorId, requestedId) {
  const details = { ...row.details };
  const candidate = await getOpm(details.project_type, excludedOpmIds(row), db);
  if (requestedId !== undefined && (!candidate || candidate.id !== requestedId))
    throw new HttpError(409, "Refresh the OPM recommendation before sending.");
  recordRoutingEvent(details, candidate
    ? { kind: "offered", opm: candidate.full_name, opm_id: candidate.id }
    : { kind: "no_match" });
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
  router.get("/inquiries", endpoint(["admin", "opm"], async (_, actor) =>
    (await execute(`SELECT i.*,u.full_name AS opm_name,p.lifecycle_status AS project_status,p.target_start_date,p.target_end_date FROM project_inquiries i
      LEFT JOIN users u ON u.id=i.opm_id LEFT JOIN projects p ON p.id=i.project_id WHERE $1='admin' OR (i.opm_id=$2 AND i.status NOT IN ('draft','returned'))
      ORDER BY i.updated_at DESC`, [actor.role, actor.id])).rows.map(row => inquiryResponse(row, actor.role === "admin"))));

  router.post("/inquiries", endpoint(["admin"], (req, actor) => withTransaction(async db => {
    const details = inquiryDetails(req.body);
    const row = (await db.query("INSERT INTO project_inquiries(details,status,admin_id) VALUES($1,'draft',$2) RETURNING *",
      [JSON.stringify(details), actor.id])).rows[0];
    return inquiryResponse(details.immediate_consultation === "yes" ? await matchInquiry(db, row, actor.id) : row, true);
  })));

  router.post("/inquiries/:id/match", endpoint(["admin"], (req, actor) => withTransaction(async db => {
    if (!isUuid(req.params.id)) throw new HttpError(404, "Inquiry not found.");
    const row = (await db.query("SELECT * FROM project_inquiries WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!row || !["draft", "returned"].includes(row.status)) throw new HttpError(409, "This inquiry is not open for matching.");
    return inquiryResponse(await matchInquiry(db, row, actor.id), true);
  })));

  router.get("/inquiries/:id/recommendation", endpoint(["admin"], async req => {
    if (!isUuid(req.params.id)) throw new HttpError(404, "Inquiry not found.");
    const row = (await execute("SELECT details,opm_id,status FROM project_inquiries WHERE id=$1", [req.params.id])).rows[0];
    if (!row || !["draft","returned"].includes(row.status)) throw new HttpError(409, "This inquiry is not open for routing.");
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
      if (!isUuid(req.body.opm_id)) throw new HttpError(422, "Select a valid OPM recommendation.");
      return inquiryResponse(await matchInquiry(db, row, actor.id, req.body.opm_id), true);
    }
    if (status === "returned" || status === "consulting") {
      const name = (await db.query("SELECT full_name FROM users WHERE id=$1", [actor.id])).rows[0]?.full_name;
      recordRoutingEvent(details, { kind: status === "returned" ? "declined" : "accepted", opm: name, opm_id: actor.id });
    }
    if (status === "withdrawn") {
      reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
      if (!reason || reason.length > 1000) throw new HttpError(422, "Enter a withdrawal reason of up to 1,000 characters.");
    }
    if (status === "approved" || status === "withdrawn") {
      const { decision_date, decision_note } = req.body;
      if (decision_date != null) {
        const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", dateStyle: "short" }).format(new Date());
        if (!validSchedule(decision_date, today)) throw new HttpError(422, "Enter a valid client decision date.");
        details.client_decision_date = decision_date;
      }
      if (decision_note != null) {
        if (typeof decision_note !== "string" || decision_note.length > 1000)
          throw new HttpError(422, "Enter an internal note of up to 1,000 characters.");
        if (decision_note.trim()) details.client_decision_note = decision_note.trim();
      }
    }
    const result = await db.query("UPDATE project_inquiries SET status=$2,reason=$3,details=$4,updated_at=now() WHERE id=$1 RETURNING *",
      [row.id, status, reason, JSON.stringify(details)]);
    if (status === "returned") await notifyInquiry(db, actor.id, row.admin_id, "Inquiry returned", row.details.name);
    if (status === "withdrawn") await notifyInquiry(db, actor.id, row.admin_id, "Client withdrew", `${row.details.name}: ${reason}`);
    return inquiryResponse(result.rows[0], actor.role === "admin");
  })));

  router.post("/inquiries/:id/planning", endpoint(["opm"], async (req, actor) => {
    if (!isUuid(req.params.id)) throw new HttpError(404, "Inquiry not found.");
    const row = (await execute("SELECT * FROM project_inquiries WHERE id=$1 AND opm_id=$2 AND status='approved'",
      [req.params.id, actor.id])).rows[0];
    if (!row) throw new HttpError(404, "Approved inquiry not found.");
    const details = inquiryDetails(req.body);
    const phases = await inquiryPhases({query: execute}, details.project_type);
    const estimate = estimateInquiry(details, req.body.target_start_date);
    if (!req.body.phases) return { phases, estimate };
    if (!validSchedule(req.body.target_start_date, req.body.target_end_date))
      throw new HttpError(422, "Enter the overall project start and end dates before allocating.");
    const budget = Number(req.body.estimated_budget);
    if (!Number.isFinite(budget) || budget <= 0) throw new HttpError(422, "Enter the estimated project budget.");
    await assertInquiryUpload({ query:execute },actor.id,req.body.contract_file_id);
    const selected = confirmedPhases(phases, req.body.phases);
    const candidates = {};
    const candidateBlockers = {};
    const team = await getSpm(details.project_type, selected, candidates, {start:req.body.target_start_date,end:req.body.target_end_date}, candidateBlockers);
    return { phases, estimate, team, candidates, candidateBlockers };
  }));
}
