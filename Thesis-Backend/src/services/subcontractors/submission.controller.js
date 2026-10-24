import { v4 as uuidv4 } from "uuid";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { HttpError, handleError, sendOk, requireUser, isUuid } from "../../common/utilities/access.utility.js";
import { adminIds, notify } from "../../common/utilities/notify.utility.js";
import { applyImport, MAX_IMPORT_WORKERS, rejected, unknownIdProblems, validateImportRows } from "./import.controller.js";

// A Site PM submits a manpower list; an Admin approves it. Workers and ID numbers are created only on approval.
const SUBMIT_ROLES = ["spm"];
const READ_ROLES = ["admin", "opm", "spm"];
const ADMIN_ONLY = ["admin"];
const REASON_MAX = 500;
const LIST_LIMIT = 20;

const SUMMARY_SQL = `
  SELECT s.id, s.subcontractor_id, s.status, s.file_name, s.new_count, s.existing_count, s.decision_note,
         s.created_at, s.decided_at, s.result, s.submitted_by, u.full_name AS submitted_by_name, d.full_name AS decided_by_name
    FROM manpower_submissions s
    JOIN users u ON u.id = s.submitted_by
    LEFT JOIN users d ON d.id = s.decided_by`;

// The rows as the Site PM sent them, so the Admin reviews exactly what was uploaded.
const toPayload = (rows) => rows.map((r) => ({
  row: r.row, id_number: r.idNumber, first_name: r.firstName, middle_name: r.middleName, last_name: r.lastName, suffix: r.suffix,
}));

