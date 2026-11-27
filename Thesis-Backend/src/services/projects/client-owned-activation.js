import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { HttpError, handleError, requireUser, sendOk, isUuid } from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { clientEmailError } from "../../domain/client-email.js";
import { employeeIdFromWorkEmail } from "../../domain/work-email.js";

// Staged local implementation: neither production enablement nor legacy-account
// conversion is implicit in installing the migration.
export const clientOwnedEnabled = () => process.env.CLIENT_OWNED_ACTIVATION === "true" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
const hash = value => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(18).toString("base64url");
const validToken = value => typeof value === "string" && /^[A-Za-z0-9_-]{24}$/.test(value);
const equalToken = (value, stored) => validToken(value) && /^[a-f0-9]{64}$/.test(stored || "") && timingSafeEqual(Buffer.from(hash(value), "hex"), Buffer.from(stored, "hex"));
const emailValue = value => typeof value === "string" && !clientEmailError(value.trim().toLowerCase()) && !employeeIdFromWorkEmail(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null;
const invalid = () => new HttpError(401, "Invalid or unavailable activation code.", "ACTIVATION_CODE_INVALID");
function enabled() { if (!clientOwnedEnabled()) throw new HttpError(503, "Client-owned registration is not enabled locally."); }
async function schema(db) {
  const result = await db.query("select to_regclass('public.client_portal_invitations') is not null and to_regclass('public.client_portal_verifications') is not null as ready");
  if (!result.rows[0]?.ready) throw new HttpError(503, "Client registration requires migration 044. Ask the administrator to complete local setup.");
}
export async function createClientInvitation(db, projectId, details, actorId) {
  await schema(db);
  const contact = emailValue(details.email);
  if (!contact) return "verification_required";
  await db.query(`INSERT INTO client_portal_invitations(id,project_id,contact_email,client_name,created_by)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id) DO NOTHING`,
    [randomUUID(), projectId, contact, details.primary_contact || details.client_name, actorId]);
  return "pending_activation";
}
async function invitation(db, code) {
  code = typeof code === "string" ? code.trim() : code;
  if (!validToken(code)) throw invalid();
  const row = (await db.query(`SELECT i.* FROM client_portal_invitations i JOIN projects p ON p.id=i.project_id
    WHERE i.code_hash=$1 AND p.lifecycle_status='active' AND NOT coalesce(p.is_deleted,false) FOR UPDATE OF i`, [hash(code)])).rows[0];
  if (!row || !row.recipient_verified_at) throw invalid();
  if (row.redeemed_at) throw new HttpError(409, "This activation code has already been used. Sign in to your account.", "ACTIVATION_CODE_USED");
  if (!(new Date(row.expires_at).getTime() > Date.now())) throw new HttpError(403, "This activation code has expired. Request a new code.", "ACTIVATION_CODE_EXPIRED");
  return row;
}
export async function issueOwnedCode(db, projectId, actor, verified) {
  await schema(db);
  if (verified !== true) throw new HttpError(422, "Verify the intended client's identity before issuing an activation code.");
  const p = (await db.query(`SELECT id,inquiry_intake FROM projects WHERE id=$1 AND suggested_opm_id=$2
    AND lifecycle_status='active' AND NOT coalesce(is_deleted,false) FOR UPDATE`, [projectId, actor.id])).rows[0];
  if (!p) throw new HttpError(403, "Only the assigned Office PM can issue an invitation after the project is active.");
  await createClientInvitation(db, projectId, p.inquiry_intake || {}, actor.id);
  const row = (await db.query("SELECT * FROM client_portal_invitations WHERE project_id=$1 FOR UPDATE", [projectId])).rows[0];
  if (!row || row.redeemed_at) throw new HttpError(409, "This invitation is unavailable or already redeemed.");
  const code = token(), expires = new Date(Date.now() + 24 * 3600000).toISOString();
  await db.query(`UPDATE client_portal_invitations SET code_hash=$2,expires_at=$3,recipient_verified_by=$4,recipient_verified_at=now() WHERE id=$1`, [row.id, hash(code), expires, actor.id]);
  await db.query("DELETE FROM client_portal_verifications WHERE invitation_id=$1 AND completed_at IS NULL", [row.id]);
  return { code, expires_at: expires, contact_email: row.contact_email, mode: "client_owned" };
}

export const ownedActivationConfig = (_req, res) => {
  res.set("Cache-Control", "private, no-store");
  return sendOk(res, "Activation configuration.", 1, { client_owned: clientOwnedEnabled(), local_capture: false });
};

export const beginOwnedActivation = async (req, res) => {
  try {
    enabled();
    const actor = req.body?.existing_account === true ? await requireUser(req, res, ["client"]) : null;
    if (req.body?.existing_account === true && !actor) return;
    const email = actor ? null : emailValue(req.body?.email);
    const password = req.body?.password;
    if (!actor && (!email || typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72 || password !== req.body?.confirmation))
      throw new HttpError(422, "Enter a valid email, a password of 8 characters or more (maximum 72 UTF-8 bytes), and matching confirmation.");
    const result = await withTransaction(async db => {
      await schema(db);
      const invite = await invitation(db, req.body?.code);
      const recent = (await db.query("SELECT count(*)::int AS n FROM client_portal_verifications WHERE invitation_id=$1 AND created_at>now()-interval '1 hour'", [invite.id])).rows[0].n;
      if (recent >= 5) throw new HttpError(429, "Too many verification requests. Try again later.");
      let loginEmail = email;
      if (actor) {
        const account = (await db.query("SELECT email FROM users WHERE id=$1 AND status='active' AND NOT coalesce(is_deleted,false)", [actor.id])).rows[0];
        if (!account) throw new HttpError(403, "Sign in with an active client account.");
        loginEmail = account.email.toLowerCase();
      } else if ((await db.query("SELECT 1 FROM users WHERE lower(email::text)=$1", [email])).rowCount)
        throw new HttpError(409, "This email is unavailable for registration. If it is yours, sign in and redeem the invitation.", "CLIENT_EMAIL_UNAVAILABLE");
      const id = randomUUID(), recipientCode = token(), emailCode = loginEmail === invite.contact_email ? recipientCode : token();
      const expires = new Date(Math.min(Date.now() + 15 * 60000, new Date(invite.expires_at).getTime())).toISOString();
      await db.query(`INSERT INTO client_portal_verifications(id,invitation_id,login_email,password_hash,existing_user_id,recipient_hash,email_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, invite.id, loginEmail, actor ? null : await bcrypt.hash(password, 12), actor?.id ?? null, hash(recipientCode), hash(emailCode), expires]);
      await db.query("UPDATE client_portal_verifications SET delivery_ready=true WHERE id=$1", [id]);
      return { verification_id: id, recipient_code: recipientCode, email_code: emailCode };
    });
    res.set("Cache-Control", "private, no-store");
    return completeOwnedActivation({ ...req, body: { ...req.body, ...result } }, res);
  } catch (error) { return handleError(res, error); }
};

export const completeOwnedActivation = async (req, res) => {
  try {
    enabled();
    if (!isUuid(req.body?.verification_id)) throw invalid();
    const actor = req.body?.existing_account === true ? await requireUser(req, res, ["client"]) : null;
    if (req.body?.existing_account === true && !actor) return;
    const result = await withTransaction(async db => {
      await schema(db);
      // Always lock invitation before challenge, matching issuance and start.
      const pointer = (await db.query("SELECT invitation_id FROM client_portal_verifications WHERE id=$1", [req.body.verification_id])).rows[0];
      if (!pointer) throw invalid();
      const invite = await invitation(db, req.body?.code);
      if (invite.id !== pointer.invitation_id) throw invalid();
      const row = (await db.query("SELECT * FROM client_portal_verifications WHERE id=$1 FOR UPDATE", [req.body.verification_id])).rows[0];
      if (!row.delivery_ready || row.completed_at || row.attempts >= 5 || !(new Date(row.expires_at).getTime() > Date.now()))
        throw new HttpError(403, "Verification expired or unavailable. Start again.", "VERIFICATION_EXPIRED");
      if (row.existing_user_id && row.existing_user_id !== actor?.id) throw new HttpError(403, "Sign in with the client account that started verification.");
      if (!equalToken(typeof req.body?.recipient_code === "string" ? req.body.recipient_code.trim() : "", row.recipient_hash) || !equalToken(typeof req.body?.email_code === "string" ? req.body.email_code.trim() : "", row.email_hash)) {
        await db.query("UPDATE client_portal_verifications SET attempts=attempts+1 WHERE id=$1", [row.id]);
        return { invalid: true }; // Commit failed-attempt counter instead of rolling it back.
      }
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`client-email:${row.login_email}`]);
      let userId = row.existing_user_id;
      if (userId) {
        const account = (await db.query("SELECT id FROM users WHERE id=$1 AND lower(email::text)=$2 AND status='active' AND NOT coalesce(is_deleted,false) FOR UPDATE", [userId, row.login_email])).rows[0];
        if (!account) throw new HttpError(409, "The client account changed. Start verification again.");
      } else {
        if ((await db.query("SELECT 1 FROM users WHERE lower(email::text)=$1", [row.login_email])).rowCount)
          throw new HttpError(409, "This email is already registered. Sign in to link the project.", "CLIENT_EMAIL_UNAVAILABLE");
        userId = randomUUID();
        await db.query(`INSERT INTO users(id,full_name,email,password_hash,temp_password_issued,role_id,status,created_by,updated_by)
          SELECT $1,$2,$3,$4,false,id,'active',$1,$1 FROM roles WHERE code='client'`, [userId, invite.client_name, row.login_email, row.password_hash]);
        await db.query(`INSERT INTO workspace_account_metadata(user_id,metadata) VALUES($1,$2::jsonb)`,
          [userId, JSON.stringify({ clientContactEmail: invite.contact_email, clientCredentialsCreatedAt: new Date().toISOString() })]);
      }
      await db.query("INSERT INTO user_client_project_links(user_id,project_id,created_by,updated_by) VALUES($1,$2,$1,$1) ON CONFLICT(user_id,project_id) DO NOTHING", [userId, invite.project_id]);
      await db.query("UPDATE client_portal_invitations SET redeemed_by=$2,redeemed_at=now() WHERE id=$1", [invite.id, userId]);
      await db.query("UPDATE client_portal_verifications SET completed_at=now(),password_hash=NULL,existing_user_id=$2 WHERE id=$1", [row.id, userId]);
      return { status: actor ? "linked" : "active" };
    });
    if (result.invalid) throw new HttpError(401, "The verification codes do not match. Check both codes.", "VERIFICATION_CODE_INVALID");
    res.set("Cache-Control", "private, no-store");
    return sendOk(res, "Client account and project access verified.", 1, result);
  } catch (error) { return handleError(res, error); }
};
