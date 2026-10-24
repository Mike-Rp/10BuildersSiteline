import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { HttpError, handleError, sendOk, requireUser, isUuid } from "../../common/utilities/access.utility.js";

const ADMIN_ONLY = ["admin"];

// POST /workers/:id/transfer   body: { subcontractor_id }
// Moves a worker to another company. The old ID number is archived and never reused, the worker gets a new
// number from the new company's counter, and the two are linked. Only an Admin can do this.
export const transferWorker = async (req, res) => {
  try {
    const user = await requireUser(req, res, ADMIN_ONLY);
    if (!user) return;
    const { id } = req.params;
    const target = req.body?.subcontractor_id;
    if (!isUuid(id)) throw new HttpError(400, "Invalid worker id.");
    if (!isUuid(target)) throw new HttpError(400, "subcontractor_id must be a valid UUID.");

    const data = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT w.id, w.id_number, w.subcontractor_id, w.availability_status
           FROM subcontractor_workers w WHERE w.id = $1 FOR UPDATE`, [id]);
      if (found.rowCount === 0) throw new HttpError(404, "Worker not found.");
      const worker = found.rows[0];
      const company = await client.query(
        `SELECT id, company_code FROM subcontractors WHERE id = $1 AND COALESCE(is_deleted,false) = false`, [target]);
      if (company.rowCount === 0) throw new HttpError(404, "Subcontractor not found.");
      if (worker.subcontractor_id === target) throw new HttpError(422, "The worker is already in this company.");
      if (worker.availability_status === "assigned")
        throw new HttpError(409, "This worker is assigned to a project. Release them from it before transferring.");
      const moved = await client.query(`SELECT public.transfer_worker($1, $2, $3) AS id_number`, [id, target, user.id]);
      return {
        id, previous_id_number: worker.id_number, id_number: moved.rows[0].id_number,
        subcontractor_id: target, company_code: company.rows[0].company_code,
      };
    });
    return sendOk(res, "Worker transferred.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /workers/:id/id-numbers  Every ID number this worker has held, newest first, with the link to its replacement.
export const getWorkerIdNumbers = async (req, res) => {
  try {
    const user = await requireUser(req, res, ADMIN_ONLY);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid worker id.");
    const rows = await withTransaction((client) => client.query(
      `SELECT n.id_number, n.status, n.issued_at, n.archived_at, n.replaced_by, s.company_code
         FROM worker_id_numbers n JOIN subcontractors s ON s.id = n.subcontractor_id
        WHERE n.worker_id = $1 ORDER BY n.issued_at DESC, n.id DESC`, [id]));
    if (rows.rowCount === 0) throw new HttpError(404, "Worker not found.");
    return sendOk(res, "ID numbers retrieved.", rows.rowCount, rows.rows);
  } catch (error) {
    return handleError(res, error);
  }
};
