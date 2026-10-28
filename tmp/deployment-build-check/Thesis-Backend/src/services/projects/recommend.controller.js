import { validatePhaseTeam, validateScopedQualifications } from "./type-phases.utility.js";
import { experienceForProjectSql } from "../accounts/experience.utility.js";
import { businessDeadline } from "../archive/audit.utility.js";

import { errorlog } from "../../common/utilities/logger.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { responseOk, responseError } from "../../common/utilities/response.utility.js";
import { mapMultiple, mapSingle } from "../../common/utilities/dao.utility.js";
import { LICENSE_ELIGIBILITY_SQL, assertEligibleManager } from "../../common/utilities/license-eligibility.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { requireUser, handleError } from "../../common/utilities/access.utility.js";

export const getRecommendations = async (req, res) => {
  try {
    const { project_type, floor_area_sqm, floor_count } = req.query;
    if (!project_type || !Number.isFinite(Number(floor_area_sqm)) || Number(floor_area_sqm) <= 0 ||
        !Number.isInteger(Number(floor_count)) || Number(floor_count) <= 0) {
      return responseError(res, 'project_type, positive floor_area_sqm and floor_count are required.', 400);
    }

    let multipler = 2;
    let tier = 'Small tier base';

    if (floor_area_sqm >= 50000 || floor_count >= 31) {
      multipler = 4;
      tier = 'Large tier base';
    }
    else if (floor_area_sqm >= 15000 || floor_count >= 30) {
      multipler = 3;
      tier = 'Medium tier base';
    }

    const suggested_opm = await getOpm(project_type);
    const suggested_spms = await getSpm(project_type);
    const discipline_slots = await getDisciplineSlots(project_type);

    const suggested_allocation = {
      opm: suggested_opm,
      phase_team: suggested_spms,
      headcount_suggested: discipline_slots * multipler,
      headcount_tier: tier
    }

    responseOk(res, 'Resource retrieved successfully.', 1, suggested_allocation);

  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

export const rerunRecommendations = async (req, res) => {
  try {
    const { project_type, floor_area_sqm, floor_count } = req.query;
    if (!project_type || !Number.isFinite(Number(floor_area_sqm)) || Number(floor_area_sqm) <= 0 ||
        !Number.isInteger(Number(floor_count)) || Number(floor_count) <= 0) {
      return responseError(res, 'project_type, positive floor_area_sqm and floor_count are required.', 400);
    }

    let multipler = 2;
    let tier = 'Small tier base';

    if (floor_area_sqm >= 50000 || floor_count >= 31) {
      multipler = 4;
      tier = 'Large tier base';
    }
    else if (floor_area_sqm >= 15000 || floor_count >= 30) {
      multipler = 3;
      tier = 'Medium tier base';
    }

    const suggested_opm = await getOpm(project_type, true);
    const suggested_spms = await getSpm(project_type, true);

    const suggested_allocation = {
      opm: suggested_opm,
      phase_team: suggested_spms,
      headcount_suggested: (await getDisciplineSlots(project_type)) * multipler,
      headcount_tier: tier
    }

    responseOk(res, 'Resource retrieved successfully.', 1, suggested_allocation);

  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

export const swapOpm = async (req, res) => {
  try {
    const { project_type } = req.query;

    const suggested_opm = await getOpm(project_type, true);

    responseOk(res, 'Resource retrieved successfully.', 1, suggested_opm);

  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

export const updatePhaseTeam = async (req, res) => {
  try {
    const actor = await requireUser(req, res, ['admin', 'opm']);
    if (!actor) return;
    const { project_id, phase_team } = req.body || {};
    if (!project_id || !Array.isArray(phase_team)) {
      return responseError(res, 'project_id and phase_team array are required.', 400);
    }
    const data = await withTransaction(async (client) => {
      // Prevent overwriting an SPM's already confirmed assignments.
      const locked = await client.query(`SELECT id, project_type_id, lifecycle_status, to_jsonb(projects)->'phase_scope' AS phase_scope FROM projects WHERE id = $1 FOR UPDATE`, [project_id]);
      if (!locked.rowCount) throw Object.assign(new Error('Project not found.'), {status:404});
      if(locked.rows[0].lifecycle_status==="archived") throw Object.assign(new Error("Archived projects are read-only."),{status:409});
      const confirmed = await client.query(`SELECT 1 FROM project_phase_team WHERE project_id = $1 AND status = 'confirmed' LIMIT 1`, [project_id]);
      if (confirmed.rowCount) throw Object.assign(new Error('Cannot replace a team after an SPM accepts.'), {status:409});
      if (actor.role === 'opm') {
        const ownership = await client.query(`SELECT 1 FROM project_engineers WHERE project_id=$1 AND user_id=$2 AND unassigned_at IS NULL`, [project_id,actor.id]);
        if (!ownership.rowCount) throw Object.assign(new Error('Not assigned to this project.'), {status:403});
      }
      await validatePhaseTeam(client,locked.rows[0].project_type_id,phase_team,{projectId:project_id});
      for (const stage of phase_team) await assertEligibleManager(client, stage.user_id, 'spm');
      if (locked.rows[0].phase_scope) await validateScopedQualifications(client,locked.rows[0].project_type_id,phase_team);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [actor.id]);
      await client.query('DELETE FROM project_phase_team WHERE project_id = $1', [project_id]);
      const clock=await client.query("SELECT now() AS now");
      const deadline=locked.rows[0].lifecycle_status==="spm_review" ? businessDeadline(clock.rows[0].now) : null;
      for (const [index,stage] of phase_team.entries()) {
        const inserted = await client.query(`INSERT INTO project_phase_team
          (project_id, project_stage_id, spm_user_id, is_lead, status, response_deadline_at, created_by, updated_by)
          SELECT $1, ps.id, $3, $4, 'pending', $6::timestamptz, $5, $5
          FROM project_stages ps WHERE ps.code=$2 RETURNING project_stage_id`,
          [project_id,stage.stage,stage.user_id,locked.rows[0].phase_scope ? index===0 : stage.is_lead ?? false,actor.id,deadline]);
        if (!inserted.rowCount) throw Object.assign(new Error('Unknown project stage.'), {status:422});
      }
      return {project_id, phase_team};
    });
    return responseOk(res, 'Phase team updated.', 1, data);
  } catch (error) {
    if (error.status) return responseError(res, error.message, error.status);
    return handleError(res, error);
  }
};

export const getOpm = async (project_type) => {

  const query = `
      WITH search_params AS (
        SELECT ARRAY[$1::text] AS target_tags
      ),
      user_matches AS (
        SELECT
        upts.user_id as id,
        u.full_name,
        ${experienceForProjectSql("$1")} AS experience_years,
        array_agg(pt.code) FILTER (WHERE upts.project_type_id IS NOT NULL) AS project_types,
        CASE WHEN EXISTS (SELECT 1 FROM project_engineers pe WHERE pe.user_id = u.id AND pe.unassigned_at IS NULL) THEN 'unavailable' ELSE 'available' END AS availability
      FROM user_project_type_specializations upts
      LEFT JOIN project_types pt ON pt.id = upts.project_type_id
      JOIN users u ON u.id = upts.user_id AND u.status = 'active' AND COALESCE(u.is_deleted, false) = false
      JOIN roles r ON r.id = u.role_id AND lower(r.code) = 'opm'

      WHERE ${LICENSE_ELIGIBILITY_SQL}
      GROUP BY upts.user_id, u.full_name, u.id
      ),
      ranked_users AS (
        SELECT
          m.id,
          m.full_name,
          m.experience_years,
          m.project_types,
          m.availability,
          (
            SELECT COUNT(*)
            FROM unnest(m.project_types) tag
            WHERE tag = ANY(p.target_tags)
          ) AS matching_count,
          cardinality(m.project_types) AS total_user_tags,
          cardinality(p.target_tags) AS total_requested_tags
        FROM user_matches m
        CROSS JOIN search_params p
      )
      SELECT
        id AS "MAIN.id",
        full_name AS "MAIN.full_name",
        cast((cast(matching_count as float) / total_requested_tags) * 100 as int) as "MAIN.percentage",
        availability AS "MAIN.availability",
        experience_years AS "MAIN.experience_years"
      FROM ranked_users
      WHERE matching_count > 0 and availability = 'available'
      ORDER BY
        matching_count DESC,
        experience_years DESC,
        total_user_tags ASC, full_name ASC, id ASC
    `;
  const result = await execute(query, [project_type]);

  if (result.rowCount === 0) {
    return null;
  }

  const randomIndex = 0; // Refreshing suggestions must not bypass relevant experience priority.

  return mapSingle(result.rows[randomIndex], 'id');
}

const getSpm = async (project_type) => {
  const matrix_result = await execute(
    `
    SELECT
      pstdl.project_stage_id,
      ps.code,
      jsonb_agg(discipline_id ORDER BY discipline_id ASC) AS disciplines
    FROM project_stage_discipline_links pstdl
    join project_stages ps on ps.id = pstdl.project_stage_id
    join project_type_stages workflow on workflow.project_type_id=pstdl.project_type_id and workflow.project_stage_id=ps.id
    WHERE pstdl.project_type_id = (SELECT id from project_types where code = $1)
    GROUP BY pstdl.project_stage_id, workflow.sort_order, ps.code
    ORDER BY workflow.sort_order ASC;
    `,
    [
      project_type
    ]
  );

  const suggestedSpms = [];

  for (const row of matrix_result.rows) {
    const spm_result = await execute(
      `
        WITH search_params AS (
          SELECT $1::int[] AS target_tags
        ),
        user_matches AS (
          SELECT
            uds.user_id as id,
            u.full_name,
            ${experienceForProjectSql("$2")} AS experience_years,
            array_agg(pt.id) FILTER (WHERE uds.discipline_id IS NOT NULL) AS disciplines,
            CASE WHEN EXISTS (SELECT 1 FROM project_engineers pe WHERE pe.user_id = u.id AND pe.unassigned_at IS NULL) THEN 'unavailable' ELSE 'available' END AS availability
          FROM user_discipline_scopes uds
          LEFT JOIN disciplines pt ON pt.id = uds.discipline_id
          JOIN users u ON u.id = uds.user_id AND u.status = 'active' AND COALESCE(u.is_deleted, false) = false
          JOIN roles r ON r.id = u.role_id AND lower(r.code) = 'spm'

          WHERE ${LICENSE_ELIGIBILITY_SQL}
          GROUP BY uds.user_id, u.full_name, u.id
        ),
        ranked_users AS (
          SELECT
            m.id,
            m.full_name,
            m.experience_years,
            m.disciplines,
            m.availability,
            (
              SELECT COUNT(*)
              FROM unnest(m.disciplines) tag
              WHERE tag = ANY(p.target_tags)
            ) AS matching_count,
            cardinality(m.disciplines) AS total_user_tags,
            cardinality(p.target_tags) AS total_requested_tags
          FROM user_matches m
          CROSS JOIN search_params p
        )
        SELECT
          id AS "MAIN.id",
          full_name AS "MAIN.full_name",
          cast((cast(matching_count as float) / total_requested_tags) * 100 as int) as "MAIN.percentage",
          availability AS "MAIN.availability",
          experience_years AS "MAIN.experience_years"
        FROM ranked_users
        WHERE matching_count > 0 and availability = 'available'
        ORDER BY
        matching_count DESC,
        experience_years DESC,
        total_user_tags ASC, full_name ASC, id ASC
      `, [row.disciplines.map(Number), project_type]
    );

    const details = mapMultiple(spm_result.rows, 'id');

    const randomIndex = 0;

    if (spm_result.rowCount > 0) {
      suggestedSpms.push({
        id: row.project_stage_id,
        stage: row.code,
        is_lead: row.project_stage_id === 1,
        user_id: details[randomIndex].id,
        name: details[randomIndex].full_name,
        percentage: details[randomIndex].percentage
      });
    }
  }

  return suggestedSpms;
}

const getDisciplineSlots = async (project_type) => {
  const result = await execute(
    `
      SELECT
        pt.id AS project_type_id,
        pt.code AS project_type_code,
        COUNT(psdl.discipline_id) AS discipline_slots
      FROM project_types pt
      LEFT JOIN project_stage_discipline_links psdl ON psdl.project_type_id = pt.id
      WHERE pt.code = $1
        AND (
          -- Condition for project_type_id = 1: exclude stages 6 and 7
          (psdl.project_type_id = 1 AND psdl.project_stage_id NOT IN (6, 7))
          OR
          -- Condition for all other project types: count up to stage 6 (stage <= 6)
          (psdl.project_type_id != 1 AND psdl.project_stage_id <= 6)
        )
      GROUP BY pt.id, pt.code;
    `,
    [
      project_type
    ]
  )

  return Number(result.rows[0]?.discipline_slots ?? 0);
}
