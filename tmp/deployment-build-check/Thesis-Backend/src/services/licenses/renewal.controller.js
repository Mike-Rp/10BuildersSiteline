// Administrators submit and review renewals on behalf of engineers. Documents are personal data and are
// readable only by the license holder and by Administrators.
import fs from "node:fs";
import path from "node:path";
import { HttpError, handleError, isUuid, requireUser, sendError, sendOk } from "../../common/utilities/access.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { localDay, loadLicenseState } from "../../common/utilities/license-status.utility.js";
import { adminIds, notify } from "../../common/utilities/notify.utility.js";
import { resolveNotifications } from "../notifications/notification.utility.js";

const UPLOAD_ROOT = path.resolve("uploads");
const isIsoDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "") && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const publicState = (s) => ({
  status: s.status, base: s.base, restricted: s.restricted, expiry: s.expiry, daysToExpiry: s.daysToExpiry,
  graceEndsOn: s.graceEndsOn, graceDaysLeft: s.graceDaysLeft, graceEnded: s.graceEnded,
  graceDays: s.rules.graceDays, reminderDays: s.rules.reminderDays, licenseNumber: s.licenseNumber,
  renewal: s.renewal && {
    id: s.renewal.id, status: s.renewal.status, submittedAt: s.renewal.submitted_at, reviewedAt: s.renewal.reviewed_at,
    reviewNote: s.renewal.status === "rejected" ? s.renewal.review_note : null, licenseExpiry: s.renewal.license_expiry,
  },
});

/** GET /licenses/me — the signed-in engineer's own license status (drives the banner and countdown). */
export const myLicense = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["opm", "spm"]);
    if (!user) return;
    return sendOk(res, "License status retrieved.", 1, publicState(await loadLicenseState(user.id)));
  } catch (error) { return handleError(res, error); }
};

/** An Administrator records a renewal for an engineer. Used by POST /licenses/renewals. */
export async function createRenewalRequest(db, user, body, file) {
  if (user.role !== "admin") throw new HttpError(403, "Only an Administrator can upload or update licenses.");
  const userId = body.user_id ?? body.userId;
  if (!isUuid(userId)) throw new HttpError(400, "Select the engineer whose license is being renewed.");
  const number = String(body.license_number ?? body.licenseNumber ?? "").trim();
  const expiry = body.license_expiry ?? body.licenseExpiry;
  if (!file) throw new HttpError(400, "Upload the renewed license (PDF, JPG or PNG).");
  if (!number || number.length > 120) throw new HttpError(400, "Enter the engineer's license number.");
  if (!isIsoDate(expiry)) throw new HttpError(400, "Enter the new expiry date (YYYY-MM-DD).");
  if (expiry <= localDay()) throw new HttpError(400, "The new expiry date must be in the future.");
  const engineer = (await db.query(
    `select u.full_name from users u join roles r on r.id=u.role_id
      where u.id=$1 and r.code in ('opm','spm') and not coalesce(u.is_deleted,false)`, [userId])).rows[0];
  if (!engineer) throw new HttpError(404, "Engineer not found.");
  try {
    const inserted = await db.query(
      `insert into license_renewal_requests(user_id,license_number,license_expiry,file_ref,submitted_by)
       values($1,$2,$3,$4,$5) returning id,status,submitted_at`,
      [userId, number, expiry, file.path.replace(/\\/g, "/"), user.id]);
    await notify(db, { title: "License renewal to review", recipientIds: await adminIds(db), actorId: user.id,
      subjectType: "license_renewal", subjectId: String(inserted.rows[0].id), link: "/licenses/renewals",
      detail: `An Administrator submitted ${engineer.full_name}'s renewed license (expires ${expiry}).` });
    return inserted.rows[0];
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "A renewal is already under review.");
    throw error;
  }
}

export const submitRenewal = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return;
    }
    const data = await withTransaction((db) => createRenewalRequest(db, user, req.body || {}, req.file));
    return sendOk(res, "Renewal uploaded. It will be reviewed by an Administrator.", 1, data, 201);
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return handleError(res, error);
  }
};

