import { validateUpload } from "../workspace/upload-policy.utility.js";
import { saveSpecializations,credentialSummary } from "../licenses/credentials.controller.js";
import { workEmailFromAssignedId, assertWorkEmailAvailable } from "./work-email.utility.js";
import { employeeIdFromWorkEmail } from "../../domain/work-email.js";
import { ENGINEER_SPECIALIZATIONS } from "../../domain/engineer-credentials.js";
import { createRenewalRequest } from "../licenses/renewal.controller.js";
import {validateSpecializations,requireCredentialTags} from '../licenses/credential-specializations.utility.js';
import { archiveNote,recordArchiveEvent } from "../archive/audit.utility.js";
import { clientEmailError } from "../../domain/client-email.js";
import { activeClaim } from "./reset-follow-up.utility.js";
import crypto from "crypto";
import { accountListQuery } from "./account-list.utility.js";
import { validateEngineerExperience, saveEngineerExperience } from "./experience.utility.js";
import fs from "fs";
import multer from "multer";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import {
  HttpError, handleError, sendOk, sendError, requireUser, isUuid,
} from "../../common/utilities/access.utility.js";

// Uses the existing users table and role-specific scope junction tables.
const STATUSES = ["active", "invited", "suspended"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_SCOPE = { spm: "disciplines", opm: "project_types", client: "projects" };
const SCOPE_KEYS = {
  disciplines: "disciplines",
  project_types: "project_types", projectTypes: "project_types",
  projects: "projects", linked_project_ids: "projects", linkedProjectIds: "projects",
};
const OPM_MAX_SPECIALIZATIONS = 2;
const TEMP_PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* ------------------------------ helpers ------------------------------ */

const pick = (body, snake, camel) => (body[snake] !== undefined ? body[snake] : body[camel]);

const makeTempPassword = (length = 10) =>
  Array.from({ length }, () => TEMP_PASSWORD_ALPHABET[crypto.randomInt(TEMP_PASSWORD_ALPHABET.length)]).join("");

// The OPM cap trigger raises a plain Postgres exception (P0001); the spec wants 422 for it.
const fail = (res, error) =>
  error.code === "P0001" ? sendError(res, error.message, 422) : handleError(res, error);

// admin, or the account owner. Anyone else gets 404 so existence is not leaked.
const requireSelfOrAdmin = async (req, res, id) => {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role === "admin" || user.id === id) return user;
  sendError(res, "Account not found.", 404);
  return null;
};

// -> null (no scope sent)  or  { kind, values }
const normalizeScope = (role, scope) => {
  if (scope === undefined || scope === null) return null;
  if (typeof scope !== "object" || Array.isArray(scope)) throw new HttpError(400, "scope must be an object.");

  const found = {};
  for (const [key, value] of Object.entries(scope)) {
    const kind = SCOPE_KEYS[key];
    if (!kind) throw new HttpError(400, `Unknown scope key: ${key}`);
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new HttpError(400, `scope.${key} must be an array of strings.`);
    }
    found[kind] = [...new Set(value)];
  }

  const expected = ROLE_SCOPE[role];
  const kinds = Object.keys(found);
  if (kinds.length === 0) return null;
  if (!expected) throw new HttpError(422, `A ${role} account has no scope.`);
  if (kinds.some((k) => k !== expected)) {
    throw new HttpError(422, `A ${role} account can only have '${expected}' scope.`);
  }
  if (role === "opm" && found[expected].length > OPM_MAX_SPECIALIZATIONS) {
    throw new HttpError(422, `An OPM can specialise in at most ${OPM_MAX_SPECIALIZATIONS} project types.`);
  }
  if (role === "spm" && found[expected].length > 3) throw new HttpError(422,"An SPM can have at most 3 disciplines.");
  return { kind: expected, values: found[expected] };
};

