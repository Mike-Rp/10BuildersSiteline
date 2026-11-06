import { randomBytes, randomUUID, createHash } from "node:crypto"
import bcrypt from "bcryptjs"
import {
  HttpError,
  requireUser,
  sendOk,
  handleError,
} from "../../common/utilities/access.utility.js"
import { withTransaction } from "../../common/utilities/transaction.utility.js"
import { recordArchiveEvent } from "../archive/audit.utility.js"
import {
  createNotification,
  notificationsReady,
  resolveNotifications,
} from "../notifications/notification.utility.js"

const digest = (value) => createHash("sha256").update(value).digest("hex")
const unavailable = () =>
  new HttpError(
    503,
    "Account recovery is not configured. Contact the authorized system maintainer.",
  )
const invalid = () =>
  new HttpError(
    401,
    "The recovery details are invalid, expired, or already used.",
  )
async function ready(db) {
  if (
    !(
      await db.query(
        "select to_regclass('public.admin_recovery_codes') is not null as ready",
      )
    ).rows[0].ready
  )
    throw unavailable()
}
function password(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    Buffer.byteLength(value, "utf8") > 72
  )
    throw new HttpError(
      422,
      "Use at least 8 characters and no more than 72 UTF-8 bytes for your password.",
    )
}
function currentPassword(value) {
  if (
    typeof value !== "string" ||
    !value ||
    Buffer.byteLength(value, "utf8") > 72
  )
    throw new HttpError(422, "Enter your current password.")
}
const normalizeCode = (code) =>
  typeof code === "string" ? code.replace(/[\s-]/g, "").toUpperCase() : ""
function requestToken(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim()
}
async function lockedAdmin(db, actor, req) {
  const user = (
    await db.query(
      `select u.* from users u join roles r on r.id=u.role_id where u.id=$1 and r.code='admin' and u.status='active' and not coalesce(u.is_deleted,false) for update of u`,
      [actor.id],
    )
  ).rows[0]
  if (
    !user ||
    (
      await db.query(
        "select 1 from users_token where user_id=$1 and token=$2",
        [actor.id, requestToken(req)],
      )
    ).rowCount !== 1
  )
    throw new HttpError(401, "Your session has ended. Sign in again.")
  return user
}
// Separate committed transaction: failed verification cannot roll back its attempt count.
async function throttle(req, kind, identity = "") {
  await withTransaction(async (db) => {
    await ready(db)
    const keys = [
      { key: kind + ":ip:" + digest(String(req.ip || "unknown")), limit: 30 },
      ...(identity
        ? [{ key: kind + ":account:" + digest(identity), limit: 8 }]
        : []),
    ].sort((a, b) => a.key.localeCompare(b.key))
    for (const { key, limit } of keys) {
      const row = (
        await db.query(
          `insert into admin_recovery_attempts(bucket,attempts) values($1,1)
     on conflict(bucket) do update set attempts=case when admin_recovery_attempts.window_started_at<=now()-interval '15 minutes' then 1 else admin_recovery_attempts.attempts+1 end,
     window_started_at=case when admin_recovery_attempts.window_started_at<=now()-interval '15 minutes' then now() else admin_recovery_attempts.window_started_at end returning attempts`,
          [key],
        )
      ).rows[0]
      if (row.attempts > limit)
        throw new HttpError(
          429,
          "Too many recovery attempts. Try again in 15 minutes.",
        )
    }
    await db.query(
      "delete from admin_recovery_attempts where window_started_at<now()-interval '1 day'",
    )
    await db.query(
      "delete from admin_recovery_challenges where expires_at<=now()",
    )
  })
}
const handler = (fn) => async (req, res) => {
  res.set("Cache-Control", "private, no-store")
  try {
    await fn(req, res)
  } catch (e) {
    if (e.status === 429) res.set("Retry-After", "900")
    return handleError(res, e)
  }
}