/** GET /licenses/renewals?status=under_review — Administrator queue. */
export const listRenewals = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const status = ["under_review", "verified", "rejected"].includes(req.query.status) ? req.query.status : null;
    const rows = (await execute(
      `select q.id, q.user_id, u.full_name, r.code as role, q.license_number, q.license_expiry::text as license_expiry,
              q.status, q.submitted_at, q.reviewed_at, q.review_note
         from license_renewal_requests q join users u on u.id=q.user_id join roles r on r.id=u.role_id
        where ($1::text is null or q.status=$1) order by q.submitted_at desc limit 200`, [status])).rows;
    return sendOk(res, "Renewals retrieved.", rows.length, rows);
  } catch (error) { return handleError(res, error); }
};

/** GET /licenses/renewals/:id/file — the license holder or an Administrator. */
export const renewalFile = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!/^\d+$/.test(req.params.id)) return sendError(res, "Document not found.", 404);
    const row = (await execute("select user_id, file_ref from license_renewal_requests where id=$1", [req.params.id])).rows[0];
    if (!row || (user.role !== "admin" && user.id !== row.user_id)) return sendError(res, "Document not found.", 404);
    const absolute = path.resolve(row.file_ref);
    if (!absolute.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(absolute)) return sendError(res, "Document not found.", 404);
    return res.download(absolute, `License_renewal${path.extname(absolute)}`);
  } catch (error) { return handleError(res, error); }
};

async function review(req, res, decision) {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    if (!/^\d+$/.test(req.params.id)) return sendError(res, "Invalid renewal id.", 400);
    const note = String(req.body?.note ?? req.body?.review_note ?? "").trim();
    if (decision === "rejected" && !note) return sendError(res, "A reason is required to reject a renewal.", 400);
    const data = await withTransaction(async (db) => {
      const found = await db.query("select *, license_expiry::text as expiry_text from license_renewal_requests where id=$1 for update", [req.params.id]);
      const request = found.rows[0];
      if (!request) throw new HttpError(404, "Renewal not found.");
      if (request.status !== "under_review") throw new HttpError(409, `This renewal was already ${request.status}.`);
      let licenseId = null;
      if (decision === "verified") {
        const number = String(req.body?.license_number ?? request.license_number).trim();
        const expiry = req.body?.license_expiry ?? request.expiry_text;
        if (!number) throw new HttpError(400, "A license number is required.");
        if (!isIsoDate(expiry)) throw new HttpError(400, "A valid expiry date (YYYY-MM-DD) is required.");
        await db.query("select set_config('app.current_user_id',$1,true)", [user.id]);
        await db.query("update user_licenses set superseded_at=now(), updated_by=$2, updated_at=now() where user_id=$1 and superseded_at is null", [request.user_id, user.id]);
        licenseId = (await db.query(
          `insert into user_licenses(user_id,license_number,license_expiry,upload_file_ref,upload_status,created_by,updated_by)
           values($1,$2,$3,$4,'uploaded',$5,$5) returning id`, [request.user_id, number, expiry, request.file_ref, user.id])).rows[0].id;
      }
      await db.query(
        `update license_renewal_requests set status=$2, reviewed_by=$3, reviewed_at=now(), review_note=$4, resulting_license_id=$5 where id=$1`,
        [request.id, decision, user.id, note || null, licenseId]);
      await notify(db, {
        title: decision === "verified" ? "License verified" : "License renewal rejected",
        detail: decision === "verified" ? "Your license renewal was verified. Your work is no longer paused." : `Reason: ${note}`,
        recipientIds: [request.user_id], actorId: user.id,
      });
      await resolveNotifications(db, { subjectType: "license_renewal", subjectId: String(request.id), reason: `Renewal ${decision}.` });
      return { id: request.id, status: decision, user_id: request.user_id };
    });
    return sendOk(res, decision === "verified" ? "Renewal verified." : "Renewal rejected.", 1, data);
  } catch (error) { return handleError(res, error); }
}
export const verifyRenewal = (req, res) => review(req, res, "verified");
export const rejectRenewal = (req, res) => review(req, res, "rejected");
export const isValidIsoDate = isIsoDate;