const lookupIds = async (client, table, values) => {
  const result = await client.query(`SELECT id, code FROM ${table} WHERE code = ANY($1::text[])`, [values]);
  const unknown = values.filter((v) => !result.rows.some((r) => r.code === v));
  if (unknown.length > 0) throw new HttpError(400, `Unknown ${table} value(s): ${unknown.join(", ")}`);
  return result.rows.map((r) => r.id);
};

// Replaces the user's whole scope of one kind.
const writeScope = async (client, userId, { kind, values }, actorId) => {
  if (kind === "disciplines") {
    if(values.some(value=>!ENGINEER_SPECIALIZATIONS.includes(value))) throw new HttpError(422,"Select engineer specializations from the independent engineer catalog. Legacy company trades require review.");
    await saveSpecializations(client,userId,values,actorId);
    const ids = (await client.query("select id from disciplines where code=any($1::text[])",[values])).rows.map(row=>row.id);
    await client.query(`DELETE FROM user_discipline_scopes WHERE user_id = $1`, [userId]);
    for (const id of ids) {
      await client.query(
        `INSERT INTO user_discipline_scopes (user_id, discipline_id, created_by, updated_by) VALUES ($1, $2, $3, $3)`,
        [userId, id, actorId]);
    }
  } else if (kind === "project_types") {
    const ids = await lookupIds(client, "project_types", values);
    await client.query(`DELETE FROM user_project_type_specializations WHERE user_id = $1`, [userId]);
    for (const id of ids) {
      await client.query(
        `INSERT INTO user_project_type_specializations (user_id, project_type_id, created_by, updated_by) VALUES ($1, $2, $3, $3)`,
        [userId, id, actorId]);
    }
  } else if (kind === "projects") {
    if (values.some((v) => !isUuid(v))) throw new HttpError(400, "Project ids must be valid UUIDs.");
    const found = await client.query(
      `SELECT id FROM projects WHERE id = ANY($1::uuid[]) AND COALESCE(is_deleted, false) = false`, [values]);
    if (found.rowCount !== values.length) throw new HttpError(400, "One or more project ids do not exist.");
    await client.query(`DELETE FROM user_client_project_links WHERE user_id = $1`, [userId]);
    for (const id of values) {
      await client.query(
        `INSERT INTO user_client_project_links (user_id, project_id, created_by, updated_by) VALUES ($1, $2, $3, $3)`,
        [userId, id, actorId]);
    }
  }
};

/* ------------------------------- list ------------------------------- */

// GET /accounts?role=&status=&q=&page=&pageSize=   (or limit/offset)
export const listAccounts = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    const query=accountListQuery(req.query);
    const total=await execute(query.countSql,query.params);
    const rows=await execute(query.dataSql,query.dataParams);
    const count=total.rows[0].total;
    return res.status(200).json({code:200,message:"Accounts retrieved.",count,data:rows.rows,
      pagination:{page:query.page,page_size:query.limit,total:count,total_pages:Math.ceil(count/query.limit),
        has_next:query.offset+rows.rowCount<count,has_previous:query.offset>0}});
  } catch(error) { return fail(res,error); }
};

/* ------------------------------ create ------------------------------ */

