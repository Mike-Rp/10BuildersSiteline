import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { HttpError, handleError, isUuid, requireUser, sendOk } from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { clientEmailError } from "../../domain/client-email.js";
import { employeeIdFromWorkEmail } from "../../domain/work-email.js";
import { isPhilippineMobile } from "../../domain/mobile-number.js";
import { clientOwnedEnabled, createClientInvitation, issueOwnedCode } from "./client-owned-activation.js";

export const CLIENT_ACTIVATION_PASSWORD_MARKER = "!client-activation-required";
const codeHash = code => createHash("sha256").update(code).digest("hex");
const invalidCode = () => new HttpError(401, "Invalid activation code or email.", "ACTIVATION_CODE_INVALID");

export function clientLoginEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return clientEmailError(email) || employeeIdFromWorkEmail(email) ? null : email;
}

export async function provisionInquiryClient(db, projectId, details, actorId) {
  if (clientOwnedEnabled()) {
    // Existing linked accounts are preserved; no automatic account conversion.
    if ((await db.query("SELECT 1 FROM user_client_project_links WHERE project_id=$1", [projectId])).rowCount) return "active";
    return createClientInvitation(db, projectId, details, actorId);
  }
  const email = clientLoginEmail(details.email);
  if (!email) return "verification_required";
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`client-email:${email}`]);
  if (details.client_record === "existing" && details.existing_client_source === "account" && details.existing_client_verified === "yes") {
    const existing = (await db.query(`SELECT u.id,u.status,u.password_hash FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.id=$1 AND lower(u.email::text)=$2 AND r.code='client' AND u.status IN ('active','invited')
      AND NOT coalesce(u.is_deleted,false) FOR UPDATE OF u`, [details.existing_client_id, email])).rows[0];
    if (!existing || (existing.status === "invited" && existing.password_hash !== CLIENT_ACTIVATION_PASSWORD_MARKER)) return "verification_required";
    await db.query(`INSERT INTO user_client_project_links(user_id,project_id,created_by,updated_by) VALUES($1,$2,$3,$3)
      ON CONFLICT(user_id,project_id) DO NOTHING`, [existing.id, projectId, actorId]);
    return existing.status === "active" ? "active" : existing.password_hash === CLIENT_ACTIVATION_PASSWORD_MARKER ? "pending_activation" : "verification_required";
  }
  const created = await db.query(`INSERT INTO users (full_name,email,phone,password_hash,temp_password_issued,role_id,status,created_by,updated_by)
    SELECT $1,$2,$3,$4,false,id,'invited',$5,$5 FROM roles WHERE code='client'
    ON CONFLICT DO NOTHING RETURNING id`,
  [details.primary_contact || details.client_name, email, isPhilippineMobile(details.phone) ? details.phone : null, CLIENT_ACTIVATION_PASSWORD_MARKER, actorId]);
  const account = created.rows[0];
  // An email match alone does not authorize access to another project's records.
  if (!account) return "verification_required";
  if (details.client_type) await db.query(`INSERT INTO workspace_account_metadata(user_id,metadata) VALUES($1,$2::jsonb)
    ON CONFLICT(user_id) DO UPDATE SET metadata=workspace_account_metadata.metadata||excluded.metadata`,
    [account.id, JSON.stringify({ clientProfile: { client_type: details.client_type, client_name: details.client_name,
      company_name: details.company_name || "", primary_contact: details.primary_contact || "", designation: details.designation || "" } })]);
  await db.query(`INSERT INTO user_client_project_links (user_id,project_id,created_by,updated_by)
    VALUES ($1,$2,$3,$3)`, [account.id, projectId, actorId]);
  return "pending_activation";
}

export const issueClientActivationCode = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ["opm"]);
    if (!actor) return;
    if (!isUuid(req.params.id)) throw new HttpError(404, "Project not found.");
    const data = await withTransaction(async db => {
      if (clientOwnedEnabled() && (await db.query("SELECT 1 FROM client_portal_invitations WHERE project_id=$1", [req.params.id])).rowCount)
        return issueOwnedCode(db, req.params.id, actor, req.body?.recipient_verified);
      const { rows: [account] } = await db.query(`SELECT u.id,u.email
        FROM projects p JOIN user_client_project_links l ON l.project_id=p.id
        JOIN users u ON u.id=l.user_id JOIN roles r ON r.id=u.role_id
        WHERE p.id=$1 AND p.suggested_opm_id=$2 AND p.lifecycle_status='active' AND NOT COALESCE(p.is_deleted,false)
          AND (SELECT count(*) FROM user_client_project_links WHERE project_id=p.id)=1
          AND r.code='client' AND u.status='invited' AND u.password_hash=$3
          AND NOT COALESCE(u.is_deleted,false) FOR UPDATE OF u`, [req.params.id, actor.id, CLIENT_ACTIVATION_PASSWORD_MARKER]);
      if (!account)
        throw new HttpError(409, "This project has no linked client account awaiting activation.");
      const code = randomBytes(18).toString("base64url");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const metadata = JSON.stringify({ clientActivation: { hash: codeHash(code), expiresAt } });
      await db.query(`INSERT INTO workspace_account_metadata(user_id,metadata) VALUES($1,$2::jsonb)
        ON CONFLICT(user_id) DO UPDATE SET metadata=workspace_account_metadata.metadata||excluded.metadata`, [account.id, metadata]);
      return { email: account.email, code, expires_at: expiresAt };
    });
    res.set("Cache-Control", "private, no-store");
    return sendOk(res, "Client activation code issued.", 1, data);
  } catch (error) { return handleError(res, error); }
};

export const activateClient = async (req, res) => {
  try {
    const email = clientLoginEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const password = req.body?.password;
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72)
      throw new HttpError(400, "Use at least 8 characters and no more than 72 UTF-8 bytes.");
    if (!email || !/^[A-Za-z0-9_-]{24}$/.test(code)) throw invalidCode();
    await withTransaction(async db => {
      const { rows: [account] } = await db.query(`SELECT u.id,u.status,u.password_hash
        FROM users u JOIN roles r ON r.id=u.role_id
        WHERE lower(u.email::text)=$1 AND r.code='client' AND NOT COALESCE(u.is_deleted,false) FOR UPDATE OF u`, [email]);
      if (!account || account.status !== "invited" || account.password_hash !== CLIENT_ACTIVATION_PASSWORD_MARKER) throw invalidCode();
      const { rows: [record] } = await db.query("SELECT metadata->'clientActivation' AS activation FROM workspace_account_metadata WHERE user_id=$1", [account.id]);
      const activation = record?.activation;
      if (!/^[a-f0-9]{64}$/.test(activation?.hash ?? "") ||
          !timingSafeEqual(Buffer.from(activation.hash, "hex"), Buffer.from(codeHash(code), "hex"))) throw invalidCode();
      if (!(Date.parse(activation.expiresAt) > Date.now()))
        throw new HttpError(403, "The activation code has expired.", "ACTIVATION_CODE_EXPIRED");
      const hash = await bcrypt.hash(password, 12);
      await db.query(`UPDATE users SET password_hash=$2,status='active',temp_password_issued=false,
        updated_by=id,updated_at=now() WHERE id=$1`, [account.id, hash]);
      await db.query("UPDATE workspace_account_metadata SET metadata=metadata-'clientActivation' WHERE user_id=$1", [account.id]);
    });
    res.set("Cache-Control", "private, no-store");
    return sendOk(res, "Client account activated.", 1, { status: "active" });
  } catch (error) { return handleError(res, error); }
};
