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
import {validateSpecializations,requireCredentialTags,specializationSummary} from './credential-specializations.utility.js';
import fs from 'node:fs';
import path from 'node:path';

export const credentialFile=async(req,res)=>{
 try {
  const user=await requireUser(req,res,['admin','opm','spm']);if(!user)return;
  if(!isUuid(req.params.id))throw new HttpError(404,'Document not found.');
  const row=(await execute('select user_id,upload_file_ref from user_licenses where id=$1',[req.params.id])).rows[0];
  if(!row?.upload_file_ref||(user.role!=='admin'&&user.id!==row.user_id))throw new HttpError(404,'Document not found.');
  if(row.upload_file_ref.startsWith('db:'))return res.redirect(307,'/api/v1/files/'+row.upload_file_ref.replace(/^db:(\/\/)?/,'')+'/content');
  const absolute=path.resolve(row.upload_file_ref),root=path.resolve('uploads');
  if(!absolute.startsWith(root+path.sep)||!fs.existsSync(absolute))throw new HttpError(404,'Document not found.');
  return res.download(absolute);
 } catch(error){return handleError(res,error);}
};

export const revokeCredential=async(req,res)=>{
 try {
  const actor=await requireUser(req,res,['admin']);if(!actor)return;
  const note=typeof req.body?.note==='string'?req.body.note.trim():'';
  if(!isUuid(req.params.id)||!note||note.length>2000)throw new HttpError(400,'Select a credential and record a revocation reason (at most 2000 characters).');
  await withTransaction(async db=>{
   if(!(await db.query("select to_regclass('public.project_request_receipts') is not null as ready")).rows[0].ready)throw new HttpError(409,'Apply migration 027 before revoking credentials.');
   const owner=(await db.query('select user_id from user_licenses where id=$1',[req.params.id])).rows[0];
   if(!owner)throw new HttpError(404,'Credential not found.');
   await db.query('select id from users where id=$1 for update',[owner.user_id]);
   await db.query("select set_config('app.current_user_id',$1,true)",[actor.id]);
   const result=await db.query('update user_licenses set revoked_at=now(),revoked_by=$2,revocation_note=$3 where id=$1 and revoked_at is null returning id',[req.params.id,actor.id,note]);
   if(!result.rowCount)throw new HttpError(409,'Credential already revoked.');
  });
  return sendOk(res,'Credential revoked. Original verification history preserved.',1,{id:req.params.id});
 } catch(error){return handleError(res,error);}
};

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
      `select l.id,l.profession,l.license_number,l.license_expiry::text,l.upload_status,l.upload_file_ref,l.superseded_at,l.verification_status,l.verified_by,l.verified_at,l.verification_note,to_jsonb(l)->'specializations' as specializations,to_jsonb(l)->>'revoked_at' as revoked_at,to_jsonb(l)->>'revocation_note' as revocation_note,coalesce((to_jsonb(l)->>'correction_required')::boolean,false) as correction_required,u.full_name as verified_by_name from user_licenses l left join users u on u.id=l.verified_by where l.user_id=$1 order by l.created_at desc,l.id desc`,
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
      `select q.id,q.profession,q.license_number,q.license_expiry::text,q.status,to_jsonb(q)->'specializations' as specializations,${SUBMISSION_KIND_SQL} as submission_kind,q.submitted_at,q.reviewed_at,q.review_note,u.full_name as reviewed_by_name from license_renewal_requests q left join users u on u.id=q.reviewed_by where q.user_id=$1 order by q.id desc`,
      [userId],
    )
  ).rows
  const holds = (
    await db.query(
      "select metadata from workspace_account_metadata where user_id=$1",
      [userId],
    )
  ).rows[0]?.metadata
  const tags=specializationSummary(credentials,submissions,specializations.map(s=>s.specialization));
  const qualified = qualifyingSpecializations(
    credentials,
    tags,
    localDay(),
    30,
    specializations.map(s=>s.specialization),
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
      document_url: c.upload_file_ref ? `/api/v1/licenses/credentials/${c.id}/file` : undefined,
      expiryStatus: c.license_expiry < localDay() ? "Expired" : "Current",
      eligible: credentialEligible(c, localDay()),
      needsReview:
        !c.profession ||
        !!licenseNumberError(c.license_number) ||
        c.verification_status !== "verified",
    })),
    specializations:tags.map(tag=>specializations.find(s=>s.specialization===tag)||{specialization:tag}),
    legacySpecializations:specializations,
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
      const body=req.body||{};
      if (body.credential_id || body.submission_id) {
        await requireCredentialTags(db);
        const tags=validateSpecializations(body.specializations);
        if(body.credential_id&&body.submission_id)throw new HttpError(400,'Select one credential.');
        await db.query('select id from users where id=$1 for update',[id]);
        const credential=body.credential_id;
        if(credential&&!isUuid(credential))throw new HttpError(400,'Invalid credential.');
        if(!credential&&!/^\d+$/.test(String(body.submission_id)))throw new HttpError(400,'Invalid submission.');
        const table=credential?'user_licenses':'license_renewal_requests';
        const found=await db.query(`select id from ${table} where id=$1 and user_id=$2 and ${credential?'superseded_at is null':"status='under_review'"} for update`,[credential||body.submission_id,id]);
        if(!found.rowCount)throw new HttpError(404,'Editable credential not found for this engineer.');
        await db.query(`update ${table} set specializations=$2 where id=$1`,[credential||body.submission_id,tags]);
        await db.query('insert into engineer_specialization_history(user_id,specializations,recorded_by) values($1,$2,$3)',[id,JSON.stringify({credential_id:credential||null,submission_id:body.submission_id||null,specializations:tags}),user.id]);
      } else await saveSpecializations(db, id, body.specializations, user.id)
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
// Legacy corrections create a pending version; the separate Admin review records verification.
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
          license_number: req.body?.license_number ?? old.license_number,
          license_expiry: String(
            old.license_expiry instanceof Date
              ? old.license_expiry.toISOString()
              : old.license_expiry,
          ).slice(0, 10),
        },
        { path: old.upload_file_ref },
      )
    })
    return sendOk(res, "Legacy credential submitted for Administrator review.", 1, result, 201)
  } catch (e) {
    return handleError(res, e)
  }
}