// POST /accounts   body: { full_name, email, phone?, role, scope? }
export async function createAccountRecord(client, actor, body) {
  if (body.request_id === undefined) return insertAccountRecord(client, actor, body);
  if (!isUuid(body.request_id)) throw new HttpError(400, "Invalid account creation request ID.");
  // Keep retries safe even when the original response or a later workspace save was lost.
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const { password, ...details } = body;
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(canonical(details))).digest("hex");
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`account-create:${actor.id}:${body.request_id}`]);
  const previous = (await client.query(
    `select u.id,to_jsonb(u)->>'id_number' as id_number,u.full_name,u.email,u.phone,u.status,u.date_added::text as date_added,u.password_hash,r.code as role,
      m.metadata->'accountCreation'->>'fingerprint' as fingerprint
      from users u join roles r on r.id=u.role_id join workspace_account_metadata m on m.user_id=u.id
      where u.created_by=$2 and m.metadata->'accountCreation'->>'requestId'=$1 limit 1`,
    [body.request_id, actor.id],
  )).rows[0];
  if (previous) {
    if (previous.fingerprint !== fingerprint || (password !== undefined && (typeof password !== "string" || !await bcrypt.compare(password, previous.password_hash)))) {
      throw new HttpError(409, "This account creation request was already used with different details. Reopen the form to create another account.");
    }
    const { password_hash, fingerprint: storedFingerprint, ...saved } = previous;
    void password_hash; void storedFingerprint;
    return { ...saved, ...(password !== undefined ? { temp_password: password } : {}) };
  }
  const saved = await insertAccountRecord(client, actor, body);
  await client.query(
    `insert into workspace_account_metadata(user_id,metadata) values($1,$2::jsonb)
      on conflict(user_id) do update set metadata=workspace_account_metadata.metadata||excluded.metadata`,
    [saved.id, JSON.stringify({ accountCreation: { requestId: body.request_id, fingerprint } })],
  );
  return saved;
}

async function insertAccountRecord(client, actor, body) {
  const fullName = body.full_name ?? body.fullName ?? body.contact_person;
  const userId = uuidv4();
  const automaticEmail = body.auto_work_email === true;
  // Insert once so the database assigns its own id_number. This private address
  // is replaced in the same transaction and is never returned or committed.
  const email = body.auto_work_email === true
    ? `pending.${userId}@10builders.com`
    : typeof body.email === "string" ? body.email.trim().toLowerCase() : body.email;
  if (automaticEmail) workEmailFromAssignedId(body.last_name, "10B00001"); // Validate the surname before inserting.
  const phone = body.phone ?? body.contact_number ?? null;
  const role = body.role;
  if (role === "client" && clientEmailError(email)) throw new HttpError(400, clientEmailError(email));
  if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length>150) throw new HttpError(400,"full_name is required (max 150 characters).");
  if (typeof email !== "string" || email.length>254 || !EMAIL_RE.test(email)) throw new HttpError(400,"A valid email is required.");
  if (phone!==null && (typeof phone!=="string" || (phone !== "" && !/^\d{11}$/.test(phone)))) throw new HttpError(400,"Contact number must contain exactly 11 digits.");
  if (!["admin","opm","spm","client"].includes(role)) throw new HttpError(400,"Invalid role.");
  const associated=Array.isArray(body.initial_credentials)&&body.initial_credentials.some(c=>c?.specializations!==undefined);
  if (associated) {
    await requireCredentialTags(client);
    for(const credential of body.initial_credentials)validateSpecializations(credential?.specializations);
  }
  const scope = normalizeScope(role,associated&&role==='spm'?undefined:body.scope);
  const experience = validateEngineerExperience(body.experience_by_type, role);
  await assertWorkEmailAvailable(client, email, null, body.auto_work_email === true ? undefined : body.employee_id);
  const password = body.password ?? makeTempPassword();
  if (typeof password!=="string" || password.length<8 || Buffer.byteLength(password,"utf8")>72) throw new HttpError(400,"Temporary password must be at least 8 characters and at most 72 UTF-8 bytes.");
  const roleRow = await client.query("SELECT id FROM roles WHERE code=$1",[role]);
  if (!roleRow.rowCount) throw new HttpError(400,"Role is not configured.");
  const hash = await bcrypt.hash(password,12);
  // The unique email covers deactivated accounts too: a company email is never reused.
  const inserted = await client.query(
    `INSERT INTO users (id,full_name,email,phone,password_hash,temp_password_issued,role_id,status,created_by,updated_by)
     VALUES ($1,$2,$3,$4,$5,true,$6,'invited',$7,$7)
     RETURNING id,to_jsonb(users)->>'id_number' as id_number,full_name,email,phone,status,date_added::text AS date_added`,
    [userId,fullName.trim(),email,phone?.trim() || null,hash,roleRow.rows[0].id,actor.id])
    .catch((error) => { throw error.code === "23505" ? new HttpError(409,"This email is already assigned to another account.") : error; });
  if (automaticEmail) {
    const workEmail = workEmailFromAssignedId(body.last_name, inserted.rows[0].id_number);
    await assertWorkEmailAvailable(client, workEmail, userId);
    await client.query("update users set email=$2 where id=$1", [userId, workEmail]);
    inserted.rows[0].email = workEmail;
  }
  if (scope) await writeScope(client,inserted.rows[0].id,scope,actor.id);
  await saveEngineerExperience(client, inserted.rows[0].id, experience);
  if (body.initial_credentials !== undefined) {
    if (actor.role !== "admin") throw new HttpError(403, "Administrator access required.");
    const credentials = body.initial_credentials;
    if (!["spm", "opm"].includes(role) || !Array.isArray(credentials) || !credentials.length || credentials.length > 6)
      throw new HttpError(400, "Provide one to six professional credentials for an engineer account.");
    if (new Set(credentials.map(c => c?.profession)).size !== credentials.length)
      throw new HttpError(400, "Enter each licensed profession only once.");
    if (!["pending", "verified"].includes(body.credential_decision)) throw new HttpError(400, "Choose pending verification or verified.");
    const note = typeof body.credential_review_note === "string" ? body.credential_review_note.trim() : "";
    if (note.length > 2000 || (body.credential_decision === "verified" && (body.credential_evidence_reviewed !== true || !note)))
      throw new HttpError(400, "Confirm the evidence review and record a verification note.");
    for (const credential of credentials) {
      if (!isUuid(credential?.file_id)) throw new HttpError(400, "Upload a supporting credential document.");
      const stored = (await client.query("select * from stored_files where id=$1 for update", [credential.file_id])).rows[0];
      if (!stored || stored.uploaded_by !== actor.id || stored.purpose !== "upload" || stored.project_id)
        throw new HttpError(404, "Available credential upload not found. Upload a new document.");
      // Storage-backed files were type-checked when the upload completed.
      if (!stored.storage_path) await validateUpload(stored, "document");
      if (!["application/pdf", "image/jpeg", "image/png"].includes(stored.content_type))
        throw new HttpError(400, "Credential documents must be PDF, JPG or PNG.");
      await client.query("update stored_files set user_id=$2,purpose='account' where id=$1", [stored.id, userId]);
      await createRenewalRequest(client, actor, { user_id: userId, profession: credential.profession,
        license_number: credential.license_number, license_expiry: credential.license_expiry,...(associated?{specializations:credential.specializations}:{}) },
        { path: "db:" + stored.id }, { pending: body.credential_decision === "pending",reviewed:body.credential_decision==='verified'&&body.credential_evidence_reviewed===true, note });
    }
  }
  return { ...inserted.rows[0],role,temp_password:password };
}

