import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { HttpError, requireUser, sendOk, sendError, handleError, isUuid } from "../../common/utilities/access.utility.js";
import { clientLoginEmail, CLIENT_ACTIVATION_PASSWORD_MARKER } from "./client-onboarding.js";

const allowed = ["draft","suggested_allocation","confirmed","sent_to_opm","spm_review"];
async function intakeProject(db,id,editable=true) {
  if(!isUuid(id)) throw new HttpError(400,"A saved draft project_id is required.");
  const found=await db.query(
    "SELECT id,client_name,lifecycle_status,suggested_opm_id,to_jsonb(projects)->'inquiry_intake' AS inquiry_details FROM projects WHERE id=$1 AND COALESCE(is_deleted,false)=false FOR UPDATE",[id]);
  if(!found.rowCount) throw new HttpError(404,"Project not found.");
  if(editable&&!allowed.includes(found.rows[0].lifecycle_status)) throw new HttpError(409,"Client selection is locked after intake approval.");
  return found.rows[0];
}
async function attach(db,p,user,company,actorId) {
  await db.query("DELETE FROM user_client_project_links WHERE project_id=$1 AND user_id<>$2",[p.id,user.id]);
  await db.query(
    "INSERT INTO user_client_project_links (user_id,project_id,created_by,updated_by) VALUES ($1,$2,$3,$3) ON CONFLICT (user_id,project_id) DO NOTHING",
    [user.id,p.id,actorId]);
  await db.query("UPDATE projects SET client_name=$2,updated_by=$3,updated_at=now() WHERE id=$1",[p.id,company,actorId]);
}
export const getProjectClientAccount = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin","opm"]);
    if(!actor) return;
    const data=await withTransaction(async db=>{
      const p=await intakeProject(db,req.params.id,false);
      if (actor.role!=="admin"&&p.suggested_opm_id!==actor.id) throw new HttpError(403,"Only Admin or the assigned Office PM can manage this project's client account.");
      const clients=(await db.query(`SELECT u.id,u.full_name,u.email,u.phone,u.status,
        CASE WHEN u.status='invited' AND u.password_hash=$2 THEN 'pending_activation'
          WHEN u.status='active' AND u.password_hash<>$2 THEN 'active' ELSE NULL END AS activation_status FROM user_client_project_links l
        JOIN users u ON u.id=l.user_id JOIN roles r ON r.id=u.role_id
        WHERE l.project_id=$1 AND r.code='client' AND NOT COALESCE(u.is_deleted,false) ORDER BY u.full_name,u.id`,[p.id,CLIENT_ACTIVATION_PASSWORD_MARKER])).rows;
      const details=p.inquiry_details||{};
      const managed = !!p.inquiry_details;
      const email = clientLoginEmail(details.email);
      const existing = managed && email && actor.role === "admin" && !clients.length && allowed.includes(p.lifecycle_status)
        ? (await db.query(`SELECT u.id,u.full_name,u.email FROM users u JOIN roles r ON r.id=u.role_id
          WHERE lower(u.email::text)=$1 AND r.code='client' AND u.status='active' AND NOT COALESCE(u.is_deleted,false)`, [email])).rows[0]
        : undefined;
      return {clients,managed,existing,can_issue_activation_code:actor.role === "opm" && clients.some(account => account.activation_status === "pending_activation"),
        defaults:{email:details.email||""}};
    });
    res.set("Cache-Control","private, no-store");
    return sendOk(res,"Project client account loaded.",1,data);
  } catch(error) {return handleError(res,error);}
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
      if (p.inquiry_details && (req.body.ownership_verified !== true || user.status !== "active" || clientLoginEmail(p.inquiry_details.email) !== user.email.toLowerCase()))
        throw new HttpError(409, "Verify the active client's ownership and registered inquiry email before linking the project.");
      if (p.inquiry_details && (await db.query("SELECT 1 FROM user_client_project_links WHERE project_id=$1", [p.id])).rowCount)
        throw new HttpError(409,"A client account is already linked to this project.");
      const company=p.inquiry_details ? (p.client_name || user.full_name) : req.body.client_name ?? user.full_name;
      if(typeof company!=="string" || !company.trim() || company.trim().length>150) throw new HttpError(400,"Invalid client_name.");
      await attach(db,p,user,company.trim(),actor.id);
      return {project_id:p.id,client_user_id:user.id,client_name:company.trim(),email:user.email};
    });
    return sendOk(res,"Existing client selected.",1,data);
  } catch(error) { return handleError(res,error); }
};
