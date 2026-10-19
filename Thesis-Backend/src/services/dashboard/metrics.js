import execute from "../../common/utilities/query.utility.js";

const ACCOUNT_STATUSES = ["active", "invited", "suspended"];

export const getAdminMetrics = async () => {
    const [totals, byStatus] = await Promise.all([
      execute(
        `SELECT
           (SELECT count(*)::int FROM projects WHERE COALESCE(is_deleted,false) = false) AS total_projects,
           (SELECT count(*)::int FROM projects
             WHERE COALESCE(is_deleted,false) = false AND lifecycle_status = 'active') AS active_projects,
           (SELECT count(*)::int FROM projects
             WHERE COALESCE(is_deleted,false) = false
               AND (lifecycle_status = 'archived' OR archived_at IS NOT NULL)) AS archived_projects,
           (SELECT count(*)::int FROM assignment_confirmations ac
              JOIN projects p ON p.id = ac.project_id
             WHERE ac.status = 'pending' AND COALESCE(p.is_deleted,false) = false) AS pending_confirmations,
           (SELECT count(*)::int FROM pending_rework_requests WHERE status = 'pending') AS pending_rework,
           (SELECT count(*)::int FROM pending_progress_updates WHERE status = 'escalated') AS escalated_updates,
           (SELECT count(*)::int FROM project_phase_updates pu JOIN projects p ON p.id = pu.project_id
             WHERE pu.status = 'pending' AND COALESCE(p.is_deleted,false) = false) AS pending_phase_updates,
           (SELECT count(*)::int FROM users WHERE COALESCE(is_deleted,false) = false) AS total_accounts,
           (SELECT count(*)::int FROM users u JOIN roles r ON r.id = u.role_id
             WHERE COALESCE(u.is_deleted,false) = false
               AND u.status IN ('active','invited')
               AND lower(r.code) IN ('admin','opm','spm')) AS team_accounts,
           (SELECT count(*)::int FROM assignment_confirmations ac
             JOIN projects p ON p.id = ac.project_id
             WHERE ac.role_context = 'opm' AND ac.status = 'pending'
               AND COALESCE(p.is_deleted,false) = false) AS pending_opm_confirmations,
           (SELECT count(*)::int FROM projects WHERE COALESCE(is_deleted,false)=false AND COALESCE(current_pct,0)>=100) AS projects_at_100_pct,
           (SELECT round(avg(current_pct)::numeric,2) FROM projects WHERE COALESCE(is_deleted,false)=false AND lifecycle_status='active' AND current_pct IS NOT NULL) AS average_active_progress_pct,
           (SELECT count(*)::int FROM assignment_confirmations WHERE role_context='opm' AND status='declined' AND escalated_to_admin=true) AS declined_opm_confirmations`),
      execute(
        `SELECT status, count(*)::int AS n FROM users
          WHERE COALESCE(is_deleted,false) = false GROUP BY status`),
    ]);

    const t = totals.rows[0];
    const accountsByStatus = Object.fromEntries(ACCOUNT_STATUSES.map((s) => [s, 0]));
    for (const row of byStatus.rows) accountsByStatus[row.status] = row.n;

    return {
      totalProjects: t.total_projects, activeProjects: t.active_projects,
      archivedProjects: t.archived_projects, pendingConfirmations: t.pending_confirmations,
      pendingReworkRequests: t.pending_rework, escalatedProgressUpdates: t.escalated_updates,
      pendingPhaseUpdates: t.pending_phase_updates,
      totalAccounts: t.total_accounts, teamAccounts: t.team_accounts,
      pendingOpmConfirmations: t.pending_opm_confirmations, projectsAt100Pct: t.projects_at_100_pct,
      averageActiveProgressPct: t.average_active_progress_pct == null ? null : Number(t.average_active_progress_pct),
      declinedOpmConfirmations: t.declined_opm_confirmations, accountsByStatus,
    };
};

export const getAdminActiveSitesData = async () => {
    const result = await execute(
      `SELECT p.id AS project_id,
              p.name AS project_name,
              ps.code AS phase,
              p.current_pct AS progress_pct,
              p.lifecycle_status,
              latest.note AS progress_note,
              latest.recorded_at AS last_progress_at
         FROM projects p
         LEFT JOIN project_stages ps ON ps.id = p.current_stage_id
         LEFT JOIN LATERAL (
           SELECT h.note, h.recorded_at
             FROM project_progress_history h
            WHERE h.project_id = p.id
              AND h.is_issue = false
            ORDER BY h.recorded_at DESC, h.id DESC
            LIMIT 1
         ) latest ON true
        WHERE COALESCE(p.is_deleted,false) = false
          AND p.lifecycle_status = 'active'
        ORDER BY p.name ASC`
    );

    return { activeSites: result.rows.map(row => ({
      projectId: row.project_id, name: row.project_name, phase: row.phase,
      progressPct: row.progress_pct, lifecycleStatus: row.lifecycle_status,
      progressNote: row.progress_note, lastProgressAt: row.last_progress_at,
      scheduleStatus: "unknown"
    })) };
};