export const createAccount = async (req,res) => {
  try {
    const actor = await requireUser(req,res,["admin"]);
    if (!actor) return;
    const data = await withTransaction(client=>createAccountRecord(client,actor,req.body || {}));
    return sendOk(res,"Account created.",1,data,201);
  } catch(error) { return fail(res,error); }
};

export const issueTemporaryPassword = async (req,res) => {
  try {
    const actor = await requireUser(req,res,["admin"]);
    if (!actor) return;
    return sendOk(res,"Temporary password generated.",1,{temp_password:makeTempPassword()});
  } catch(error) { return fail(res,error); }
};

export const deleteAccount = async (req,res) => {
  try {
    const actor = await requireUser(req,res,["admin"]);
    if (!actor) return;
    if (!isUuid(req.params.id)) return sendError(res,"Invalid account id.",400);
    if (req.params.id===actor.id) return sendError(res,"You cannot delete your own account.",422);
    const reason=archiveNote(req.body?.reason);
    await withTransaction(async client=>{
      const row = await client.query(
        `UPDATE users SET is_deleted=true,status='suspended',deleted_at=now(),deleted_by=$2,updated_by=$2,updated_at=now()
         WHERE id=$1 AND COALESCE(is_deleted,false)=false RETURNING id`,[req.params.id,actor.id]);
      if (!row.rowCount) throw new HttpError(404,"Account not found.");
      await client.query("DELETE FROM users_token WHERE user_id=$1",[req.params.id]);
      await recordArchiveEvent(client,actor.id,"users",req.params.id,"account_removed",{reason});
    });
    return res.status(204).send();
  } catch(error) { return fail(res,error); }
};

