import execute from "../../common/utilities/query.utility.js";
import {
  handleError, sendOk, sendError, requireUser, hasProjectAccess, isUuid, paging,
} from "../../common/utilities/access.utility.js";
 
const LIFECYCLE = ["draft", "suggested_allocation", "confirmed", "sent_to_opm", "spm_review", "active", "archived"];
const SORTS = {
  name: "p.name",
  created_at: "p.created_at",
  target_start_date: "p.target_start_date",
  current_pct: "phase_progress.pct",
};
 
export const LIST_SELECT = `
  p.id, p.name, p.client_name, pt.code AS project_type,
  coalesce((to_jsonb(p)->>'subcontractor_allocation_version')::int,0) as subcontractor_allocation_version,
  p.floor_area_sqm, p.floor_count, p.target_start_date, p.target_end_date, p.location,
  p.current_stage_id, ps.code AS current_stage, phase_progress.pct AS current_pct,
  phase_progress.approved_count AS checklist_approved_count, phase_progress.required_count AS checklist_required_count,
  owner.spm_user_id AS phase_owner_id, owner.status AS phase_owner_status, owner_user.full_name AS phase_owner_name,
  (SELECT max(h.recorded_at) FROM project_progress_history h WHERE h.project_id = p.id
    AND h.project_stage_id = p.current_stage_id AND h.entry_type <> 'issue') AS last_progress_updated_at,
  p.crew_required, p.crew_assigned,
  p.lifecycle_status, p.suggested_opm_id, p.suggested_opm_match_score,
  p.headcount_suggested, p.headcount_tier, p.archived_at, p.created_at, p.updated_at`;
 
export const LIST_FROM = `
  FROM projects p
  LEFT JOIN project_types pt ON pt.id = p.project_type_id
  LEFT JOIN project_stages ps ON ps.id = p.current_stage_id
  LEFT JOIN project_phase_team owner ON owner.project_id = p.id AND owner.project_stage_id = p.current_stage_id
  LEFT JOIN users owner_user ON owner_user.id = owner.spm_user_id
  LEFT JOIN LATERAL (
    SELECT counts.*, COALESCE(round(100.0 * approved_count / NULLIF(required_count, 0)), 0)::int AS pct
    FROM (
      SELECT count(*) FILTER (WHERE i.required)::int AS required_count,
             count(*) FILTER (WHERE i.required AND evidence.status = 'approved')::int AS approved_count
      FROM (
        SELECT id, required FROM project_phase_checklist_items
         WHERE project_id = p.id AND project_stage_id = p.current_stage_id
        UNION ALL
        SELECT NULL::bigint AS id, required FROM phase_checklist_templates
         WHERE project_stage_id = p.current_stage_id AND NOT EXISTS (
           SELECT 1 FROM project_phase_checklists WHERE project_id = p.id AND project_stage_id = p.current_stage_id)
      ) i
      LEFT JOIN LATERAL (SELECT status FROM project_phase_evidence
        WHERE checklist_item_id = i.id ORDER BY id DESC LIMIT 1) evidence ON true
    ) counts
  ) phase_progress ON true`;
 
export const stripInternal = (row) => {
  const { suggested_opm_id, suggested_opm_match_score, headcount_suggested, headcount_tier, ...rest } = row;
  return rest;
};
 
