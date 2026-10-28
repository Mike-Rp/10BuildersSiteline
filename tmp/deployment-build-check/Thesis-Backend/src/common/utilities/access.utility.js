import jwt from "jsonwebtoken";
import execute from "./query.utility.js";
import { errorlog } from "./logger.utility.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
export const isBigintId = (v) => /^\d+$/.test(String(v));
export const isSmallintId = (v) => /^\d+$/.test(String(v)) && Number(v) > 0 && Number(v) < 32768;

export class HttpError extends Error {
  constructor(status, message, errorCode) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

const STATUS_TEXTS = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

export const sendError = (res, message, code = 500, errorCode) => {
  const status_text = STATUS_TEXTS[code] || "Internal Server Error";
  return res.status(code).json({
    code,
    status_text,
    message,
    error: { code: errorCode || status_text.toUpperCase().replace(/ /g, "_"), message },
  });
};

export const sendOk = (res, message, count, data, code = 200) =>
  res.status(code).json({ code, message, count: parseInt(count), data });

/** Standard catch block for every handler. */
export const handleError = (res, error) => {
  if (error instanceof HttpError) return sendError(res, error.message, error.status, error.errorCode);
  if (error.code === "23503") return sendError(res, "A referenced record does not exist.", 400);
  if (error.code === "23505") return sendError(res, "A record with these values already exists.", 409);
  errorlog(error);
  // A missing column, table or function means the database is behind the code: say so, without raw SQL.
  if (["42703", "42P01", "42883"].includes(error.code))
    return sendError(res, "The database is missing a required update. Ask an administrator to run the pending database migrations, then try again.", 503);
  // Driver and SQL text stays in the server log on hosted deployments.
  const hosted = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  return sendError(res, hosted ? "Internal server error." : error.message, 500);
};


export const paging = (req, defaultLimit = 20, maxLimit = 100) => ({
  limit: Math.min(maxLimit, Math.max(1, parseInt(req.query.limit ?? req.query.pageSize, 10) || defaultLimit)),
  offset: Math.max(0, parseInt(req.query.offset, 10) || ((Math.max(1,Number(req.query.page)||1)-1)*Math.min(maxLimit,Math.max(1,Number(req.query.limit ?? req.query.pageSize)||defaultLimit)))),
});

const extractToken = (req) => {
  const header = req.headers?.authorization;
  if (!header || typeof header !== "string") return null;
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  return token || null;
};

export const getCurrentUser = async (req) => {
  const token = extractToken(req);
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null; // bad signature or expired
  }

  const result = await execute(
    `SELECT u.id, u.full_name, r.code AS role
       FROM users_token t
       JOIN users u ON u.id = t.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE t.token = $1
        AND u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM workspace_account_metadata m WHERE m.user_id=u.id
          AND m.metadata->>'assignmentHold'='true' AND m.metadata->'resignation'->>'status'='notice'
          AND (m.metadata->'resignation'->>'effectiveDate')::timestamptz<=now())
        AND COALESCE(u.is_deleted, false) = false`,
    [token]
  );
  if (result.rowCount > 0) return result.rows[0];
  const userId = payload.details?.id;
  if (isUuid(userId)) {
    const current = (await execute(
      `SELECT t.token FROM users_token t JOIN users u ON u.id=t.user_id
        WHERE t.user_id=$1 AND u.status='active' AND COALESCE(u.is_deleted,false)=false`, [userId])).rows[0];
    if (current?.token && current.token !== token) {
      let otherSession;
      try { otherSession = jwt.verify(current.token, process.env.JWT_SECRET); } catch { /* No live replacement. */ }
      if (otherSession?.details?.id === userId && otherSession.jti !== payload.jti) {
        throw new HttpError(401, "Your account was signed in on another device. This device has been signed out.", "SESSION_REPLACED");
      }
    }
  }
  return null;
};

export const requireLogin = async (req, res, next) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return sendError(res, "Missing or invalid token.", 401);
    req.user = user;
    return next();
  } catch (error) {
    return handleError(res, error);
  }
};

export const requireUser = async (req, res, allowedRoles = null) => {
  const user = await getCurrentUser(req);
  if (!user) {
    sendError(res, "Missing or invalid token.", 401);
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    sendError(res, "You do not have permission to perform this action.", 403);
    return null;
  }
  return user;
};

/** Express middleware: 401 without a valid session, 403 outside the allowed roles. */
export const requireRoles = (...allowedRoles) => async (req, res, next) => {
  try {
    const user = await requireUser(req, res, allowedRoles);
    if (!user) return;
    req.user = user;
    return next();
  } catch (error) {
    return handleError(res, error);
  }
};

// includeFormer: read-only access for an engineer who held a phase or the Office PM role earlier (history stays visible).
export const hasProjectAccess = async (user, projectId, db = null, { includeFormer = false } = {}) => {
  const run = db ? (sql, params) => db.query(sql, params) : execute;
  if (user.role === "admin") return true;

  let sql;
  switch (user.role) {
    case "opm":
      sql = `SELECT 1 FROM projects WHERE id = $1 AND suggested_opm_id = $2
             UNION ALL
             SELECT 1 FROM project_engineers
              WHERE project_id = $1 AND user_id = $2 AND unassigned_at IS NULL`;
      if (includeFormer) sql += ` UNION ALL SELECT 1 FROM engineer_assignment_history WHERE project_id = $1 AND user_id = $2`;
      break;
    case "spm":
      sql = `SELECT 1 FROM project_phase_team WHERE project_id = $1 AND spm_user_id = $2
             UNION ALL
             SELECT 1 FROM project_engineers
              WHERE project_id = $1 AND user_id = $2 AND unassigned_at IS NULL`;
      if (includeFormer) sql += ` UNION ALL SELECT 1 FROM engineer_assignment_history WHERE project_id = $1 AND user_id = $2`;
      break;
    case "client":
      sql = `SELECT 1 FROM user_client_project_links WHERE project_id = $1 AND user_id = $2`;
      break;
    default:
      return false;
  }
  const result = await run(sql, [projectId, user.id]);
  return result.rowCount > 0;
};

export const isProjectOpmOrAdmin = async (user, projectId, db = null) => {
  if (user.role === "admin") return true;
  if (user.role !== "opm") return false;
  return hasProjectAccess(user, projectId, db);
};