/* ------------------------------- detail ------------------------------- */

// GET /accounts/:id
export const getAccount = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid account id.", 400);
    const caller = await requireSelfOrAdmin(req, res, id);
    if (!caller) return;

    const base = await execute(
      `SELECT u.id, u.full_name, u.email, u.phone, r.code AS role, u.status,
              u.date_added::text AS date_added, u.last_login_at, u.temp_password_issued,
              (SELECT m.metadata->'experienceByType' FROM workspace_account_metadata m WHERE m.user_id=u.id) AS experience_by_type
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND COALESCE(u.is_deleted, false) = false`, [id]);
    if (base.rowCount === 0) return sendError(res, "Account not found.", 404);

    const [disciplines, projectTypes, projects, license, certs] = await Promise.all([
      execute(`SELECT d.code FROM user_discipline_scopes s JOIN disciplines d ON d.id = s.discipline_id
                WHERE s.user_id = $1 ORDER BY d.code`, [id]),
      execute(`SELECT pt.code FROM user_project_type_specializations s JOIN project_types pt ON pt.id = s.project_type_id
                WHERE s.user_id = $1 ORDER BY pt.code`, [id]),
      execute(`SELECT p.id, p.name FROM user_client_project_links l JOIN projects p ON p.id = l.project_id
                WHERE l.user_id = $1 ORDER BY p.name`, [id]),
      execute(`SELECT id, license_number, license_expiry::text AS license_expiry, upload_status,upload_file_ref,profession,verification_status,verified_by,verified_at
                 FROM user_licenses WHERE user_id = $1 AND superseded_at IS NULL
                ORDER BY (verification_status='verified') DESC,license_expiry DESC,created_at DESC LIMIT 1`, [id]),
      execute(`SELECT ct.code FROM user_certifications uc JOIN certification_types ct ON ct.id = uc.certification_type_id
                WHERE uc.user_id = $1 ORDER BY ct.code`, [id]),
    ]);

    return sendOk(res, "Resource retrieved successfully.", 1, {
      ...base.rows[0],
      scope: {
        disciplines: disciplines.rows.map((r) => r.code),
        project_types: projectTypes.rows.map((r) => r.code),
        projects: projects.rows,
      },
      ...(["opm","spm"].includes(base.rows[0].role) ? await (async()=>{const summary=await credentialSummary({query:execute},id);return {specializations:summary.specializations.map(s=>s.specialization),hasCredentialSpecializations:[...summary.credentials,...summary.submissions].some(c=>c.specializations!=null),credentialCount:new Set([...summary.credentials.filter(c=>!c.superseded_at),...summary.submissions.filter(q=>q.status==='under_review')].map(c=>c.profession||String(c.id))).size,qualifiedRequirements:summary.qualifiedRequirements,credentialEligibility:summary.eligibleForNewAssignment}})() : {}),
      license: license.rows[0] ?? null,
      certifications: certs.rows.map((r) => r.code),
    });
  } catch (error) {
    return fail(res, error);
  }
};

/* ------------------------------- update ------------------------------- */