export const getProjects = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
 
    const params = [];
    const where = ["COALESCE(p.is_deleted, false) = false"];
    const add = (sql, value) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };
 
    if (user.role === "opm") {
      params.push(user.id);
      where.push(`(p.suggested_opm_id = $${params.length} OR EXISTS (
        SELECT 1 FROM project_engineers pe
         WHERE pe.project_id = p.id AND pe.user_id = $${params.length} AND pe.unassigned_at IS NULL))`);
    } else if (user.role === "spm") {
      params.push(user.id);
      where.push(`(EXISTS (SELECT 1 FROM project_phase_team t
                            WHERE t.project_id = p.id AND t.spm_user_id = $${params.length})
        OR EXISTS (SELECT 1 FROM project_engineers pe
                    WHERE pe.project_id = p.id AND pe.user_id = $${params.length} AND pe.unassigned_at IS NULL))`);
    } else if (user.role === "client") {
      params.push(user.id);
      where.push(`EXISTS (SELECT 1 FROM user_client_project_links c
                           WHERE c.project_id = p.id AND p.lifecycle_status IN ('active','archived') AND c.user_id = $${params.length})`);
    }
 
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.client_name ILIKE $${params.length})`);
    }
    if (req.query.lifecycle_status) {
      if (!LIFECYCLE.includes(req.query.lifecycle_status)) return sendError(res, "Invalid lifecycle_status.", 400);
      add("p.lifecycle_status = ?", req.query.lifecycle_status);
    }
    if (req.query.project_type) add("pt.code = ?", req.query.project_type);
 
    const sortOrder = String(req.query.sortOrder).toUpperCase() === "DESC" ? "DESC" : "ASC";
    const sortColumn = SORTS[req.query.sortBy] || "p.created_at";
    const { limit, offset } = paging(req);
    const whereClause = `WHERE ${where.join(" AND ")}`;
 
    const total = await execute(`SELECT count(*)::int AS total ${LIST_FROM} ${whereClause}`, params);
    const rows = await execute(
      `SELECT ${LIST_SELECT} ${LIST_FROM} ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}, p.id ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
 
    const mapped = rows.rows.map(row => ({ ...row,
      your_phase_is_active: user.role === "spm" && row.lifecycle_status === "active" &&
        row.phase_owner_status === "confirmed" && row.phase_owner_id === user.id }));
    const data = user.role === "client" ? mapped.map(stripInternal) : mapped;
    return sendOk(res, "Resources retrieved successfully.", total.rows[0].total, data);
  } catch (error) {
    return handleError(res, error);
  }
};
 
export const getProjectById = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);
 
    if (!(await hasProjectAccess(user, id))) return sendError(res, "Project not found.", 404);
 
    const project = await execute(
      `SELECT ${LIST_SELECT} ${LIST_FROM}
        WHERE p.id = $1 AND COALESCE(p.is_deleted, false) = false`,
      [id]
    );
    if (project.rowCount === 0) return sendError(res, "Project not found.", 404);
 
    const [engineers, phaseTeam, subcontractors, history] = await Promise.all([
      execute(
        `SELECT user_id, project_role_label, assigned_at
           FROM project_engineers
          WHERE project_id = $1 AND unassigned_at IS NULL
          ORDER BY assigned_at`, [id]),
      execute(
        `SELECT t.project_stage_id AS stage_id, s.code AS stage, w.sort_order,
                t.spm_user_id, u.full_name AS spm_name, t.status, t.is_lead
           FROM project_phase_team t
           JOIN projects p ON p.id=t.project_id
           JOIN project_type_stages w ON w.project_type_id=p.project_type_id AND w.project_stage_id=t.project_stage_id
           JOIN project_stages s ON s.id = t.project_stage_id
           LEFT JOIN users u ON u.id = t.spm_user_id
          WHERE t.project_id = $1
          ORDER BY w.sort_order`, [id]),
      execute(
        `SELECT w.id, w.full_name, w.role_title, d.code AS discipline, w.current_project_until
           FROM subcontractor_workers w
           LEFT JOIN disciplines d ON d.id = w.discipline_id
          WHERE w.current_project_id = $1 AND w.availability_status = 'assigned'
          ORDER BY w.full_name`, [id]),
      execute(
        `SELECT h.id, s.code AS stage, h.pct, h.note, h.is_issue, h.issue_categories, h.entry_type, h.recorded_at
           FROM project_progress_history h
           LEFT JOIN project_stages s ON s.id = h.project_stage_id
          WHERE h.project_id = $1 ${user.role === "client" ? "AND h.is_client_visible = true" : ""}
          ORDER BY h.recorded_at DESC, h.id DESC
          LIMIT 10`, [id]),
    ]);
 
    const base = user.role === "client" ? stripInternal(project.rows[0]) : project.rows[0];
    return sendOk(res, "Resource retrieved successfully.", 1, {
      ...base,
      engineers: engineers.rows,
      phase_team: phaseTeam.rows,
      subcontractors: subcontractors.rows,
      recent_history: history.rows,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