export const getOpmMetrics = async (userId) => {
    const mine = `
      COALESCE(p.is_deleted,false) = false
      AND (EXISTS (
            SELECT 1 FROM project_engineers pe
             WHERE pe.project_id = p.id AND pe.user_id = $1 AND pe.unassigned_at IS NULL))`;

    const result = await execute(
      `SELECT
         (SELECT count(*)::int FROM projects p WHERE ${mine} AND p.lifecycle_status = 'active') AS my_projects,
         (SELECT count(*)::int FROM assignment_confirmations ac
            JOIN projects p ON p.id = ac.project_id
           WHERE ac.target_user_id = $1 AND ac.role_context='opm' AND ac.status = 'pending'
             AND COALESCE(p.is_deleted,false) = false) AS pending_confirmations,
         (SELECT count(*)::int FROM pending_rework_requests rw
            JOIN projects p ON p.id = rw.project_id
           WHERE rw.status = 'pending' AND ${mine}) AS rework,
         (SELECT count(*)::int FROM project_phase_updates pu
            JOIN projects p ON p.id = pu.project_id
           WHERE pu.status = 'pending' AND ${mine}) AS updates,
         (SELECT round(avg(p.current_pct)::numeric,2) FROM projects p
           WHERE ${mine} AND p.lifecycle_status='active' AND p.current_pct IS NOT NULL) AS average_progress_pct`,
      [userId]);

    const r = result.rows[0];
    return {
      myProjects: r.my_projects, pendingConfirmations: r.pending_confirmations,
      reworkAwaitingReview: r.rework, progressUpdatesAwaitingReview: r.updates,
      averageProgressPct: r.average_progress_pct == null ? null : Number(r.average_progress_pct),
    };
};

export const getSpmMetrics = async (userId) => {
    const result = await execute(
      `SELECT
         (SELECT count(DISTINCT t.project_id)::int FROM project_phase_team t
            JOIN projects p ON p.id = t.project_id
           WHERE t.spm_user_id = $1 AND t.status = 'confirmed'
             AND COALESCE(p.is_deleted,false) = false AND p.lifecycle_status <> 'archived') AS assigned_sites,
         (SELECT count(*)::int FROM project_phase_team t
            JOIN projects p ON p.id = t.project_id
           WHERE t.spm_user_id = $1 AND t.status = 'pending'
             AND COALESCE(p.is_deleted,false) = false) AS pending_phases,
         (SELECT count(*)::int FROM project_phase_team t
            JOIN projects p ON p.id = t.project_id
           WHERE t.spm_user_id=$1 AND t.status='confirmed'
             AND COALESCE(p.is_deleted,false)=false AND p.lifecycle_status='active') AS active_phases,
         (SELECT min(t.response_deadline_at) FROM project_phase_team t
            JOIN projects p ON p.id = t.project_id
           WHERE t.spm_user_id = $1 AND t.status = 'pending' AND t.response_deadline_at > now()
             AND COALESCE(p.is_deleted,false) = false) AS next_deadline`,
      [userId]);

    const r = result.rows[0];
    return { assignedSites: r.assigned_sites, activePhases: r.active_phases,
      pendingPhaseAcceptance: r.pending_phases, nextDeadline: r.next_deadline };
};

export const getClientMetrics = async (userId) => {
    const result = await execute(
      `SELECT p.id, p.name, ps.code AS current_stage, p.current_pct,
              (SELECT max(h.recorded_at) FROM project_progress_history h
                WHERE h.project_id = p.id AND h.is_client_visible = true AND h.is_issue = false) AS last_updated_at
         FROM user_client_project_links l
         JOIN projects p ON p.id = l.project_id
         LEFT JOIN project_stages ps ON ps.id = p.current_stage_id
        WHERE l.user_id = $1 AND COALESCE(p.is_deleted,false) = false AND p.lifecycle_status IN ('active','archived')
        ORDER BY last_updated_at DESC NULLS LAST, p.name`,
      [userId]);

    const projects = result.rows.map((r) => ({
      id: r.id, projectName: r.name, currentStage: r.current_stage,
      currentPct: r.current_pct, lastUpdatedAt: r.last_updated_at,
    }));
    const first = projects[0];
    const measured = projects.filter((p) => p.currentPct != null);
    const averageProgressPct = measured.length
      ? Math.round((measured.reduce((sum, p) => sum + Number(p.currentPct), 0) / measured.length) * 100) / 100
      : null;
    return {
      projectName: first?.projectName ?? null, currentStage: first?.currentStage ?? null,
      currentPct: first?.currentPct ?? null, lastUpdatedAt: first?.lastUpdatedAt ?? null,
      projects, totalProjects: projects.length, averageProgressPct,
    };
};

