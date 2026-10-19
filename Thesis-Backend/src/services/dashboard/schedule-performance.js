import execute from "../../common/utilities/query.utility.js";

export const getSchedulePerformanceData = async (query = {}) => {
    const months = Math.min(36, Math.max(1, parseInt(query.months, 10) || 12));
    const duration = Math.min(120, Math.max(1, parseInt(query.duration_months, 10) || 12));

    const result = await execute(
      `WITH month_ends AS (
         SELECT LEAST(
                  (date_trunc('month', current_date) - (i || ' months')::interval
                     + interval '1 month' - interval '1 day')::date,
                  current_date) AS month_end
           FROM generate_series($1::int - 1, 0, -1) AS i
       ),
       per_project AS (
         SELECT m.month_end, p.id,
                COALESCE((SELECT h.pct FROM project_progress_history h
                           WHERE h.project_id = p.id AND h.is_issue = false
                             AND h.recorded_at::date <= m.month_end
                           ORDER BY h.recorded_at DESC, h.id DESC LIMIT 1), 0) AS actual,
                LEAST(100, GREATEST(0, 100.0 * (m.month_end - p.target_start_date)
                                         / ($2::numeric * 30.4375))) AS planned
           FROM month_ends m
           JOIN projects p
             ON p.target_start_date IS NOT NULL
            AND p.target_start_date <= m.month_end
            AND COALESCE(p.is_deleted, false) = false
            AND p.lifecycle_status IN ('active', 'archived')
       )
       SELECT month_end::text AS date,
              round(avg(planned))::int AS planned_pct,
              round(avg(actual))::int AS actual_pct,
              count(*)::int AS projects
         FROM per_project
        GROUP BY month_end
        ORDER BY month_end`,
      [months, duration]);

    return {
      series: result.rows.map(r => ({date:r.date, plannedPct:r.planned_pct,
         actualPct:r.actual_pct, projects:r.projects})),
      plannedBasis: `Linear from each project's target start date to 100% over ${duration} months (assumption).`,
    };
};