export const recoverySummary = handler(async (req, res) => {
  const actor = await requireUser(req, res, ["admin"])
  if (!actor) return
  const data = await withTransaction(async (db) => {
    await ready(db)
    const set = (
      await db.query(
        "select id,created_at,refresh_required from admin_recovery_sets where user_id=$1 and revoked_at is null",
        [actor.id],
      )
    ).rows[0]
    const rows = set
      ? (
          await db.query(
            "select position,used_at from admin_recovery_codes where set_id=$1 order by position",
            [set.id],
          )
        ).rows
      : []
    return {
      configured: !!set,
      generatedAt: set?.created_at,
      refreshRequired: set?.refresh_required || false,
      remaining: rows.filter((r) => !r.used_at).length,
      used: rows.filter((r) => r.used_at).length,
      codes: rows.map((r) => ({
        number: r.position,
        state: r.used_at ? "used" : "available",
        usedAt: r.used_at,
      })),
    }
  })
  return sendOk(res, "Recovery code status.", 1, data)
})
export const generateRecoveryCodes = handler(async (req, res) => {
  const actor = await requireUser(req, res, ["admin"])
  if (!actor) return
  currentPassword(req.body?.currentPassword)
  await throttle(req, "manage", actor.id)
  const data = await withTransaction(async (db) => {
    await ready(db)
    const user = await lockedAdmin(db, actor, req)
    if (!(await bcrypt.compare(req.body.currentPassword, user.password_hash)))
      throw new HttpError(422, "Current password is incorrect.")
    if (user.temp_password_issued)
      throw new HttpError(
        409,
        "Choose your own password before generating recovery codes.",
      )
    await db.query(
      "delete from admin_recovery_challenges where code_id in(select c.id from admin_recovery_codes c join admin_recovery_sets s on s.id=c.set_id where s.user_id=$1)",
      [actor.id],
    )
    await db.query(
      "update admin_recovery_sets set revoked_at=now() where user_id=$1 and revoked_at is null",
      [actor.id],
    )
    const setId = randomUUID()
    await db.query(
      "insert into admin_recovery_sets(id,user_id) values($1,$2)",
      [setId, actor.id],
    )
    const codes = []
    for (let number = 1; number <= 5; number++) {
      const secret = randomBytes(16).toString("hex").toUpperCase()
      await db.query(
        "insert into admin_recovery_codes(id,set_id,position,code_hash) values($1,$2,$3,$4)",
        [randomUUID(), setId, number, digest(secret)],
      )
      codes.push({ number, code: secret.match(/.{8}/g).join("-") })
    }
    await resolveNotifications(db, {
      subjectType: "admin_recovery",
      subjectId: actor.id,
      reason: "A replacement recovery-code set was generated.",
    })
    await recordArchiveEvent(
      db,
      actor.id,
      "admin_recovery_sets",
      setId,
      "recovery_codes_generated",
      { user_id: actor.id, count: 5 },
    )
    return { codes }
  })
  return sendOk(res, "Shown once. Save these codes securely.", 1, data, 201)
})
export const verifyRecoveryCode = handler(async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : ""
  const code = normalizeCode(req.body?.code)
  await throttle(req, "verify", email.slice(0, 254))
  if (!email || email.length > 254 || !/^[A-F0-9]{32}$/.test(code))
    throw invalid()
  const data = await withTransaction(async (db) => {
    const user = (
      await db.query(
        "select u.id from users u join roles r on r.id=u.role_id where lower(u.email::text)=$1 and r.code='admin' and u.status='active' and not coalesce(u.is_deleted,false) for update of u",
        [email],
      )
    ).rows[0]
    const row = (
      await db.query(
        `select c.id from admin_recovery_codes c join admin_recovery_sets s on s.id=c.set_id where s.user_id=$1 and s.revoked_at is null and c.used_at is null and c.code_hash=$2 for update of c`,
        [user?.id || null, digest(code)],
      )
    ).rows[0]
    if (!row) throw invalid()
    const token = randomBytes(32).toString("hex")
    await db.query(
      "insert into admin_recovery_challenges(token_hash,code_id,expires_at) values($1,$2,now()+interval '5 minutes')",
      [digest(token), row.id],
    )
    return { resetToken: token, expiresInSeconds: 300 }
  })
  return sendOk(res, "Code verified. Choose a new password.", 1, data)
})
export const resetWithRecoveryCode = handler(async (req, res) => {
  await throttle(req, "reset")
  password(req.body?.password)
  const token = req.body?.resetToken
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw invalid()
  const data = await withTransaction(async (db) => {
    const reference = (
      await db.query(
        `select s.user_id from admin_recovery_challenges t join admin_recovery_codes c on c.id=t.code_id join admin_recovery_sets s on s.id=c.set_id where t.token_hash=$1`,
        [digest(token)],
      )
    ).rows[0]
    if (!reference) throw invalid()
    const user = (
      await db.query(
        "select u.id from users u join roles r on r.id=u.role_id where u.id=$1 and r.code='admin' and u.status='active' and not coalesce(u.is_deleted,false) for update of u",
        [reference.user_id],
      )
    ).rows[0]
    const code = (
      await db.query(
        `select c.id,c.set_id from admin_recovery_challenges t join admin_recovery_codes c on c.id=t.code_id join admin_recovery_sets s on s.id=c.set_id where t.token_hash=$1 and t.expires_at>now() and c.used_at is null and s.revoked_at is null and s.user_id=$2 for update of c`,
        [digest(token), user?.id || null],
      )
    ).rows[0]
    if (!code) throw invalid()
    const hashed = await bcrypt.hash(req.body.password, 12)
    await db.query(
      "update users set password_hash=$2,temp_password_issued=false,updated_by=$1,updated_at=now() where id=$1",
      [user.id, hashed],
    )
    await db.query(
      "update admin_recovery_codes set used_at=now() where id=$1",
      [code.id],
    )
    await db.query(
      "update admin_recovery_sets set refresh_required=true where id=$1",
      [code.set_id],
    )
    await db.query("delete from users_token where user_id=$1", [user.id])
    await db.query(
      "delete from admin_recovery_challenges where code_id in(select c.id from admin_recovery_codes c join admin_recovery_sets s on s.id=c.set_id where s.user_id=$1)",
      [user.id],
    )
    if (await notificationsReady(db))
      await createNotification(db, {
        recipientId: user.id,
        type: "notice",
        title: "A recovery code was used",
        message:
          "Generate a new set and store it securely. Open My profile → Recovery codes.",
        subjectType: "admin_recovery",
        subjectId: user.id,
        priority: "urgent",
      })
    await recordArchiveEvent(
      db,
      user.id,
      "admin_recovery_codes",
      code.id,
      "recovery_code_used",
      { user_id: user.id, set_id: code.set_id, sessions_invalidated: true },
    )
    return { reset: true }
  })
  return sendOk(res, "Password reset. Sign in with your new password.", 1, data)
})
export const changeAdminPassword = handler(async (req, res) => {
  const actor = await requireUser(req, res, ["admin"])
  if (!actor) return
  currentPassword(req.body?.currentPassword)
  password(req.body?.password)
  await throttle(req, "change", actor.id)
  await withTransaction(async (db) => {
    const user = await lockedAdmin(db, actor, req)
    if (!(await bcrypt.compare(req.body.currentPassword, user.password_hash)))
      throw new HttpError(422, "Current password is incorrect.")
    if (await bcrypt.compare(req.body.password, user.password_hash))
      throw new HttpError(
        422,
        "Choose a password different from your current password.",
      )
    const hash = await bcrypt.hash(req.body.password, 12)
    await db.query(
      "update users set password_hash=$2,temp_password_issued=false,updated_by=$1,updated_at=now() where id=$1",
      [actor.id, hash],
    )
    await db.query("delete from users_token where user_id=$1", [actor.id])
    await db.query(
      "delete from admin_recovery_challenges where code_id in(select c.id from admin_recovery_codes c join admin_recovery_sets s on s.id=c.set_id where s.user_id=$1)",
      [actor.id],
    )
    await recordArchiveEvent(
      db,
      actor.id,
      "users",
      actor.id,
      "admin_password_changed",
      { sessions_invalidated: true },
    )
  })
  return sendOk(res, "Password changed. Sign in again.", 1, { changed: true })
})
