import fs from "node:fs";
import path from "node:path";
import execute from "../../common/utilities/query.utility.js";
import { requireUser,handleError,sendOk,sendError,HttpError,isUuid } from "../../common/utilities/access.utility.js";
import { archiveProjectAccess } from "./audit.utility.js";

const readDb={query:execute};
async function documentActor(req,res) {
  const actor=await requireUser(req,res,["admin","opm","spm"]);
  if(!actor) return null;
  if(!isUuid(req.params.id)) {sendError(res,"Invalid project id.",400);return null;}
  const exists=await execute("SELECT id FROM projects WHERE id=$1",[req.params.id]);
  if(!exists.rowCount || !(await archiveProjectAccess(readDb,actor,req.params.id))) {
    sendError(res,"Project not found.",404);return null;
  }
  return actor;
}
export const getArchiveDocuments = async (req,res) => {
  try {
    if(!(await documentActor(req,res))) return;
    const id=req.params.id;
    const docs=await execute(
      `SELECT d.id AS document_type_id,d.code,d.label,d.is_required_for_intake,pd.id AS document_id,
        COALESCE(pd.status,'not_uploaded') AS status,pd.uploaded_at,pd.file_ref IS NOT NULL AS has_file
       FROM document_types d LEFT JOIN project_documents pd ON pd.document_type_id=d.id AND pd.project_id=$1 ORDER BY d.id`,[id]);
    const contracts=await execute(
      "SELECT id,contract_type,subcontractor_name,trade_scope,uploaded_at FROM contracts WHERE project_id=$1 ORDER BY uploaded_at",[id]);
    const phaseFiles=await execute(
      `SELECT f.id,f.project_stage_id,s.code AS stage,f.original_name,f.content_type,f.byte_size,f.uploaded_at
        FROM project_phase_files f JOIN project_stages s ON s.id=f.project_stage_id WHERE f.project_id=$1 ORDER BY f.uploaded_at`,[id]);
    const required=docs.rows.filter(d=>d.is_required_for_intake);
    return sendOk(res,"Read-only document repository retrieved.",1,{project_id:id,read_only:true,
      documents:docs.rows,contracts:contracts.rows,phase_files:phaseFiles.rows,
      docs_required:required.length,docs_uploaded:required.filter(d=>d.status==="uploaded" && d.has_file).length,
      document_requirements_configured:required.length>0});
  } catch(error) {return handleError(res,error);}
};
export const downloadArchiveFile = async (req,res) => {
  try {
    if(!(await documentActor(req,res))) return;
    if(!isUuid(req.params.fileId)) return sendError(res,"Invalid file id.",400);
    const kind=req.params.kind,id=req.params.fileId,project=req.params.id;
    if(kind==="phase-files") {
      const found=await execute("SELECT original_name,content_type,content FROM project_phase_files WHERE id=$1 AND project_id=$2",[id,project]);
      if(!found.rowCount) return sendError(res,"File not found.",404);
      const f=found.rows[0];
      res.set("Content-Type",f.content_type);
      res.set("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
      res.set("Cache-Control","private, no-store");res.set("X-Content-Type-Options","nosniff");
      return res.send(f.content);
    }
    let found;
    if(kind==="documents") found=await execute(
      `SELECT pd.file_ref,d.label AS name FROM project_documents pd JOIN document_types d ON d.id=pd.document_type_id
        WHERE pd.id=$1 AND pd.project_id=$2 AND pd.status='uploaded'`,[id,project]);
    else if(kind==="contracts") found=await execute("SELECT file_ref,contract_type AS name FROM contracts WHERE id=$1 AND project_id=$2",[id,project]);
    else return sendError(res,"Unknown file category.",400);
    if(!found.rowCount || !found.rows[0].file_ref) return sendError(res,"File not found.",404);
    const file=found.rows[0];
    const root=path.resolve("uploads"),target=path.resolve(file.file_ref),relative=path.relative(root,target);
    if(relative.startsWith("..") || path.isAbsolute(relative)) throw new HttpError(404,"Stored file is unavailable.");
    if(!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new HttpError(404,"Stored file is unavailable.");
    res.set("Cache-Control","private, no-store");res.set("X-Content-Type-Options","nosniff");
    return res.download(target,file.name+path.extname(target),error=>{
      if(error && !res.headersSent) sendError(res,"Stored file is unavailable.",404);
    });
  } catch(error) {return handleError(res,error);}
};
