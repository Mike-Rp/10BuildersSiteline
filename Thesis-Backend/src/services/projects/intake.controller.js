import { validatePhaseTeam } from "./type-phases.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from '../../common/utilities/transaction.utility.js';
import { assertEligibleManager } from '../../common/utilities/license-eligibility.utility.js';
import { requireUser, handleError, isUuid } from '../../common/utilities/access.utility.js';

import { uploadAttachment } from "../../common/utilities/upload.utility.js";
import { responseOk, responseError } from "../../common/utilities/response.utility.js";

export const createIntake = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ['admin']);
    if (!actor) return;
    const {name, project_type, floor_area_sqm, floor_count, target_start_date,
      client_name, suggested_opm_id, suggested_opm_match_score, suggested_opm_math_score, headcount_suggested,
      phase_team = [], client_user_id = null, crew_required = headcount_suggested ?? 0} = req.body || {};
    if (!name || !project_type || (!client_name && !client_user_id && !req.body?.draft_project_id) || !target_start_date || !suggested_opm_id ||
      !Number.isFinite(Number(floor_area_sqm)) || !Number.isInteger(Number(floor_count)) || Number(floor_count) <= 0 || Number(floor_count) > 32767 ||
      Number(floor_area_sqm) <= 0 || !Number.isInteger(Number(crew_required)) || Number(crew_required) < 0 ||
      Number(crew_required) > 32767 || !Array.isArray(phase_team) || phase_team.length === 0 ||
      new Set(phase_team.map(p => p?.stage)).size !== phase_team.length) {
      return responseError(res, 'Missing or invalid project details.', 400);
    }
    const tier = Number(floor_area_sqm) >= 50000 || Number(floor_count) >= 31 ? 'Large'
      : Number(floor_area_sqm) >= 15000 || Number(floor_count) >= 30 ? 'Medium' : 'Small';
    if (req.body?.draft_project_id && !isUuid(req.body.draft_project_id)) return responseError(res,"Invalid draft_project_id.",400);
    const intakeId = req.body?.intake_id ?? null;
    if (intakeId !== null && !isUuid(intakeId)) return responseError(res,"Invalid intake_id.",400);
    const result = await withTransaction(async (client) => {
      // A repeat of the same submission returns the project it already created instead of inserting another.
      const idemKey = intakeId ?? req.body?.draft_project_id ?? null;
      if (idemKey) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [idemKey]);
        const prior = await client.query(
          `SELECT p.id,p.name,p.lifecycle_status FROM projects p
            WHERE p.id=$1 AND COALESCE(p.is_deleted,false)=false AND p.lifecycle_status NOT IN ('draft','suggested_allocation','confirmed')
              AND EXISTS (SELECT 1 FROM assignment_confirmations c WHERE c.project_id=p.id AND c.role_context='opm')`, [idemKey]);
        if (prior.rowCount) {
          const confirmation = await client.query(
            `SELECT id,project_id,target_user_id,status FROM assignment_confirmations
              WHERE project_id=$1 AND role_context='opm' ORDER BY created_at LIMIT 1`, [idemKey]);
          return {project: prior.rows[0], confirmation: confirmation.rows[0], duplicate: true};
        }
      }
      let draft=null;
      if (req.body.draft_project_id) {
        const found=await client.query("SELECT id,client_name,lifecycle_status FROM projects WHERE id=$1 AND COALESCE(is_deleted,false)=false FOR UPDATE",[req.body.draft_project_id]);
        if(!found.rowCount) throw Object.assign(new Error("Draft not found."),{status:404});
        draft=found.rows[0];
        if(!["draft","suggested_allocation","confirmed"].includes(draft.lifecycle_status)) throw Object.assign(new Error("This intake has already been submitted."),{status:409});
      }
      let selectedClient=client_user_id;
      if(!selectedClient && draft) {
        const links=await client.query("SELECT user_id FROM user_client_project_links WHERE project_id=$1",[draft.id]);
        if(links.rowCount>1) throw Object.assign(new Error("Select a client_user_id."),{status:422});
        selectedClient=links.rows[0]?.user_id ?? null;
      }
      let company=client_name ?? draft?.client_name;
      if(selectedClient) {
        if(!isUuid(selectedClient)) throw Object.assign(new Error("Invalid client_user_id."),{status:400});
        const user=await client.query("SELECT u.full_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND r.code='client' AND u.status IN ('active','invited') AND COALESCE(u.is_deleted,false)=false",[selectedClient]);
        if(!user.rowCount) throw Object.assign(new Error("Invalid client account."),{status:422});
        company ??= user.rows[0].full_name;
      }
      if(typeof company!=="string" || !company.trim() || company.length>150) throw Object.assign(new Error("Invalid client_name."),{status:400});
      const projectType=await client.query("SELECT id FROM project_types WHERE code=$1",[project_type]);
      if(!projectType.rowCount) throw Object.assign(new Error("Invalid project_type."),{status:422});
      await validatePhaseTeam(client,projectType.rows[0].id,phase_team);
      if(draft) {
        const accepted=await client.query("SELECT 1 FROM project_phase_team WHERE project_id=$1 AND status='confirmed' LIMIT 1",[draft.id]);
        if(accepted.rowCount) throw Object.assign(new Error("Allocation is locked after an SPM accepts."),{status:409});
      }
      await assertEligibleManager(client, suggested_opm_id, 'opm');
      for (const phase of phase_team) {
        if (!phase || !phase.stage || !phase.user_id) throw Object.assign(new Error('Each phase needs stage and user_id.'), {status:422});
        await assertEligibleManager(client, phase.user_id, 'spm');
      }
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [actor.id]);
      const inserted = draft ? await client.query(
        `UPDATE projects SET name=$1,project_type_id=(SELECT id FROM project_types WHERE code=$2),client_name=$3,
          floor_area_sqm=$4,floor_count=$5,target_start_date=$6,lifecycle_status='sent_to_opm',suggested_opm_id=$7,
          suggested_opm_match_score=$8,headcount_suggested=$9,headcount_tier=$10,crew_required=$11,updated_by=$12,updated_at=now()
          WHERE id=$13 RETURNING id,name,lifecycle_status`,
        [name,project_type,company,floor_area_sqm,floor_count,target_start_date,suggested_opm_id,
         suggested_opm_match_score ?? suggested_opm_math_score ?? null,headcount_suggested ?? null,tier,Number(crew_required),actor.id,draft.id])
        : await client.query(`INSERT INTO projects
        (id, name, project_type_id, client_name, floor_area_sqm, floor_count, target_start_date,
         lifecycle_status, suggested_opm_id, suggested_opm_match_score,
         headcount_suggested, headcount_tier, crew_required, crew_assigned, created_by, updated_by)
        SELECT COALESCE($13::uuid, gen_random_uuid()), $1, pt.id, $3, $4, $5, $6, 'sent_to_opm', $7, $8, $9, $10, $11, 0, $12, $12
        FROM project_types pt WHERE pt.code = $2
        RETURNING id, name, lifecycle_status`,
        [name,project_type,company,floor_area_sqm,floor_count,target_start_date,
         suggested_opm_id,suggested_opm_match_score ?? suggested_opm_math_score ?? null,headcount_suggested ?? null,tier,Number(crew_required),actor.id,intakeId]);
      if (!inserted.rowCount) throw Object.assign(new Error('Invalid project_type.'), {status:422});
      const project = inserted.rows[0];
      if(draft) await client.query("DELETE FROM project_phase_team WHERE project_id=$1",[project.id]);
      for (const phase of phase_team) {
        const r = await client.query(`INSERT INTO project_phase_team
          (project_id, project_stage_id, spm_user_id, is_lead, status,
           response_deadline_at, created_by, updated_by)
          SELECT $1, ps.id, $3, $4, 'pending', NULL, $5, $5
          FROM project_stages ps WHERE ps.code = $2 RETURNING project_stage_id`,
          [project.id,phase.stage,phase.user_id,phase.is_lead ?? false,actor.id]);
        if (!r.rowCount) throw Object.assign(new Error(`Unknown stage: ${phase.stage}`), {status:422});
      }
      if(selectedClient) {
        await client.query("DELETE FROM user_client_project_links WHERE project_id=$1 AND user_id<>$2",[project.id,selectedClient]);
        await client.query("INSERT INTO user_client_project_links (user_id,project_id,created_by,updated_by) VALUES ($1,$2,$3,$3) ON CONFLICT (user_id,project_id) DO NOTHING",[selectedClient,project.id,actor.id]);
      }
      const confirmation = await client.query(`INSERT INTO assignment_confirmations
        (project_id,target_user_id,role_context,match_score,status,created_by)
        VALUES ($1,$2,'opm',$3,'pending',$4)
        RETURNING id,project_id,target_user_id,status`,
        [project.id,suggested_opm_id,suggested_opm_match_score ?? suggested_opm_math_score ?? null,actor.id]);
      return {project, confirmation:confirmation.rows[0]};
    });
    if (result.duplicate) return responseOk(res, 'Project was already submitted.', 1, {project: result.project, confirmation: result.confirmation});
    return responseOk(res, 'Project and pending OPM confirmation created.', 1, result);
  } catch (error) {
    if (error.status) return responseError(res, error.message, error.status);
    return handleError(res, error);
  }
};

