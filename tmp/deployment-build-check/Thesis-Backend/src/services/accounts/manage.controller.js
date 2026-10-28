import { archiveNote,recordArchiveEvent } from "../archive/audit.utility.js";
import { clientEmailError } from "../../domain/client-email.js";
import crypto from "crypto";
import { accountListQuery } from "./account-list.utility.js";
import { validateEngineerExperience, saveEngineerExperience } from "./experience.utility.js";
import fs from "fs";
import multer from "multer";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { sweepLicenses } from "./license-sweep.utility.js";
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
    const ids = await lookupIds(client, "disciplines", values);
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
  const fullName = body.full_name ?? body.fullName ?? body.contact_person;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : body.email;
  const phone = body.phone ?? body.contact_number ?? null;
  const role = body.role;
  if (role === "client" && clientEmailError(email)) throw new HttpError(400, clientEmailError(email));
  if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length>150) throw new HttpError(400,"full_name is required (max 150 characters).");
  if (typeof email !== "string" || email.length>254 || !EMAIL_RE.test(email)) throw new HttpError(400,"A valid email is required.");
  if (phone!==null && (typeof phone!=="string" || (phone !== "" && !/^\d{11}$/.test(phone)))) throw new HttpError(400,"Contact number must contain exactly 11 digits.");
  if (!["admin","opm","spm","client"].includes(role)) throw new HttpError(400,"Invalid role.");
  const scope = normalizeScope(role,body.scope);
  const experience = validateEngineerExperience(body.experience_by_type, role);
  const password = body.password ?? makeTempPassword();
  if (typeof password!=="string" || password.length<8 || Buffer.byteLength(password,"utf8")>72) throw new HttpError(400,"Temporary password must be at least 8 characters and at most 72 UTF-8 bytes.");
  const roleRow = await client.query("SELECT id FROM roles WHERE code=$1",[role]);
  if (!roleRow.rowCount) throw new HttpError(400,"Role is not configured.");
  const hash = await bcrypt.hash(password,12);
  // The unique email covers deactivated accounts too: a company email is never reused.
  const inserted = await client.query(
    `INSERT INTO users (id,full_name,email,phone,password_hash,temp_password_issued,role_id,status,created_by,updated_by)
     VALUES ($1,$2,$3,$4,$5,true,$6,'invited',$7,$7)
     RETURNING id,full_name,email,phone,status,date_added::text AS date_added`,
    [uuidv4(),fullName.trim(),email,phone?.trim() || null,hash,roleRow.rows[0].id,actor.id])
    .catch((error) => { throw error.code === "23505" ? new HttpError(409,"This email is already assigned to another account.") : error; });
  if (scope) await writeScope(client,inserted.rows[0].id,scope,actor.id);
  await saveEngineerExperience(client, inserted.rows[0].id, experience);
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
      execute(`SELECT id, license_number, license_expiry::text AS license_expiry, upload_status,upload_file_ref
                 FROM user_licenses WHERE user_id = $1 AND superseded_at IS NULL
                ORDER BY created_at DESC LIMIT 1`, [id]),
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
        `SELECT u.id, r.code AS role FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1 AND COALESCE(u.is_deleted, false) = false FOR UPDATE OF u`, [id]);
      if (found.rowCount === 0) throw new HttpError(404, "Account not found.");
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
      const tempPassword = makeTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      const updated = await client.query(
        `UPDATE users SET password_hash = $2, temp_password_issued = true, updated_by = $3, updated_at = now()
          WHERE id = $1 AND COALESCE(is_deleted, false) = false RETURNING id`, [id, passwordHash, actor.id]);
      if (updated.rowCount === 0) throw new HttpError(404, "Account not found.");
      await client.query(`DELETE FROM users_token WHERE user_id = $1`, [id]); // old sessions stop working
      await client.query("update workspace_account_metadata set metadata=metadata - 'passwordResetRequestedAt' where user_id=$1", [id]);
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

    const b = req.body || {};
    const licenseNumber = pick(b, "license_number", "licenseNumber");
    const licenseExpiry = pick(b, "license_expiry", "licenseExpiry");
    if (!licenseNumber || !String(licenseNumber).trim()) { cleanup(); return sendError(res, "license_number is required.", 400); }
    if (!licenseExpiry || !/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiry) || Number.isNaN(Date.parse(licenseExpiry))) {
      cleanup(); return sendError(res, "license_expiry is required (YYYY-MM-DD).", 400);
    }

    const data = await withTransaction(async (client) => {
      const target = await client.query(
        `SELECT 1 FROM users WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [id]);
      if (target.rowCount === 0) throw new HttpError(404, "Account not found.");

      // Retire the current license only; older history keeps its original superseded_at.
      await client.query(
        `UPDATE user_licenses SET superseded_at = now(), updated_by = $2, updated_at = now()
          WHERE user_id = $1 AND superseded_at IS NULL`, [id, user.id]);

      const inserted = await client.query(
        `INSERT INTO user_licenses (user_id, license_number, license_expiry, upload_file_ref, upload_status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING id, user_id, license_number, license_expiry::text AS license_expiry, upload_status`,
        [id, String(licenseNumber).trim(), licenseExpiry, req.file ? req.file.path.replace(/\\/g, "/") : null, req.file ? "uploaded" : "pending", user.id]);
      await sweepLicenses(client, { userId: id });
      return inserted.rows[0];
    });
    return sendOk(res, "License saved.", 1, data, 201);
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
