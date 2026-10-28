import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { HttpError, requireUser, sendOk, sendError, handleError, isUuid } from "../../common/utilities/access.utility.js";
import { createAccountRecord } from "../accounts/manage.controller.js";

const allowed = ["draft","suggested_allocation","confirmed","sent_to_opm","spm_review"];
async function intakeProject(db,id) {
  if(!isUuid(id)) throw new HttpError(400,"A saved draft project_id is required.");
  const found=await db.query(
    "SELECT id,client_name,lifecycle_status FROM projects WHERE id=$1 AND COALESCE(is_deleted,false)=false FOR UPDATE",[id]);
  if(!found.rowCount) throw new HttpError(404,"Project not found.");
  if(!allowed.includes(found.rows[0].lifecycle_status)) throw new HttpError(409,"Client selection is locked after intake approval.");
  return found.rows[0];
}
async function attach(db,p,user,company,actorId) {
  await db.query("DELETE FROM user_client_project_links WHERE project_id=$1 AND user_id<>$2",[p.id,user.id]);
  await db.query(
    "INSERT INTO user_client_project_links (user_id,project_id,created_by,updated_by) VALUES ($1,$2,$3,$3) ON CONFLICT (user_id,project_id) DO NOTHING",
    [user.id,p.id,actorId]);
  await db.query("UPDATE projects SET client_name=$2,updated_by=$3,updated_at=now() WHERE id=$1",[p.id,company,actorId]);
}
export const createIntakeClient = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    const b=req.body || {};
    const company=b.company_name ?? b.client_name;
    const person=b.contact_person ?? b.full_name;
    const phone=b.phone ?? b.contact_number ?? null;
    const email=typeof b.email==="string" ? b.email.trim().toLowerCase() : b.email;
    if(typeof company!=="string" || !company.trim() || company.trim().length>150 ||
      typeof person!=="string" || !person.trim() || person.trim().length>150 ||
      typeof email!=="string" || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (phone!=null && (typeof phone!=="string" || phone.length>30))) {
      return sendError(res,"Provide company_name, contact_person, email, and a valid optional contact number.",400);
    }
    const data=await withTransaction(async db=>{
      const p=await intakeProject(db,b.project_id);
      const existing=await db.query(
        `SELECT u.id,u.full_name,u.email,u.phone,u.status,u.is_deleted,r.code AS role FROM users u
         JOIN roles r ON r.id=u.role_id WHERE lower(u.email::text)=$1 FOR UPDATE OF u`,[email]);
      let user=existing.rows[0],reused=!!user;
      if(user && (user.role!=="client" || user.is_deleted || !["active","invited"].includes(user.status))) {
        throw new HttpError(409,"That email belongs to an unavailable or non-client account.");
      }
      if(!user) user=await createAccountRecord(db,actor,{full_name:person,email,phone,role:"client",password:b.password});
      await attach(db,p,user,company.trim(),actor.id);
      return {id:user.id,user_id:user.id,full_name:user.full_name,email:user.email,phone:user.phone,status:user.status,
        role:"client",project_id:p.id,client_name:company.trim(),reused,
        ...(user.temp_password ? {temp_password:user.temp_password} : {})};
    });
    return sendOk(res,"Client saved in Team Accounts and connected to the project.",1,data,data.reused ? 200 : 201);
  } catch(error) { return handleError(res,error); }
};
export const selectIntakeClient = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    if(!isUuid(req.body?.client_user_id)) return sendError(res,"client_user_id is required.",400);
    const data=await withTransaction(async db=>{
      const p=await intakeProject(db,req.params.id);
      const found=await db.query(
        `SELECT u.id,u.full_name,u.email,u.status FROM users u JOIN roles r ON r.id=u.role_id
         WHERE u.id=$1 AND r.code='client' AND u.status IN ('active','invited') AND COALESCE(u.is_deleted,false)=false FOR UPDATE OF u`,
        [req.body.client_user_id]);
      if(!found.rowCount) throw new HttpError(422,"Select an available client account.");
      const user=found.rows[0];
      const company=req.body.client_name ?? user.full_name;
      if(typeof company!=="string" || !company.trim() || company.trim().length>150) throw new HttpError(400,"Invalid client_name.");
      await attach(db,p,user,company.trim(),actor.id);
      return {project_id:p.id,client_user_id:user.id,client_name:company.trim(),email:user.email};
    });
    return sendOk(res,"Existing client selected.",1,data);
  } catch(error) { return handleError(res,error); }
};