// PATCH /accounts/:id   body: any of { full_name, email, phone, scope }
export const updateAccount = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ["admin"]);
    if (!actor) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid account id.", 400);

    const b = req.body || {};
    if (b.role !== undefined) return sendError(res, "An account's role cannot be changed.", 422);
    const fullName = pick(b, "full_name", "fullName");
    if (fullName !== undefined && (!String(fullName).trim() || String(fullName).length > 150)) return sendError(res, "full_name must be 1-150 characters.", 400);
    if (b.email !== undefined && !EMAIL_RE.test(b.email)) return sendError(res, "A valid email is required.", 400);
    if (b.phone !== undefined && b.phone !== null && b.phone !== "" && (typeof b.phone !== "string" || !/^\d{11}$/.test(b.phone))) return sendError(res, "Contact number must contain exactly 11 digits.", 400);

    const data = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT u.id, u.email, r.code AS role FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1 AND COALESCE(u.is_deleted, false) = false FOR UPDATE OF u`, [id]);
      if (found.rowCount === 0) throw new HttpError(404, "Account not found.");
      const assignedId = employeeIdFromWorkEmail(found.rows[0].email);
      if (assignedId && b.email !== undefined && employeeIdFromWorkEmail(b.email) !== assignedId) throw new HttpError(422, "The system-assigned employee ID cannot be changed.");
      if (b.email !== undefined) await assertWorkEmailAvailable(client, b.email, id, b.employee_id);
      const scope = normalizeScope(found.rows[0].role, b.scope);
      const experience = validateEngineerExperience(b.experience_by_type, found.rows[0].role);

      const sets = [];
      const params = [id];
      const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
      if (fullName !== undefined) set("full_name", String(fullName).trim());
      if (b.email !== undefined) set("email", b.email);
      if (b.phone !== undefined) set("phone", b.phone);
      if (sets.length === 0 && !scope && experience === undefined) throw new HttpError(400, "No editable fields provided.");

      if (sets.length > 0) {
        params.push(actor.id);
        await client.query(
          `UPDATE users SET ${sets.join(", ")}, updated_by = $${params.length}, updated_at = now() WHERE id = $1`, params);
      }
      if (scope) await writeScope(client, id, scope, actor.id);
      await saveEngineerExperience(client, id, experience);

      const out = await client.query(`SELECT id, full_name, email, phone FROM users WHERE id = $1`, [id]);
      return { ...out.rows[0], ...(scope ? { scope: scope.values } : {}) };
    });
    return sendOk(res, "Account updated.", 1, data);
  } catch (error) {
    return fail(res, error);
  }
};

// PATCH /accounts/:id/status   body: { status, reason? }   (reason has no column, so it is not stored)
export const updateAccountStatus = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ["admin"]);
    if (!actor) return;
    const { id } = req.params;
    const { status } = req.body || {};
    const reason=archiveNote(req.body?.reason);
    if (!isUuid(id)) return sendError(res, "Invalid account id.", 400);
    if (!STATUSES.includes(status)) return sendError(res, `status must be one of: ${STATUSES.join(", ")}.`, 400);
    if (id === actor.id) return sendError(res, "You cannot change your own status.", 422);

    const data = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE users SET status = $2, updated_by = $3, updated_at = now()
          WHERE id = $1 AND COALESCE(is_deleted, false) = false
          RETURNING id, status`, [id, status, actor.id]);
      if (updated.rowCount === 0) throw new HttpError(404, "Account not found.");
      // Anyone who is no longer active is signed out immediately.
      if (status !== "active") await client.query(`DELETE FROM users_token WHERE user_id = $1`, [id]);
      await recordArchiveEvent(client,actor.id,"users",id,"account_status_changed",{status,reason});
      return updated.rows[0];
    });
    return sendOk(res, "Account status updated.", 1, data);
  } catch (error) {
    return fail(res, error);
  }
};

