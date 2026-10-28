import { createIntake } from "./intake.controller.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import {
  HttpError, handleError, sendOk, sendError, requireUser, isUuid,
} from "../../common/utilities/access.utility.js";
import { phaseProject } from "../progress/phase.utility.js";
export { getProjects, getProjectById } from "./read.controller.js";
export const createProject = createIntake;

const EDITABLE = ["name", "client_name", "floor_area_sqm", "floor_count", "target_start_date", "crew_required"];

export const updateProject = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm"]);
    if (!user) return;
    if (!isUuid(req.params.id)) return sendError(res, "Invalid project id.", 400);
    const body = req.body || {};
    if (Object.keys(body).some(key => !EDITABLE.includes(key))) {
      return sendError(res, "Only project details and crew_required can be edited here. Use phase endpoints for progress.", 400);
    }
    if (!Object.keys(body).length) return sendError(res, "No editable fields provided.", 400);
    for (const field of ["name", "client_name"]) {
      if (body[field] !== undefined && (typeof body[field] !== "string" || !body[field].trim() ||
          body[field].length > (field === "name" ? 200 : 150))) {
        return sendError(res, `Invalid ${field}.`, 400);
      }
    }
    if (body.floor_area_sqm !== undefined && (typeof body.floor_area_sqm !== "number" ||
        !Number.isFinite(body.floor_area_sqm) || body.floor_area_sqm <= 0 || body.floor_area_sqm >= 100000000)) {
      return sendError(res, "floor_area_sqm must be a positive number below 100000000.", 400);
    }
    for (const field of ["floor_count", "crew_required"]) {
      if (body[field] !== undefined && (!Number.isInteger(body[field]) ||
          body[field] < (field === "floor_count" ? 1 : 0) || body[field] > 32767)) {
        return sendError(res, `Invalid ${field}.`, 400);
      }
    }
    if (body.target_start_date !== undefined &&
        (typeof body.target_start_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.target_start_date) ||
         Number.isNaN(Date.parse(body.target_start_date)) ||
         new Date(body.target_start_date).toISOString().slice(0, 10) !== body.target_start_date)) {
      return sendError(res, "target_start_date must be a valid YYYY-MM-DD date.", 400);
    }
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id);
      if (p.lifecycle_status === "archived") throw new HttpError(409, "Archived projects cannot be edited.");
      const params = [p.id, user.id];
      const sets = EDITABLE.filter(field => body[field] !== undefined).map(field => {
        params.push(typeof body[field] === "string" ? body[field].trim() : body[field]);
        return `${field} = $${params.length}`;
      });
      const result = await client.query(
        `UPDATE projects SET ${sets.join(", ")}, updated_by = $2, updated_at = now()
          WHERE id = $1 RETURNING id, name, client_name, floor_area_sqm, floor_count, target_start_date, crew_required`, params);
      return result.rows[0];
    });
    return sendOk(res, "Project updated.", 1, data);
  } catch (error) { return handleError(res, error); }
};

export const deleteProject = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    if (!isUuid(req.params.id)) return sendError(res, "Invalid project id.", 400);
    await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id);
      await client.query(
        `UPDATE projects SET is_deleted = true, deleted_at = now(), deleted_by = $2, lifecycle_status = 'archived',
          archived_at = COALESCE(archived_at, now()), updated_by = $2, updated_at = now()
          WHERE id = $1`, [p.id, user.id]);
      await client.query(
        `UPDATE project_engineers SET unassigned_at = now(), updated_by = $2, updated_at = now()
          WHERE project_id = $1 AND unassigned_at IS NULL`, [p.id, user.id]);
      await client.query(
        `UPDATE subcontractor_workers SET current_project_id = NULL, current_project_until = NULL,
          availability_status = 'available', updated_by = $2, updated_at = now()
          WHERE current_project_id = $1`, [p.id, user.id]);
      await client.query(
        `UPDATE project_subcontractor_assignments SET status = 'released', released_at = now(),
          updated_by = $2, updated_at = now() WHERE project_id = $1 AND status = 'active'`, [p.id, user.id]);
      await client.query("UPDATE projects SET crew_assigned = 0 WHERE id = $1", [p.id]);
    });
    return res.status(204).send();
  } catch (error) { return handleError(res, error); }
};
