import { licenseAccessPolicy } from "../../domain/license-access.js";
import { randomUUID } from "node:crypto";
import { validateUpload } from "../workspace/upload-policy.utility.js";
import { SUBMISSION_KIND_SQL } from "./submission-kind.utility.js";
import { PROFESSIONS, licenseNumberError, isoDateValid } from "../../domain/engineer-credentials.js";
// Engineer submissions need review. Administrator saves are verified in the same transaction. Documents are personal data and are
// readable only by the license holder and by Administrators.
import fs from "node:fs";
import path from "node:path";
import { HttpError, handleError, isUuid, requireUser, sendError, sendOk } from "../../common/utilities/access.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { localDay, loadLicenseState } from "../../common/utilities/license-status.utility.js";
import { adminIds, notify } from "../../common/utilities/notify.utility.js";
import { resolveNotifications } from "../notifications/notification.utility.js";
import {validateSpecializations,requireCredentialTags,credentialTagsInstalled} from './credential-specializations.utility.js';

const UPLOAD_ROOT = path.resolve("uploads");
const isIsoDate = isoDateValid;

export const publicState = (s) => ({
  access: s.access, renewalSubmissionAllowed: licenseAccessPolicy(s.expiry).daysToExpiry === null || licenseAccessPolicy(s.expiry).daysToExpiry > 23, renewalOnly: !!s.pendingRenewal || licenseAccessPolicy(s.expiry).mode === "view_only", restrictedOn: licenseAccessPolicy(s.expiry).restrictedOn, noticeOn: licenseAccessPolicy(s.expiry).noticeOn,
  status: s.status, base: s.base, restricted: s.restricted, expiry: s.expiry, daysToExpiry: s.daysToExpiry,
  graceEndsOn: s.graceEndsOn, graceDaysLeft: s.graceDaysLeft, graceEnded: s.graceEnded,
  graceDays: s.rules.graceDays, reminderDays: s.rules.reminderDays, licenseNumber: s.licenseNumber,
  renewal: s.renewal && {
    id: s.renewal.id, status: s.renewal.status, submittedAt: s.renewal.submitted_at, reviewedAt: s.renewal.reviewed_at,
    reviewNote: s.renewal.status === "rejected" ? s.renewal.review_note : null, licenseExpiry: s.renewal.license_expiry, submissionKind: s.renewal.submission_kind,
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

/** An engineer submits their own renewal, or an Administrator records one for them. Used by POST /licenses/renewals. */
export async function createRenewalRequest(db, user, body, file, options = {}) {
  const verifyNow = user.role === "admin" && options.pending !== true &&
    (body.specializations === undefined || options.reviewed === true);
  const userId = user.role === "admin" ? (body.user_id ?? body.userId) : user.id;
  if (!isUuid(userId)) throw new HttpError(400, "Select the engineer whose license is being renewed.");
  const number = body.license_number ?? body.licenseNumber;
  const profession = body.profession;
  let tags=body.specializations;
  if (tags!==undefined) {
    if (typeof tags==='string') {try {tags=JSON.parse(tags);} catch {throw new HttpError(400,'Specializations must be an array.');}}
    validateSpecializations(tags);
    await requireCredentialTags(db);
  }
  if (!PROFESSIONS.includes(profession)) throw new HttpError(400, "Select the licensed profession. Do not infer it from tags.");
  const numberError = licenseNumberError(number);
  if (numberError) throw new HttpError(400, numberError);
  const expiry = body.license_expiry ?? body.licenseExpiry;
  if (!file) throw new HttpError(400, "Upload the renewed license (PDF, JPG or PNG).");

  if (!isIsoDate(expiry)) throw new HttpError(400, "Enter the new expiry date (YYYY-MM-DD).");
  if (expiry <= localDay()) throw new HttpError(400, "The new expiry date must be in the future.");
  const engineer = (await db.query(
    `select u.full_name from users u join roles r on r.id=u.role_id
      where u.id=$1 and r.code in ('opm','spm') and not coalesce(u.is_deleted,false)`, [userId])).rows[0];
  if (!engineer) throw new HttpError(404, "Engineer not found.");
  await db.query("select id from users where id=$1 for update", [userId]);
  const replaces=body.replaces_license_id||null;
  if(replaces) {
    if(!isUuid(replaces)) throw new HttpError(400,"Invalid previous credential.");
    const old=(await db.query("select profession from user_licenses where id=$1 and user_id=$2 and superseded_at is null",[replaces,userId])).rows[0];
    if(!old||(old.profession&&old.profession!==profession))throw new HttpError(422,"The previous credential must belong to this engineer and profession.");
  }
  try {
    if (verifyNow) {
      const pending = (await db.query("select id from license_renewal_requests where user_id=$1 and profession=$2 and status='under_review' for update", [userId, profession])).rows;
      for (const old of pending) {
        await db.query("update license_renewal_requests set status='rejected',reviewed_by=$2,reviewed_at=now(),review_note=$3 where id=$1", [old.id, user.id, "Replaced by a credential saved directly by an Administrator."]);
        await resolveNotifications(db, { subjectType: "license_renewal", subjectId: String(old.id), reason: "Replaced by Administrator credential update." });
      }
    }
    const inserted = await db.query(
      `insert into license_renewal_requests(user_id,license_number,license_expiry,file_ref,submitted_by,profession,replaces_license_id)
       values($1,$2,$3,$4,$5,$6,$7) returning id,status,submitted_at`,
      [userId, number, expiry, file.path.replace(/\\/g, "/"), user.id, profession, replaces]);
    if (tags!==undefined) await db.query('update license_renewal_requests set specializations=$2 where id=$1',[inserted.rows[0].id,tags]);
    if (verifyNow) {
      const verified = await reviewRenewalInTransaction(db, user, inserted.rows[0].id, "verified", { note: options.note || "Saved directly by Administrator." });
      return { ...inserted.rows[0], ...verified };
    }
    const kind = (await db.query(`select ${SUBMISSION_KIND_SQL} as kind from license_renewal_requests q where q.id=$1`, [inserted.rows[0].id])).rows[0].kind;
    await notify(db, { title: kind === "initial" ? "Initial credential awaiting approval" : "License renewal to review", recipientIds: await adminIds(db), actorId: user.id,
      subjectType: "license_renewal", subjectId: String(inserted.rows[0].id), link: "/licenses/renewals",
      detail: kind === "initial" ? `${engineer.full_name} has an initial credential awaiting Admin verification (expires ${expiry}).` : `${engineer.full_name} submitted a license renewal (expires ${expiry}).` });
    return inserted.rows[0];
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "A renewal is already under review.");
    throw error;
  }
}

export const submitRenewal = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return;
    }
    const data = await withTransaction(async (db) => {
      if (!req.file) throw new HttpError(400, "Choose a supporting license document.");
      const bytes = req.file.buffer || fs.readFileSync(req.file.path);
      const contentType = await validateUpload({ ...req.file, buffer: bytes }, "document");
      if (!["application/pdf", "image/jpeg", "image/png"].includes(contentType)) throw new HttpError(400, "Use a PDF, JPG or PNG license document.");
      const targetId = user.role === "admin" ? (req.body.user_id ?? req.body.userId) : user.id;
      if (!isUuid(targetId)) throw new HttpError(400, "Select the engineer.");
      const fileId = randomUUID();
      await db.query("insert into stored_files(id,user_id,purpose,original_name,content_type,byte_size,content,uploaded_by) values($1,$2,'account',$3,$4,$5,$6,$7)", [fileId,targetId,req.file.originalname,contentType,bytes.length,bytes,user.id]);
      return createRenewalRequest(db, user, req.body || {}, { path: "db:" + fileId },{pending:req.body?.pending==='true'});
    });
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return sendOk(res, data.status==='verified' ? "Credential saved and verified." : "Credential saved pending Administrator verification.", 1, data, 201);
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
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
              q.status, q.profession, ${SUBMISSION_KIND_SQL} as submission_kind, q.submitted_at, q.reviewed_at, q.review_note, reviewer.full_name as reviewed_by_name
         from license_renewal_requests q join users u on u.id=q.user_id join roles r on r.id=u.role_id left join users reviewer on reviewer.id=q.reviewed_by
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
    if (row.file_ref.startsWith("db:")) {
      const id = row.file_ref.replace(/^db:(\/\/)?/, "");
      if (!isUuid(id)) return sendError(res,"Document not found.",404);
      return res.redirect(307, `/api/v1/files/${id}/content`);
    }
    const absolute = path.resolve(row.file_ref);
    if (!absolute.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(absolute)) return sendError(res, "Document not found.", 404);
    return res.download(absolute, `License_document${path.extname(absolute)}`);
  } catch (error) { return handleError(res, error); }
};