export const uploadContract = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ['admin']);
    if (!actor) return;
    const created_by = actor.id;

    const { project_id } = req.body;
    if (!isUuid(project_id)) return responseError(res,'project_id must be a valid id.',400);
    const project=await execute("SELECT lifecycle_status FROM projects WHERE id=$1",[project_id]);
    if(project.rows[0]?.lifecycle_status==="archived") return responseError(res,"Archived projects are read-only.",409);
    
    const document_id = await uploadAttachment(
      req.file,
      'contracts',
      {
        contract_type: 'client_contract',
        project_id,
        subcontractor_name: 'N/A',
        trade_scope: 'N/A'
      },
      'create',
      created_by
    );

    responseOk(res, 'Resource uploaded successfully', 1, {document_id}); 
  } catch (error) {
    return handleError(res, error);
  }
}

export const uploadSubconContract = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ['admin']);
    if (!actor) return;
    const created_by = actor.id;

    const { project_id, subcontractor_name, trade_scope } = req.body;
    if (!isUuid(project_id)) return responseError(res,'project_id must be a valid id.',400);
    const project=await execute("SELECT lifecycle_status FROM projects WHERE id=$1",[project_id]);
    if(project.rows[0]?.lifecycle_status==="archived") return responseError(res,"Archived projects are read-only.",409);
    
    const document_id = await uploadAttachment(
      req.file,
      'contracts',
      {
        contract_type: 'client_subcon_agreement',
        project_id,
        subcontractor_name,
        trade_scope
      },
      'create',
      created_by
    );

    responseOk(res, 'Resource uploaded successfully', 1, {document_id}); 
  } catch (error) {
    return handleError(res, error);
  }
}