// POST /accounts/:id/regenerate-password
export const regeneratePassword = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ["admin"]);
    if (!actor) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid account id.", 400);

    const data = await withTransaction(async (client) => {
      const admin = (await client.query("select password_hash from users where id=$1", [actor.id])).rows[0];
      if (typeof req.body?.adminPassword !== "string" || !(await bcrypt.compare(req.body.adminPassword, admin.password_hash))) throw new HttpError(403, "Administrator password is incorrect.");
      const target = (await client.query("select u.full_name,m.metadata->>'lastName' as last_name from users u left join workspace_account_metadata m on m.user_id=u.id where u.id=$1 and not coalesce(u.is_deleted,false) for update of u", [id])).rows[0];
      if (!target) throw new HttpError(404, "Account not found.");
      const resetMeta = (await client.query("select metadata from workspace_account_metadata where user_id=$1",[id])).rows[0]?.metadata || {};
      if(req.body?.requestedAt !== undefined && resetMeta.passwordResetRequestedAt !== req.body.requestedAt) {
        const done = (resetMeta.passwordResetHistory || []).find(h => h.requestedAt === req.body.requestedAt);
        const doneBy = done && (await client.query("select full_name from users where id=$1", [done.completedBy])).rows[0]?.full_name;
        throw new HttpError(409, done
          ? `This reset was already completed${doneBy ? ` by ${doneBy}` : ""} on ${new Date(done.completedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}. Refresh the requests.`
          : "This reset request has changed or was already completed. Refresh the requests.");
      }
      const held = activeClaim(resetMeta);
      if (held && held.by !== actor.id) throw new HttpError(409, `${held.byName} is handling this request. It reopens to every administrator when their hold runs out.`);
      const tempPassword = makeTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      const updated = await client.query(
        `UPDATE users SET password_hash = $2, temp_password_issued = true, updated_by = $3, updated_at = now()
          WHERE id = $1 AND COALESCE(is_deleted, false) = false RETURNING id`, [id, passwordHash, actor.id]);
      if (updated.rowCount === 0) throw new HttpError(404, "Account not found.");
      await client.query(`DELETE FROM users_token WHERE user_id = $1`, [id]); // old sessions stop working
      const history = [...(resetMeta.passwordResetHistory || [])];
      if(resetMeta.passwordResetRequestedAt) history.push({requestedAt:resetMeta.passwordResetRequestedAt,completedAt:new Date().toISOString(),completedBy:actor.id});
      await client.query("update workspace_account_metadata set metadata=(metadata - 'passwordResetRequestedAt' - 'passwordResetReadBy' - 'passwordResetClaim' - 'passwordResetRemindedAt')||jsonb_build_object('passwordResetHistory',$2::jsonb) where user_id=$1", [id,JSON.stringify(history.slice(-20))]);
      return { id, temp_password: tempPassword };
    });
    return sendOk(res, "Temporary password issued.", 1, data);
  } catch (error) {
    return fail(res, error);
  }
};

/* ------------------------------ licenses ------------------------------ */

const LICENSE_DIR = "./uploads/licenses";
const ALLOWED_TYPES = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png" };

// Own multer instance: random file names and a type/size whitelist. The shared upload.utility.js
// builds the folder name from req.body.doc_type, which a caller can use to write outside uploads/.
const licenseUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(LICENSE_DIR, { recursive: true }); cb(null, LICENSE_DIR); },
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + ALLOWED_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED_TYPES[file.mimetype] ? cb(null, true) : cb(new Error("Only PDF, JPG or PNG files are allowed.")),
});

/** Route middleware: parses multipart, turning upload errors into 400 responses. */
export const uploadLicenseFile = (req, res, next) =>
  licenseUpload.single("file")(req, res, (error) => (error ? sendError(res, error.message, 400) : next()));

