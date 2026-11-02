import { SUBMISSION_KIND_SQL } from "./submission-kind.utility.js";
import {
  ENGINEER_SPECIALIZATIONS,
  REQUIREMENT_SPECIALIZATIONS,
  qualifyingSpecializations,
  licenseNumberError,
  credentialEligible,
} from "../../domain/engineer-credentials.js"
import {
  HttpError,
  requireUser,
  isUuid,
  handleError,
  sendOk,
} from "../../common/utilities/access.utility.js"
import { localDay } from "../../common/utilities/license-status.utility.js"
import execute from "../../common/utilities/query.utility.js"
import { withTransaction } from "../../common/utilities/transaction.utility.js"
import { createRenewalRequest } from "./renewal.controller.js"

export async function credentialSummary(db, userId) {
  const account = (
    await db.query(
      "select u.id,u.status,r.code as role from users u join roles r on r.id=u.role_id where u.id=$1 and not coalesce(u.is_deleted,false)",
      [userId],
    )
  ).rows[0]
  if (!account) throw new HttpError(404, "Account not found.")
  const credentials = (
    await db.query(
      `select l.id,l.profession,l.license_number,l.license_expiry::text,l.upload_status,l.upload_file_ref,l.superseded_at,l.verification_status,l.verified_by,l.verified_at,l.verification_note,u.full_name as verified_by_name from user_licenses l left join users u on u.id=l.verified_by where l.user_id=$1 order by l.created_at desc,l.id desc`,
      [userId],
    )
  ).rows
  const specializations = (
    await db.query(
      "select e.specialization,e.recorded_at,u.full_name as recorded_by_name from engineer_specializations e join users u on u.id=e.recorded_by where e.user_id=$1 order by e.specialization",
      [userId],
    )
  ).rows
  const submissions = (
    await db.query(
      `select q.id,q.profession,q.license_number,q.license_expiry::text,q.status,${SUBMISSION_KIND_SQL} as submission_kind,q.submitted_at,q.reviewed_at,q.review_note,u.full_name as reviewed_by_name from license_renewal_requests q left join users u on u.id=q.reviewed_by where q.user_id=$1 order by q.id desc`,
      [userId],
    )
  ).rows
  const holds = (
    await db.query(
      "select metadata from workspace_account_metadata where user_id=$1",
      [userId],
    )
  ).rows[0]?.metadata
  const qualified = qualifyingSpecializations(
    credentials,
    specializations.map((s) => s.specialization),
    localDay(),
  )
  const requirements = Object.keys(REQUIREMENT_SPECIALIZATIONS).filter((r) =>
    REQUIREMENT_SPECIALIZATIONS[r].some((t) => qualified.includes(t)),
  )
  const valid = credentials.some((c) => credentialEligible(c, localDay()))
  const eligible =
    account.status === "active" &&
    !holds?.assignmentHold &&
    valid &&
    (account.role !== "spm" || qualified.length > 0)
  return {
    accountStatus: account.status,
    credentials: credentials.map((c) => ({
      ...c,
      upload_file_ref: undefined,
      expiryStatus: c.license_expiry < localDay() ? "Expired" : "Current",
      eligible: credentialEligible(c, localDay()),
      needsReview:
        !c.profession ||
        !!licenseNumberError(c.license_number) ||
        c.verification_status !== "verified",
    })),
    specializations,
    submissions,
    qualifiedRequirements: requirements,
    eligibleForNewAssignment: eligible,
    eligibilityNote: eligible
      ? "Credential requirements satisfied; assignment still requires matching scope, capacity and availability."
      : !valid
        ? "No verified credential outside the existing 30-day assignment restriction."
        : account.status !== "active"
          ? "Account is not active."
          : holds?.assignmentHold
            ? "An assignment hold is active."
            : "Record compatible specializations before assigning this Site PM.",
  }
}
export const getCredentials = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"])
    if (!user) return
    const id = req.params.userId
    if (!isUuid(id) || (user.role !== "admin" && id !== user.id))
      throw new HttpError(404, "Account not found.")
    return sendOk(
      res,
      "Credentials retrieved.",
      1,
      await credentialSummary({ query: execute }, id),
    )
  } catch (e) {
    return handleError(res, e)
  }
}
export async function saveSpecializations(db, userId, values, actorId) {
  if (
    !Array.isArray(values) ||
    values.length > 3 ||
    new Set(values).size !== values.length ||
    values.some((v) => !ENGINEER_SPECIALIZATIONS.includes(v))
  )
    throw new HttpError(
      400,
      "Choose up to three supported engineer specializations.",
    )
  await db.query("select id from users where id=$1 for update", [userId])
  await db.query("delete from engineer_specializations where user_id=$1", [
    userId,
  ])
  for (const value of values)
    await db.query(
      "insert into engineer_specializations(user_id,specialization,recorded_by) values($1,$2,$3)",
      [userId, value, actorId],
    )
  await db.query(
    "insert into engineer_specialization_history(user_id,specializations,recorded_by) values($1,$2,$3)",
    [userId, JSON.stringify(values), actorId],
  )
}
export const putSpecializations = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"])
    if (!user) return
    const id = req.params.userId
    if (!isUuid(id)) throw new HttpError(400, "Invalid account.")
    await withTransaction(async (db) => {
      const target = await db.query(
        "select 1 from users u join roles r on r.id=u.role_id where u.id=$1 and r.code in ('opm','spm') and not coalesce(u.is_deleted,false)",
        [id],
      )
      if (!target.rowCount) throw new HttpError(404, "Engineer not found.")
      await saveSpecializations(db, id, req.body?.specializations, user.id)
    })
    return sendOk(
      res,
      "Recorded specializations. This does not verify professional competence.",
      1,
      {},
    )
  } catch (e) {
    return handleError(res, e)
  }
}
// An explicit Administrator save verifies the selected legacy evidence and records attribution.
export const submitLegacyCredential = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"])
    if (!user) return
    if (!isUuid(req.params.id)) throw new HttpError(400, "Invalid credential.")
    const result = await withTransaction(async (db) => {
      const old = (
        await db.query("select * from user_licenses where id=$1", [
          req.params.id,
        ])
      ).rows[0]
      if (!old?.upload_file_ref)
        throw new HttpError(
          422,
          "Upload supporting evidence through the credential submission form.",
        )
      return createRenewalRequest(
        db,
        user,
        {
          user_id: old.user_id,
          replaces_license_id: old.id,
          profession: req.body?.profession,
          license_number: old.license_number,
          license_expiry: String(
            old.license_expiry instanceof Date
              ? old.license_expiry.toISOString()
              : old.license_expiry,
          ).slice(0, 10),
        },
        { path: old.upload_file_ref },
      )
    })
    return sendOk(res, "Legacy credential saved and verified.", 1, result, 201)
  } catch (e) {
    return handleError(res, e)
  }
}
