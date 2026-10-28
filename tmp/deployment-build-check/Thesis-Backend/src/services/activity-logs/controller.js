
import execute from "../../common/utilities/query.utility.js";

import {
  requireUser,
  sendOk,
  sendError,
  handleError
} from "../../common/utilities/access.utility.js";

export const getActivityLogs = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);

    if (!user) return;

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return sendError(res, "Invalid pagination values.", 400);
    }

    const offset = (page - 1) * limit;

    const { table_name, operation } = req.query;

    const normalizedOperation = operation
      ? String(operation).toUpperCase()
      : null;

    if (
      normalizedOperation &&
      !["INSERT", "UPDATE", "DELETE"].includes(normalizedOperation)
    ) {
      return sendError(res, "Invalid operation filter.", 400);
    }

    const params = [];
    const conditions = [];

    if (table_name) {
      params.push(String(table_name));
      conditions.push(`a.table_name = $${params.length}`);
    }

    if (normalizedOperation) {
      params.push(normalizedOperation);
      conditions.push(`a.operation = $${params.length}`);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const countResult = await execute(
      `SELECT COUNT(*)::int AS total
       FROM public.audit_log a
       ${where}`,
      params
    );

    const listParams = [...params, limit, offset];

    const result = await execute(
      `SELECT
         a.id,
         a.table_name,
         a.record_id,
         a.operation,
         a.changed_at,
         a.changed_by,
         u.full_name AS performed_by,
         u.email AS performed_by_email
       FROM public.audit_log a
       LEFT JOIN public.users u
         ON u.id = a.changed_by
       ${where}
       ORDER BY a.changed_at DESC, a.id DESC
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      listParams
    );

    return sendOk(
      res,
      "Activity logs retrieved successfully.",
      result.rowCount,
      {
        total: countResult.rows[0].total,
        page,
        limit,
        logs: result.rows
      }
    );

  } catch (error) {
    return handleError(res, error);
  }
};