// GET /accounts/:id/licenses  (full history, newest first)
export const getLicenses = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid account id.", 400);
    const caller = await requireSelfOrAdmin(req, res, id);
    if (!caller) return;

    const exists = await execute(`SELECT 1 FROM users WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [id]);
    if (exists.rowCount === 0) return sendError(res, "Account not found.", 404);

    const result = await execute(
      `SELECT id, license_number, license_expiry::text AS license_expiry, upload_status, superseded_at, created_at
         FROM user_licenses WHERE user_id = $1 ORDER BY created_at DESC, id DESC`, [id]);
    return sendOk(res, "Resources retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return fail(res, error);
  }
};

// POST /accounts/:id/licenses   multipart: license_number, license_expiry, file?
export const addLicense = async (req, res) => {
  const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const { id } = req.params;
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return cleanup();
    if (!isUuid(id)) { cleanup(); return sendError(res, "Invalid account id.", 400); }

    const data = await withTransaction(db => createRenewalRequest(db,user,{...req.body,user_id:id},req.file));
    return sendOk(res,"Credential saved and verified.",1,data,201);
  } catch (error) {
    cleanup();
    return fail(res, error);
  }
};

/* ---------------------------- certifications ---------------------------- */

// PUT /accounts/:id/certifications   body: { certification_type_codes: [] }
export const replaceCertifications = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ["admin"]);
    if (!actor) return;
    const { id } = req.params;
    const codes = pick(req.body || {}, "certification_type_codes", "certificationTypeCodes");
    if (!isUuid(id)) return sendError(res, "Invalid account id.", 400);
    if (!Array.isArray(codes) || codes.some((c) => typeof c !== "string")) {
      return sendError(res, "certification_type_codes must be an array of strings.", 400);
    }

    const data = await withTransaction(async (client) => {
      const exists = await client.query(`SELECT 1 FROM users WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [id]);
      if (exists.rowCount === 0) throw new HttpError(404, "Account not found.");

      const unique = [...new Set(codes)];
      const types = await client.query(`SELECT id, code FROM certification_types WHERE code = ANY($1::text[])`, [unique]);
      const unknown = unique.filter((c) => !types.rows.some((t) => t.code === c));
      if (unknown.length > 0) throw new HttpError(400, `Unknown certification code(s): ${unknown.join(", ")}`);

      await client.query(`DELETE FROM user_certifications WHERE user_id = $1`, [id]);
      for (const t of types.rows) {
        await client.query(
          `INSERT INTO user_certifications (user_id, certification_type_id, created_by, updated_by) VALUES ($1, $2, $3, $3)`,
          [id, t.id, actor.id]);
      }
      return { user_id: id, certifications: types.rows.map((t) => t.code).sort() };
    });
    return sendOk(res, "Certifications replaced.", 1, data);
  } catch (error) {
    return fail(res, error);
  }
};

/* ---------------------------- license alerts ---------------------------- */

// GET /accounts/license-alerts?days=30
// Active OPM/SPM accounts whose current license is missing, expired, expiring within `days`, or not uploaded.
export const getLicenseAlerts = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));

    const result = await execute(
      `SELECT user_id, full_name, role, license_expiry, upload_status, alert_level
         FROM (
           SELECT u.id AS user_id, u.full_name, r.code AS role,
                  l.license_expiry::text AS license_expiry, l.upload_status,
                  CASE
                    WHEN l.id IS NULL THEN 'missing'
                    WHEN l.license_expiry < CURRENT_DATE THEN 'expired'
                    WHEN l.license_expiry <= CURRENT_DATE + $1::int THEN 'expiring'
                    WHEN l.upload_status <> 'uploaded' THEN 'pending_upload'
                  END AS alert_level
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN LATERAL (
               SELECT x.* FROM user_licenses x
                WHERE x.user_id = u.id AND x.superseded_at IS NULL
                ORDER BY x.created_at DESC LIMIT 1) l ON true
            WHERE r.code IN ('opm', 'spm')
              AND u.status <> 'suspended'
              AND COALESCE(u.is_deleted, false) = false
         ) a
        WHERE alert_level IS NOT NULL
        ORDER BY CASE alert_level WHEN 'missing' THEN 1 WHEN 'expired' THEN 2 WHEN 'expiring' THEN 3 ELSE 4 END,
                 license_expiry NULLS FIRST, full_name`, [days]);
    return sendOk(res, "Resources retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return fail(res, error);
  }
};