// POST /subcontractors/:id/manpower-submissions   body: { workers: [...same rows as the import], file_name? }
export const submitManpower = async (req, res) => {
  try {
    const user = await requireUser(req, res, SUBMIT_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid subcontractor id.");
    const workers = req.body?.workers;
    if (!Array.isArray(workers) || workers.length === 0) throw new HttpError(400, "workers must be a non-empty array.");
    if (workers.length > MAX_IMPORT_WORKERS) throw new HttpError(400, `At most ${MAX_IMPORT_WORKERS} workers can be submitted at once. Split the file.`);
    const fileName = typeof req.body?.file_name === "string" ? req.body.file_name.trim().slice(0, 255) || null : null;

    const { rows, errors } = validateImportRows(workers);
    if (errors.length) return rejected(res, errors);

    const outcome = await withTransaction(async (client) => {
      const company = await client.query(
        `SELECT company_name FROM subcontractors WHERE id = $1 AND COALESCE(is_deleted,false) = false FOR UPDATE`, [id]);
      if (company.rowCount === 0) throw new HttpError(404, "Subcontractor not found.");
      const waiting = await client.query(`SELECT 1 FROM manpower_submissions WHERE subcontractor_id = $1 AND status = 'pending'`, [id]);
      if (waiting.rowCount) throw new HttpError(409, "A manpower list for this company is already waiting for approval. Wait for the Admin's decision, or withdraw it first.");
      // Catch a wrong ID now, so the Site PM finds out before the Admin does.
      const { problems } = await unknownIdProblems(client, id, rows);
      if (problems.length) return { errors: problems };

      const newCount = rows.filter((r) => !r.idNumber).length;
      const submissionId = uuidv4();
      await client.query(
        `INSERT INTO manpower_submissions (id, subcontractor_id, submitted_by, file_name, payload, new_count, existing_count)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [submissionId, id, user.id, fileName, JSON.stringify(toPayload(rows)), newCount, rows.length - newCount]);
      await notify(client, {
        title: "Manpower list awaiting approval",
        detail: `${company.rows[0].company_name}: ${newCount} new and ${rows.length - newCount} existing workers submitted for approval.`,
        actorId: user.id, recipientIds: await adminIds(client),
      });
      return { id: submissionId, status: "pending", new_count: newCount, existing_count: rows.length - newCount };
    });
    if (outcome.errors) return rejected(res, outcome.errors);
    return sendOk(res, "Manpower list submitted for approval.", 1, outcome, 201);
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /subcontractors/:id/manpower-submissions   Newest first, without the worker rows.
export const listSubmissions = async (req, res) => {
  try {
    const user = await requireUser(req, res, READ_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid subcontractor id.");
    const rows = await withTransaction((client) => client.query(
      `${SUMMARY_SQL} WHERE s.subcontractor_id = $1 ORDER BY s.created_at DESC LIMIT ${LIST_LIMIT}`, [id]));
    return sendOk(res, "Manpower submissions retrieved.", rows.rowCount, rows.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /manpower-submissions/:id   One submission with its worker rows, for the Admin's review or its own submitter.
export const getSubmission = async (req, res) => {
  try {
    const user = await requireUser(req, res, READ_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid submission id.");
    const found = await withTransaction((client) => client.query(
      `${SUMMARY_SQL.replace("s.result,", "s.result, s.payload,")} WHERE s.id = $1`, [id]));
    // Anyone else gets "not found", so another person's list is not revealed.
    if (found.rowCount === 0 || (user.role !== "admin" && found.rows[0].submitted_by !== user.id)) throw new HttpError(404, "Submission not found.");
    return sendOk(res, "Manpower submission retrieved.", 1, found.rows[0]);
  } catch (error) {
    return handleError(res, error);
  }
};

// Locks a pending submission for a decision. Throws 404, or 409 when it was already decided.
async function lockPending(client, id) {
  const found = await client.query(
    `SELECT s.*, c.company_name FROM manpower_submissions s JOIN subcontractors c ON c.id = s.subcontractor_id
      WHERE s.id = $1 FOR UPDATE OF s`, [id]);
  if (found.rowCount === 0) throw new HttpError(404, "Submission not found.");
  if (found.rows[0].status !== "pending") throw new HttpError(409, `This list was already ${found.rows[0].status}.`);
  return found.rows[0];
}

// POST /manpower-submissions/:id/approve   Admin only. Creates the workers and assigns their ID numbers.
export const approveSubmission = async (req, res) => {
  try {
    const user = await requireUser(req, res, ADMIN_ONLY);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid submission id.");
    const outcome = await withTransaction(async (client) => {
      const submission = await lockPending(client, id);
      // Checked again now: the company's workers may have changed since the list was submitted.
      const { rows, errors } = validateImportRows(submission.payload);
      if (errors.length) return { errors };
      const result = await applyImport(client, submission.subcontractor_id, rows, user.id);
      if (result.errors) return result;
      await client.query(
        `UPDATE manpower_submissions SET status = 'approved', decided_by = $2, decided_at = now(), result = $3::jsonb WHERE id = $1`,
        [id, user.id, JSON.stringify(result)]);
      await notify(client, {
        title: "Manpower list approved",
        detail: `${submission.company_name}: ${result.created.length} new, ${result.updated} updated, ${result.unchanged} unchanged workers.`,
        actorId: user.id, recipientIds: [submission.submitted_by],
      });
      return result;
    });
    if (outcome.errors) return rejected(res, outcome.errors);
    return sendOk(res, "Manpower list approved.", outcome.created.length, outcome);
  } catch (error) {
    return handleError(res, error);
  }
};

// POST /manpower-submissions/:id/reject   body: { reason }   Admin only. Nothing is created.
export const rejectSubmission = async (req, res) => {
  try {
    const user = await requireUser(req, res, ADMIN_ONLY);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid submission id.");
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 3) throw new HttpError(400, "Enter the reason for rejecting this list. The Site PM will see it.");
    if (reason.length > REASON_MAX) throw new HttpError(400, `The reason can be at most ${REASON_MAX} characters.`);
    await withTransaction(async (client) => {
      const submission = await lockPending(client, id);
      await client.query(
        `UPDATE manpower_submissions SET status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1`,
        [id, user.id, reason]);
      await notify(client, {
        title: "Manpower list rejected",
        detail: `${submission.company_name}: ${reason}`,
        actorId: user.id, recipientIds: [submission.submitted_by],
      });
    });
    return sendOk(res, "Manpower list rejected.", 1, { id, status: "rejected" });
  } catch (error) {
    return handleError(res, error);
  }
};

// POST /manpower-submissions/:id/withdraw   The Site PM who submitted it, while it is still waiting.
export const withdrawSubmission = async (req, res) => {
  try {
    const user = await requireUser(req, res, SUBMIT_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid submission id.");
    await withTransaction(async (client) => {
      const submission = await lockPending(client, id);
      if (submission.submitted_by !== user.id) throw new HttpError(404, "Submission not found.");
      await client.query(`UPDATE manpower_submissions SET status = 'withdrawn', decided_by = $2, decided_at = now() WHERE id = $1`, [id, user.id]);
    });
    return sendOk(res, "Manpower list withdrawn.", 1, { id, status: "withdrawn" });
  } catch (error) {
    return handleError(res, error);
  }
};