async function reviewRenewalInTransaction(db, user, requestId, decision, body = {}) {
  if (user.role !== "admin") throw new HttpError(403, "Only an Administrator can verify credentials.");
  const note = String(body.note ?? body.review_note ?? "").trim();
  if (decision === "rejected" && !note) throw new HttpError(400, "A reason is required to reject a renewal.");
  if (note.length > 2000) throw new HttpError(400, "Review note must be at most 2000 characters.");
  const owner=(await db.query("select user_id from license_renewal_requests where id=$1",[requestId])).rows[0];
  if(!owner)throw new HttpError(404,"Renewal not found.");
  await db.query("select id from users where id=$1 for update",[owner.user_id]);
  const found = await db.query(`select q.*, q.license_expiry::text as expiry_text, ${SUBMISSION_KIND_SQL} as submission_kind from license_renewal_requests q where q.id=$1 for update of q`, [requestId]);
  const request = found.rows[0];
  if (!request) throw new HttpError(404, "Renewal not found.");
  if (request.status !== "under_review") throw new HttpError(409, `This renewal was already ${request.status}.`);
  let licenseId = null;
  if (decision === "verified") {
    const number = body?.license_number ?? request.license_number;
    const profession = body?.profession ?? request.profession;
    if (!PROFESSIONS.includes(profession)) throw new HttpError(400, "Select the licensed profession before verifying this legacy submission.");
    if (licenseNumberError(number)) throw new HttpError(400, licenseNumberError(number));
    await db.query("select id from users where id=$1 for update", [request.user_id]);
    const expiry = body?.license_expiry ?? request.expiry_text;
    if (!note) throw new HttpError(400, "Record the manual verification result in a review note.");
    if (!isIsoDate(expiry) || expiry <= localDay()) throw new HttpError(400, "A future expiry date (YYYY-MM-DD) is required.");
    if(request.replaces_license_id) {
      const old=(await db.query("select profession from user_licenses where id=$1 and user_id=$2",[request.replaces_license_id,request.user_id])).rows[0];
      if(!old||(old.profession&&old.profession!==profession))throw new HttpError(422,"Replacement evidence does not match the verified profession.");
    }
    await db.query("select set_config('app.current_user_id',$1,true)", [user.id]);
    await db.query("update user_licenses set superseded_at=now(), updated_by=$2, updated_at=now() where user_id=$1 and profession=$3 and superseded_at is null", [request.user_id, user.id, profession]);
    licenseId = (await db.query(
      `insert into user_licenses(user_id,license_number,license_expiry,upload_file_ref,upload_status,created_by,updated_by,profession,verification_status,verified_by,verified_at,verification_note)
       values($1,$2,$3,$4,'uploaded',$5,$5,$6,'verified',$5,now(),$7) returning id`, [request.user_id, number, expiry, request.file_ref, user.id, profession, note])).rows[0].id;
    if (await credentialTagsInstalled(db)) {
      let tags=request.specializations;
      // Renewals inherit only the prior credential's explicit association.
      if (tags==null) tags=(await db.query('select specializations from user_licenses where user_id=$1 and profession=$2 and id<>$3 order by created_at desc limit 1',[request.user_id,profession,licenseId])).rows[0]?.specializations??null;
      if (tags!==null) validateSpecializations(tags);
      await db.query('update user_licenses set specializations=$2 where id=$1',[licenseId,tags]);
    }
  }
  if(decision==='verified'&&request.replaces_license_id)await db.query("update user_licenses set superseded_at=now(),updated_by=$3 where id=$1 and user_id=$2 and superseded_at is null",[request.replaces_license_id,request.user_id,user.id]);
  await db.query(
    `update license_renewal_requests set status=$2, reviewed_by=$3, reviewed_at=now(), review_note=$4, resulting_license_id=$5 where id=$1`,
    [request.id, decision, user.id, note || null, licenseId]);
  await notify(db, {
    title: decision === "verified" ? "License verified" : request.submission_kind === "initial" ? "Initial credential requires correction" : "License renewal rejected",
    detail: decision === "verified" ? "Your credential was verified. Assignment eligibility depends on the required profession, expiry, availability and holds." : `Reason: ${note}`,
    recipientIds: [request.user_id], actorId: user.id,
  });
  await resolveNotifications(db, { subjectType: "license_renewal", subjectId: String(request.id), reason: `Renewal ${decision}.` });
  return { id: request.id, status: decision, user_id: request.user_id };
}

async function review(req, res, decision) {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    if (!/^\d+$/.test(req.params.id)) return sendError(res, "Invalid renewal id.", 400);
    const data = await withTransaction(db => reviewRenewalInTransaction(db, user, req.params.id, decision, req.body || {}));
    return sendOk(res, decision === "verified" ? "Renewal verified." : "Renewal rejected.", 1, data);
  } catch (error) { return handleError(res, error); }
}
export const verifyRenewal = (req, res) => review(req, res, "verified");
export const rejectRenewal = (req, res) => review(req, res, "rejected");
export const isValidIsoDate = isIsoDate;
