import { archiveNote,recordArchiveEvent } from "../archive/audit.utility.js";
import { v4 as uuidv4 } from "uuid";
import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import {
  HttpError, handleError, sendOk, sendError, requireUser,
  hasProjectAccess, isProjectOpmOrAdmin, isUuid, paging,
} from "../../common/utilities/access.utility.js";


const READ_ROLES = ["admin", "opm", "spm"];
const WRITE_ROLES = ["admin", "spm"];
const DECIDE_ROLES = ["admin", "opm"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resolveLookup = async (db, table, { code, id }) => {
  if (id !== undefined && id !== null) {
    if (!Number.isInteger(id)) throw new HttpError(400, `${table} id must be an integer.`);
    const r = await db(`SELECT id FROM ${table} WHERE id = $1`, [id]);
    if (r.rowCount === 0) throw new HttpError(400, `Unknown ${table} id.`);
    return r.rows[0].id;
  }
  if (code) {
    const r = await db(`SELECT id FROM ${table} WHERE code = $1`, [code]);
    if (r.rowCount === 0) throw new HttpError(400, `Unknown ${table} code: ${code}`);
    return r.rows[0].id;
  }
  return null;
};

const syncCrewAssigned = async (client, projectId, userId) => {
  if (!projectId) return;
  await client.query(
    `UPDATE projects
        SET crew_assigned = (SELECT count(*) FROM subcontractor_workers
                              WHERE current_project_id = $1 AND availability_status = 'assigned'),
            updated_by = $2, updated_at = now()
      WHERE id = $1`,
    [projectId, userId]
  );
};

const LICENSE_SOON_DAYS = 30;
const WORKLOAD = ["busy", "not_busy"];
const LICENSE_STATUSES = ["valid", "expiring_soon", "expired", "na"];
const AVAILABILITY = ["assigned", "available"];

const HAS_LICENSE = `NULLIF(btrim(w.license_number), '') IS NOT NULL`;

const DIRECTORY_CTE = `
WITH crew AS (
  SELECT w.subcontractor_id,
         count(*) FILTER (WHERE w.status = 'active')::int AS crew_count,
         count(*) FILTER (WHERE w.status = 'active' AND ${HAS_LICENSE})::int AS licensed_count,
         count(*) FILTER (WHERE w.status = 'active' AND ${HAS_LICENSE}
                            AND w.license_expiry < current_date)::int AS expired_count,
         count(*) FILTER (WHERE w.status = 'active' AND ${HAS_LICENSE}
                            AND w.license_expiry >= current_date
                            AND w.license_expiry <= current_date + ${LICENSE_SOON_DAYS})::int AS expiring_count
    FROM subcontractor_workers w
   GROUP BY w.subcontractor_id
),
commitments AS (
  SELECT a.subcontractor_id, a.project_id
    FROM project_subcontractor_assignments a
   WHERE a.status = 'active'
  UNION
  SELECT w.subcontractor_id, w.current_project_id
    FROM subcontractor_workers w
   WHERE w.status = 'active' AND w.availability_status = 'assigned' AND w.current_project_id IS NOT NULL
),
load AS (
  SELECT c.subcontractor_id,
         count(*)::int AS project_count,
         array_agg(p.name::text ORDER BY p.name::text) AS project_names
    FROM commitments c
    JOIN projects p ON p.id = c.project_id
     AND COALESCE(p.is_deleted, false) = false
     AND p.lifecycle_status <> 'archived'
   GROUP BY c.subcontractor_id
),
disc AS (
  SELECT w.subcontractor_id,
         array_agg(DISTINCT d.code::text ORDER BY d.code::text) AS disciplines
    FROM subcontractor_workers w
    JOIN disciplines d ON d.id = w.discipline_id
   WHERE w.status = 'active'
   GROUP BY w.subcontractor_id
),
dir AS (
  SELECT s.id, s.company_name, t.code::text AS trade, s.source, s.directory_status,
         s.contact_email::text AS contact_email, s.meta_description,
         s.committed_until::text AS committed_until,
         COALESCE(c.crew_count, 0) AS crew_count,
         COALESCE(c.licensed_count, 0) AS licensed_count,
         CASE WHEN COALESCE(c.licensed_count, 0) = 0 THEN 'na'
              WHEN c.expired_count > 0 THEN 'expired'
              WHEN c.expiring_count > 0 THEN 'expiring_soon'
              ELSE 'valid' END AS license_status,
         COALESCE(l.project_count, 0) AS project_count,
         COALESCE(l.project_names, '{}'::text[]) AS assigned_projects,
         COALESCE(l.project_count, 0) >= 2 AS is_busy,
         CASE WHEN COALESCE(l.project_count, 0) >= 1 THEN 'assigned' ELSE 'available' END AS availability,
         COALESCE(dc.disciplines, '{}'::text[]) AS disciplines,
         cp.full_name AS contact_person_name, cp.role_title AS contact_person_role, cp.phone AS contact_phone
    FROM subcontractors s
    JOIN trades t ON t.id = s.trade_id
    LEFT JOIN crew c ON c.subcontractor_id = s.id
    LEFT JOIN load l ON l.subcontractor_id = s.id
    LEFT JOIN disc dc ON dc.subcontractor_id = s.id
    LEFT JOIN LATERAL (
      SELECT w.full_name, w.role_title, w.phone
        FROM subcontractor_workers w
       WHERE w.subcontractor_id = s.id AND w.status = 'active'
       ORDER BY COALESCE(w.role_title ILIKE '%foreman%', false) DESC, w.full_name
       LIMIT 1) cp ON true
   WHERE COALESCE(s.is_deleted, false) = false
)`;

const isAll = (v) => v === undefined || v === null || v === "" || String(v).toLowerCase() === "all";

const initialsOf = (name) =>
  String(name).split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join("");

export const getSubcontractors = async (req, res) => {
  try {
    const user = await requireUser(req, res, READ_ROLES);
    if (!user) return;
    const { limit, offset } = paging(req, 50, 100);
    const qs = req.query;

    const params = [];
    const where = [];
    const add = (sql, value) => { params.push(value); where.push(sql.replaceAll("?", `$${params.length}`)); };

    if (!isAll(qs.q)) {
      const like = `%${String(qs.q).trim().replace(/[\\%_]/g, "\\$&")}%`;
      add(`(dir.company_name ILIKE ? OR dir.trade ILIKE ?
            OR EXISTS (SELECT 1 FROM subcontractor_workers w
                        WHERE w.subcontractor_id = dir.id AND w.full_name ILIKE ?))`, like);
    }
    if (!isAll(qs.workload)) {
      if (!WORKLOAD.includes(qs.workload)) return sendError(res, `workload must be one of: ${WORKLOAD.join(", ")}.`, 400);
      where.push(qs.workload === "busy" ? "dir.is_busy = true" : "dir.is_busy = false");
    }
    if (!isAll(qs.license_status)) {
      if (!LICENSE_STATUSES.includes(qs.license_status)) return sendError(res, `license_status must be one of: ${LICENSE_STATUSES.join(", ")}.`, 400);
      add("dir.license_status = ?", qs.license_status);
    }
    if (!isAll(qs.availability)) {
      if (!AVAILABILITY.includes(qs.availability)) return sendError(res, `availability must be one of: ${AVAILABILITY.join(", ")}.`, 400);
      add("dir.availability = ?", qs.availability);
    }
    if (!isAll(qs.discipline)) {
      add("EXISTS (SELECT 1 FROM unnest(dir.disciplines) AS dd WHERE lower(dd) = lower(?))", String(qs.discipline));
    }
    if (!isAll(qs.trade)) add("lower(dir.trade) = lower(?)", String(qs.trade));
    if (!isAll(qs.source)) {
      if (!["system_matched", "directory"].includes(qs.source)) return sendError(res, "Invalid source.", 400);
      add("dir.source = ?", qs.source);
    }
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [total, rows, summary, rosters] = await Promise.all([
      execute(`${DIRECTORY_CTE} SELECT count(*)::int AS n FROM dir ${whereClause}`, params),
      execute(
        `${DIRECTORY_CTE} SELECT * FROM dir ${whereClause}
          ORDER BY dir.company_name ASC, dir.id ASC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]),
      execute(`${DIRECTORY_CTE} SELECT count(*)::int AS companies, count(*) FILTER (WHERE is_busy)::int AS busy FROM dir`),
      execute(
        `SELECT d.code::text AS discipline, count(*)::int AS laborers
           FROM subcontractor_workers w JOIN disciplines d ON d.id = w.discipline_id
          WHERE w.status = 'active' GROUP BY d.code`),
    ]);

    const laborersByDiscipline = new Map(rosters.rows.map((r) => [r.discipline, r.laborers]));
    const data = rows.rows.map((r) => ({
      id: r.id,
      company_name: r.company_name,
      directory_status:r.directory_status,
      initials: initialsOf(r.company_name),
      trade: r.trade,
      disciplines: r.disciplines,
      source: r.source,
      contact_phone: r.contact_phone,
      contact_email: r.contact_email,
      contact_person: r.contact_person_name
        ? { name: r.contact_person_name, role_title: r.contact_person_role } : null,
      crew_count: r.crew_count,
      licensed_crew_count: r.licensed_count,
      license_status: r.license_status,
      availability: r.availability,
      is_busy: r.is_busy,
      assigned_projects: r.assigned_projects,
      committed_until: r.committed_until,
      discipline_rosters: r.disciplines.map((d) => ({ discipline: d, laborers_on_file: laborersByDiscipline.get(d) ?? 0 })),
    }));

    return res.status(200).json({
      code: 200,
      message: "Resources retrieved successfully.",
      count: total.rows[0].n,
      data,
      meta: { companies: summary.rows[0].companies, busy: summary.rows[0].busy },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getSubcontractorById = async (req, res) => {
  try {
    const user = await requireUser(req, res, READ_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid subcontractor id.", 400);

    const found = await execute(
      `SELECT s.id, s.company_name, t.code AS trade, s.source, s.contact_email,
              s.meta_description, s.committed_until
         FROM subcontractors s JOIN trades t ON t.id = s.trade_id
        WHERE s.id = $1 AND COALESCE(s.is_deleted, false) = false`, [id]);
    if (found.rowCount === 0) return sendError(res, "Subcontractor not found.", 404);

    const workers = await execute(
      `SELECT w.id, w.full_name, w.role_title, w.status, w.availability_status
         FROM subcontractor_workers w WHERE w.subcontractor_id = $1 ORDER BY w.full_name`, [id]);
    return sendOk(res, "Resource retrieved successfully.", 1, { ...found.rows[0], workers: workers.rows });
  } catch (error) {
    return handleError(res, error);
  }
};

export const createSubcontractor = async (req, res) => {
  try {
    const user = await requireUser(req, res, WRITE_ROLES);
    if (!user) return;
    const b = req.body || {};
    if (!b.company_name || !String(b.company_name).trim()) return sendError(res, "company_name is required.", 400);
    if (b.contact_email && !EMAIL_RE.test(b.contact_email)) return sendError(res, "contact_email is not a valid email.", 400);

    const tradeId = await resolveLookup(execute, "trades", { code: b.trade, id: b.trade_id });
    if (tradeId === null) return sendError(res, "trade (code) or trade_id is required.", 400);

    const result = await execute(
      `INSERT INTO subcontractors
         (id, company_name, trade_id, contact_email, meta_description, source, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'directory', $6, $6)
       RETURNING id, company_name, source`,
      [uuidv4(), String(b.company_name).trim(), tradeId, b.contact_email ?? null, b.meta_description ?? null, user.id]
    );
    return sendOk(res, "Subcontractor created.", 1, { ...result.rows[0], trade: b.trade ?? null }, 201);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getWorkers = async (req, res) => {
  try {
    const user = await requireUser(req, res, READ_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid subcontractor id.", 400);

    const exists = await execute(`SELECT 1 FROM subcontractors WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [id]);
    if (exists.rowCount === 0) return sendError(res, "Subcontractor not found.", 404);

    const result = await execute(
      `SELECT w.id, w.full_name, w.role_title, w.phone, w.status, d.code AS discipline,
              w.license_number, w.license_expiry, w.availability_status, w.availability_note,
              w.current_project_id, w.current_project_until
         FROM subcontractor_workers w
         LEFT JOIN disciplines d ON d.id = w.discipline_id
        WHERE w.subcontractor_id = $1
        ORDER BY w.full_name`, [id]);
    return sendOk(res, "Resources retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

export const addWorker = async (req, res) => {
  try {
    const user = await requireUser(req, res, WRITE_ROLES);
    if (!user) return;
    const { id } = req.params;
    const b = req.body || {};
    if (!isUuid(id)) return sendError(res, "Invalid subcontractor id.", 400);
    if (!b.full_name || !String(b.full_name).trim()) return sendError(res, "full_name is required.", 400);
    if (b.license_expiry && Number.isNaN(Date.parse(b.license_expiry))) return sendError(res, "license_expiry must be a valid date.", 400);

    const exists = await execute(`SELECT 1 FROM subcontractors WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [id]);
    if (exists.rowCount === 0) return sendError(res, "Subcontractor not found.", 404);

    const disciplineId = await resolveLookup(execute, "disciplines", { code: b.discipline, id: b.discipline_id });

    const result = await execute(
      `INSERT INTO subcontractor_workers
         (id, subcontractor_id, full_name, role_title, phone, status, discipline_id,
          license_number, license_expiry, availability_status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, 'available', $9, $9)
       RETURNING id, full_name, status, availability_status`,
      [uuidv4(), id, String(b.full_name).trim(), b.role_title ?? null, b.phone ?? null,
       disciplineId, b.license_number ?? null, b.license_expiry ?? null, user.id]
    );
    return sendOk(res, "Worker added.", 1, result.rows[0], 201);
  } catch (error) {
    return handleError(res, error);
  }
};

const WORKER_PLAIN = ["full_name", "role_title", "phone", "license_number", "license_expiry", "availability_note"];

export const updateWorker = async (req, res) => {
  try {
    const user = await requireUser(req, res, WRITE_ROLES);
    if (!user) return;
    const { id } = req.params;
    const b = req.body || {};
    if (!isUuid(id)) return sendError(res, "Invalid worker id.", 400);
    if (b.status !== undefined && !["active", "inactive"].includes(b.status)) return sendError(res, "status must be 'active' or 'inactive'.", 400);
    if (b.availability_status !== undefined && !["assigned", "available"].includes(b.availability_status)) {
      return sendError(res, "availability_status must be 'assigned' or 'available'.", 400);
    }
    if (b.current_project_id && !isUuid(b.current_project_id)) return sendError(res, "current_project_id must be a valid UUID.", 400);
    if (b.license_expiry && Number.isNaN(Date.parse(b.license_expiry))) return sendError(res, "license_expiry must be a valid date.", 400);

    const data = await withTransaction(async (client) => {
      const db = (sql, params) => client.query(sql, params);
      const found = await client.query(
        `SELECT id, availability_status, current_project_id FROM subcontractor_workers WHERE id = $1 FOR UPDATE`, [id]);
      if (found.rowCount === 0) throw new HttpError(404, "Worker not found.");
      const w = found.rows[0];

      const sets = [];
      const params = [id];
      const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

      for (const f of WORKER_PLAIN) if (b[f] !== undefined) set(f, b[f]);
      if (b.status !== undefined) set("status", b.status);
      if (b.discipline !== undefined || b.discipline_id !== undefined) {
        set("discipline_id", await resolveLookup(db, "disciplines", { code: b.discipline, id: b.discipline_id }));
      }

      let newProject = w.current_project_id;
      if (b.availability_status === "assigned") {
        const target = b.current_project_id ?? w.current_project_id;
        if (!target) throw new HttpError(422, "current_project_id is required when availability_status is 'assigned'.");
        if (w.availability_status === "assigned" && w.current_project_id && w.current_project_id !== target) {
          throw new HttpError(409, "Worker is already assigned to another project. Set them 'available' first.");
        }
        const p = await client.query(
          `SELECT lifecycle_status FROM projects WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [target]);
        if (p.rowCount === 0) throw new HttpError(404, "Project not found.");
        if (p.rows[0].lifecycle_status === "archived") throw new HttpError(422, "Cannot assign to an archived project.");
        set("availability_status", "assigned");
        set("current_project_id", target);
        if (b.current_project_until !== undefined) set("current_project_until", b.current_project_until);
        newProject = target;
      } else if (b.availability_status === "available") {
        set("availability_status", "available");
        set("current_project_id", null);
        set("current_project_until", null);
        newProject = null;
      } else if (b.current_project_id !== undefined || b.current_project_until !== undefined) {
        throw new HttpError(422, "Set availability_status to 'assigned' (with current_project_id) to change the project link.");
      }

      if (sets.length === 0) throw new HttpError(400, "No editable fields provided.");
      params.push(user.id);
      const updated = await client.query(
        `UPDATE subcontractor_workers SET ${sets.join(", ")}, updated_by = $${params.length}, updated_at = now()
          WHERE id = $1
          RETURNING id, status, availability_status, current_project_id, current_project_until`, params);

      await syncCrewAssigned(client, w.current_project_id, user.id);
      if (newProject !== w.current_project_id) await syncCrewAssigned(client, newProject, user.id);
      return updated.rows[0];
    });
    return sendOk(res, "Worker updated.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const replaceWorkerCertifications = async (req, res) => {
  try {
    const user = await requireUser(req, res, WRITE_ROLES);
    if (!user) return;
    const { id } = req.params;
    const codes = req.body?.certification_type_codes;
    if (!isUuid(id)) return sendError(res, "Invalid worker id.", 400);
    if (!Array.isArray(codes) || codes.some((c) => typeof c !== "string")) {
      return sendError(res, "certification_type_codes must be an array of strings.", 400);
    }

    const data = await withTransaction(async (client) => {
      const exists = await client.query(`SELECT 1 FROM subcontractor_workers WHERE id = $1`, [id]);
      if (exists.rowCount === 0) throw new HttpError(404, "Worker not found.");
      const types = await client.query(`SELECT id, code FROM certification_types WHERE code = ANY($1::text[])`, [codes]);
      const unknown = codes.filter((c) => !types.rows.some((t) => t.code === c));
      if (unknown.length > 0) throw new HttpError(400, `Unknown certification code(s): ${unknown.join(", ")}`);

      await client.query(`DELETE FROM worker_certifications WHERE worker_id = $1`, [id]);
      for (const t of types.rows) {
        await client.query(
          `INSERT INTO worker_certifications (worker_id, certification_type_id, created_by, updated_by)
           VALUES ($1, $2, $3, $3)`, [id, t.id, user.id]);
      }
      return { worker_id: id, certifications: types.rows.map((t) => t.code) };
    });
    return sendOk(res, "Certifications replaced.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getWorkerHistory = async (req, res) => {
  try {
    const user = await requireUser(req, res, READ_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid worker id.", 400);
    const exists = await execute(`SELECT 1 FROM subcontractor_workers WHERE id = $1`, [id]);
    if (exists.rowCount === 0) return sendError(res, "Worker not found.", 404);

    const result = await execute(
      `SELECT id, external_project_name, role_title, period_start, period_end
         FROM worker_employment_history WHERE worker_id = $1
        ORDER BY period_start DESC NULLS LAST`, [id]);
    return sendOk(res, "Resources retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};


export const getMatches = async (req, res) => {
  try {
    const user = await requireUser(req, res, DECIDE_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);
    if (!(await hasProjectAccess(user, id))) return sendError(res, "Project not found.", 404);

    const result = await execute(
      `SELECT m.subcontractor_id, s.company_name, t.code AS trade, m.match_score, m.cert_coverage_pct
         FROM project_subcontractor_matches m
         JOIN subcontractors s ON s.id = m.subcontractor_id
         JOIN trades t ON t.id = s.trade_id
        WHERE m.project_id = $1 AND COALESCE(s.is_deleted,false) = false
        ORDER BY m.match_score DESC NULLS LAST`, [id]);
    return sendOk(res, "Resources retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

export const createRequest = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["spm"]);
    if (!user) return;
    const { id } = req.params;
    const { subcontractor_id } = req.body || {};
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);
    if (!isUuid(subcontractor_id)) return sendError(res, "subcontractor_id must be a valid UUID.", 400);

    const data = await withTransaction(async (client) => {
      const db = (sql, params) => client.query(sql, params);
      const project = await client.query(
        `SELECT id, name, target_start_date, lifecycle_status FROM projects
          WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [id]);
      if (project.rowCount === 0 || !(await hasProjectAccess(user, id, client))) throw new HttpError(404, "Project not found.");
      const p = project.rows[0];
      if (p.lifecycle_status === "archived") throw new HttpError(422, "Cannot request subcontractors for an archived project.");

      const sub = await client.query(
        `SELECT id, company_name, trade_id, committed_until FROM subcontractors
          WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [subcontractor_id]);
      if (sub.rowCount === 0) throw new HttpError(404, "Subcontractor not found.");
      const s = sub.rows[0];

      const tradeId = (await resolveLookup(db, "trades", { code: req.body.trade, id: req.body.trade_id })) ?? s.trade_id;

      const dup = await client.query(
        `SELECT 1 FROM pending_subcontractor_requests
          WHERE project_id = $1 AND subcontractor_id = $2 AND status = 'pending'
         UNION ALL
         SELECT 1 FROM project_subcontractor_assignments
          WHERE project_id = $1 AND subcontractor_id = $2 AND status = 'active'`, [id, subcontractor_id]);
      if (dup.rowCount > 0) throw new HttpError(409, "This subcontractor already has a pending request or active assignment on this project.");

      let hasConflict = false;
      let conflictDetail;
      if (s.committed_until && p.target_start_date && new Date(s.committed_until) > new Date(p.target_start_date)) {
        hasConflict = true;
        const until = new Date(s.committed_until).toISOString().slice(0, 10);
        const start = new Date(p.target_start_date).toISOString().slice(0, 10);
        conflictDetail = `Committed to another project until ${until}, past this project's ${start} start.`;
      }

      const inserted = await client.query(
        `INSERT INTO pending_subcontractor_requests
           (id, project_id, subcontractor_id, trade_id, requested_by, requested_at, has_conflict, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, now(), $6, 'pending', $5, $5)
         RETURNING id, project_id, subcontractor_id, has_conflict, status`,
        [uuidv4(), id, subcontractor_id, tradeId, user.id, hasConflict]);
      return conflictDetail ? { ...inserted.rows[0], conflict_detail: conflictDetail } : inserted.rows[0];
    });
    return sendOk(res, "Subcontractor request submitted.", 1, data, 201);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getRequests = async (req, res) => {
  try {
    const user = await requireUser(req, res, DECIDE_ROLES);
    if (!user) return;
    const { limit, offset } = paging(req);

    const params = [limit, offset];
    let scope = "";
    if (user.role === "opm") {
      params.push(user.id);
      scope = `AND (p.suggested_opm_id = $3 OR EXISTS (
                 SELECT 1 FROM project_engineers pe
                  WHERE pe.project_id = p.id AND pe.user_id = $3 AND pe.unassigned_at IS NULL))`;
    }
    const result = await execute(
      `SELECT r.id, r.project_id, p.name AS project_name, r.subcontractor_id,
              s.company_name AS subcontractor_name, t.code AS trade,
              r.has_conflict, s.committed_until, r.status, r.requested_at
         FROM pending_subcontractor_requests r
         JOIN projects p ON p.id = r.project_id
         JOIN subcontractors s ON s.id = r.subcontractor_id
         LEFT JOIN trades t ON t.id = COALESCE(r.trade_id, s.trade_id)
        WHERE r.status = 'pending' ${scope}
        ORDER BY r.has_conflict DESC, r.requested_at ASC
        LIMIT $1 OFFSET $2`, params);
    return sendOk(res, "Resources retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

export const approveRequest = async (req, res) => {
  try {
    const user = await requireUser(req, res, DECIDE_ROLES);
    if (!user) return;
    const { id } = req.params;
    const note=archiveNote(req.body?.note ?? req.body?.resolution_note);
    if (!isUuid(id)) return sendError(res, "Invalid request id.", 400);

    const data = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT r.id, r.project_id, r.subcontractor_id, r.status, COALESCE(r.trade_id, s.trade_id) AS trade_id
           FROM pending_subcontractor_requests r
           JOIN subcontractors s ON s.id = r.subcontractor_id
          WHERE r.id = $1 FOR UPDATE OF r`, [id]);
      if (found.rowCount === 0) throw new HttpError(404, "Request not found.");
      const r = found.rows[0];
      if (!(await isProjectOpmOrAdmin(user, r.project_id, client))) throw new HttpError(404, "Request not found.");
      const project=await client.query("SELECT lifecycle_status FROM projects WHERE id=$1 FOR UPDATE",[r.project_id]);
      if(project.rows[0]?.lifecycle_status==="archived") throw new HttpError(409,"Archived projects are read-only.");
      if (r.status !== "pending") throw new HttpError(409, `Request is already ${r.status}.`);

      const active = await client.query(
        `SELECT 1 FROM project_subcontractor_assignments
          WHERE project_id = $1 AND subcontractor_id = $2 AND status = 'active'`, [r.project_id, r.subcontractor_id]);
      if (active.rowCount > 0) throw new HttpError(409, "This subcontractor is already actively assigned to the project.");

      const available = await client.query(
        `SELECT id FROM subcontractor_workers
          WHERE subcontractor_id = $1 AND status = 'active' AND availability_status = 'available'
          ORDER BY id FOR UPDATE`, [r.subcontractor_id]);
      const workerCount = available.rowCount;
      if (!workerCount) throw new HttpError(422, 'This subcontractor has no available active workers.');

      const assignment = await client.query(
        `INSERT INTO project_subcontractor_assignments
           (id, project_id, subcontractor_id, trade_id, worker_count, status, assigned_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, 'active', now(), $6, $6)
         RETURNING id`, [uuidv4(), r.project_id, r.subcontractor_id, r.trade_id, workerCount, user.id]);

      await client.query(
        `UPDATE pending_subcontractor_requests
            SET status = 'approved', resolved_by = $2, resolved_at = now(), updated_by = $2, updated_at = now()
          WHERE id = $1`, [id, user.id]);
      await client.query(
        `UPDATE subcontractor_workers SET availability_status = 'assigned', current_project_id = $2,
          current_project_until = NULL, updated_by = $3, updated_at = now() WHERE id = ANY($1::uuid[])`,
        [available.rows.map(w => w.id), r.project_id, user.id]);
      await syncCrewAssigned(client, r.project_id, user.id);
      await recordArchiveEvent(client,user.id,"pending_subcontractor_requests",id,"subcontractor_decision",{project_id:r.project_id,status:"approved",note});
      return { id, status: "approved", assignment_id: assignment.rows[0].id, worker_count: workerCount };
    });
    return sendOk(res, "Request approved.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const rejectRequest = async (req, res) => {
  try {
    const user = await requireUser(req, res, DECIDE_ROLES);
    if (!user) return;
    const { id } = req.params;
    const note=archiveNote(req.body?.reason ?? req.body?.note ?? req.body?.resolution_note,true);
    if (!isUuid(id)) return sendError(res, "Invalid request id.", 400);

    const data = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT id, project_id, status FROM pending_subcontractor_requests WHERE id = $1 FOR UPDATE`, [id]);
      if (found.rowCount === 0) throw new HttpError(404, "Request not found.");
      const r = found.rows[0];
      if (!(await isProjectOpmOrAdmin(user, r.project_id, client))) throw new HttpError(404, "Request not found.");
      const project=await client.query("SELECT lifecycle_status FROM projects WHERE id=$1 FOR UPDATE",[r.project_id]);
      if(project.rows[0]?.lifecycle_status==="archived") throw new HttpError(409,"Archived projects are read-only.");
      if (r.status !== "pending") throw new HttpError(409, `Request is already ${r.status}.`);

      await client.query(
        `UPDATE pending_subcontractor_requests
            SET status = 'rejected', resolved_by = $2, resolved_at = now(), updated_by = $2, updated_at = now()
          WHERE id = $1`, [id, user.id]);
      await recordArchiveEvent(client,user.id,"pending_subcontractor_requests",id,"subcontractor_decision",{project_id:r.project_id,status:"rejected",note});
      return { id, status: "rejected" };
    });
    return sendOk(res, "Request rejected.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getAssignments = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);
    if (!(await hasProjectAccess(user, id))) return sendError(res, "Project not found.", 404);

    const result = await execute(
      `SELECT a.id, a.subcontractor_id, s.company_name AS subcontractor_name, t.code AS trade,
              a.worker_count, a.status, a.assigned_at
         FROM project_subcontractor_assignments a
         JOIN subcontractors s ON s.id = a.subcontractor_id
         LEFT JOIN trades t ON t.id = a.trade_id
        WHERE a.project_id = $1 AND a.status = 'active'
        ORDER BY a.assigned_at DESC`, [id]);
    return sendOk(res, "Resources retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

export const releaseAssignment = async (req, res) => {
  try {
    const user = await requireUser(req, res, DECIDE_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid assignment id.", 400);

    await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT id, project_id, subcontractor_id, status FROM project_subcontractor_assignments WHERE id = $1 FOR UPDATE`, [id]);
      if (found.rowCount === 0) throw new HttpError(404, "Assignment not found.");
      const a = found.rows[0];
      if (!(await isProjectOpmOrAdmin(user, a.project_id, client))) throw new HttpError(404, "Assignment not found.");
      if (a.status !== "active") throw new HttpError(409, "Assignment is already released.");

      await client.query(
        `UPDATE project_subcontractor_assignments
            SET status = 'released', released_at = now(), updated_by = $2, updated_at = now()
          WHERE id = $1`, [id, user.id]);
      await client.query(
        `UPDATE subcontractor_workers
            SET availability_status = 'available', current_project_id = NULL, current_project_until = NULL,
                updated_by = $3, updated_at = now()
          WHERE subcontractor_id = $1 AND current_project_id = $2`, [a.subcontractor_id, a.project_id, user.id]);
      await syncCrewAssigned(client, a.project_id, user.id);
    });
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
};


const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const downloadCrewCsv = async (req, res) => {
  try {
    const user = await requireUser(req, res, READ_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid subcontractor id.", 400);

    const company = await execute(
      `SELECT company_name FROM subcontractors WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [id]);
    if (company.rowCount === 0) return sendError(res, "Subcontractor not found.", 404);

    const crew = await execute(
      `SELECT w.full_name, w.role_title, d.code AS discipline, w.phone, w.status,
              w.license_number, w.license_expiry::text AS license_expiry,
              CASE WHEN NULLIF(btrim(w.license_number), '') IS NULL THEN 'N/A'
                   WHEN w.license_expiry < current_date THEN 'Expired'
                   WHEN w.license_expiry <= current_date + ${LICENSE_SOON_DAYS} THEN 'Expiring soon'
                   ELSE 'Valid' END AS license_status,
              w.availability_status, p.name AS current_project
         FROM subcontractor_workers w
         LEFT JOIN disciplines d ON d.id = w.discipline_id
         LEFT JOIN projects p ON p.id = w.current_project_id
        WHERE w.subcontractor_id = $1
        ORDER BY w.full_name`, [id]);

    const header = ["Full name", "Role", "Discipline", "Phone", "Status", "License number",
      "License expiry", "License status", "Availability", "Current project"];
    const lines = [header.map(csvCell).join(",")];
    for (const r of crew.rows) {
      lines.push([r.full_name, r.role_title, r.discipline, r.phone, r.status, r.license_number,
        r.license_expiry, r.license_status, r.availability_status, r.current_project].map(csvCell).join(","));
    }

    const fileName = `${company.rows[0].company_name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "crew"}_crew_list.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send("\uFEFF" + lines.join("\r\n") + "\r\n");  
  } catch (error) {
    return handleError(res, error);
  }
};