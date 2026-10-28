import execute from "../../common/utilities/query.utility.js";
import { requireUser,handleError,sendOk } from "../../common/utilities/access.utility.js";
import { archiveQuery,ARCHIVE_VIEWS } from "./queries.js";

export const getArchive = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin","opm","spm"]);
    if(!actor) return;
    const query=archiveQuery(actor,req.params.view,req.query);
    const count=await execute(query.countSql,query.params);
    const rows=await execute(query.dataSql,query.dataParams);
    const total=count.rows[0].total;
    let sections;
    if(req.params.view==="suspended-accounts") {
      const grouped=await execute(query.countSql.replace("SELECT count(*)::int AS total","SELECT section,count(*)::int AS total")+" GROUP BY section",query.params);
      sections={pending_review:0,archived:0};
      for(const row of grouped.rows) sections[row.section]=row.total;
    }
    return res.status(200).json({code:200,message:"Archive retrieved.",count:total,data:rows.rows,
      pagination:{page:query.page,page_size:query.limit,total,total_pages:Math.ceil(total/query.limit)},
      read_only:true,...(sections ? {section_counts:sections} : {})});
  } catch(error) { return handleError(res,error); }
};
export const getArchiveSummary = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin","opm","spm"]);
    if(!actor) return;
    const counts={};
    for(const view of ARCHIVE_VIEWS[actor.role]) {
      const query=archiveQuery(actor,view,{threshold_days:req.query.threshold_days});
      const count=await execute(query.countSql,query.params);
      counts[view]=count.rows[0].total;
    }
    return sendOk(res,"Archive tab counts retrieved.",1,{role:actor.role,counts});
  } catch(error) { return handleError(res,error); }
};
export const getEscalatedAssignments = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    const limit=Number(req.query.limit ?? 20),offset=Number(req.query.offset ?? 0);
    if(!Number.isInteger(limit) || limit<1 || limit>100 || !Number.isSafeInteger(offset) || offset<0) {
      return res.status(400).json({code:400,message:"Invalid pagination."});
    }
    const relation=`FROM (
      SELECT t.id::text AS assignment_id,'phase'::text AS assignment_kind,p.id AS project_id,p.name AS project_name,
        u.full_name AS spm_name,t.response_deadline_at AS deadline_at,t.responded_at AS expired_at
      FROM project_phase_team t JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=t.spm_user_id
      WHERE t.status='auto_expired' AND p.lifecycle_status<>'archived' AND COALESCE(p.is_deleted,false)=false
      UNION ALL SELECT c.id::text,'confirmation',p.id,p.name,u.full_name,
        (SELECT (a.new_values->>'deadline_at')::timestamptz FROM audit_log a WHERE a.table_name='assignment_confirmations'
          AND a.record_id=c.id::text AND a.new_values->>'_archive_event'='assignment_expired' ORDER BY a.id DESC LIMIT 1),
        c.escalated_at
      FROM assignment_confirmations c JOIN projects p ON p.id=c.project_id JOIN users u ON u.id=c.target_user_id
      WHERE c.status='auto_expired' AND c.role_context='spm' AND p.lifecycle_status<>'archived'
        AND COALESCE(p.is_deleted,false)=false
    ) expired`;
    const total=await execute("SELECT count(*)::int AS total "+relation);
    const data=await execute("SELECT * "+relation+" ORDER BY expired_at LIMIT $1 OFFSET $2",[limit,offset]);
    return sendOk(res,"Expired assignments awaiting Admin action.",total.rows[0].total,data.rows);
  } catch(error) {return handleError(res,error);}
};
