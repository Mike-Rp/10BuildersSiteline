import { PENDING_RENEWAL_SQL } from "../../services/licenses/submission-kind.utility.js";
import { readSessionTiming } from "./session-activity.utility.js";
import { licenseAccessPolicy, LICENSE_VIEW_ONLY_MESSAGE } from "../../domain/license-access.js";
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

export const PASSWORD_CHANGE_REQUIRED_MESSAGE = "Replace your temporary password before continuing.";

// The requests a temporary-password session may make: read its own session, replace the
// password, keep or end the session. Nothing else until the password is replaced.
const PASSWORD_CHANGE_ROUTES = [
  { methods: ["GET"], path: /\/auth\/me$/ },
  { methods: ["GET", "POST"], path: /\/auth\/(session|activity)$/ },
  { methods: ["POST"], path: /\/auth\/reset-password$/ },
  { methods: ["POST"], path: /\/auth\/admin\/change-password$/ },
  { methods: ["POST", "DELETE"], path: /\/auth\/logout$/ },
  { methods: ["PUT", "PATCH", "DELETE"], path: /\/auth$/ },
];
export const passwordChangeAllowed = (req) => {
  const url = (req.originalUrl || req.url || "").split("?")[0].replace(/\/+$/, "");
  const method = String(req.method || "GET").toUpperCase();
  return PASSWORD_CHANGE_ROUTES.some((route) => route.methods.includes(method) && route.path.test(url));
};

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
    `SELECT u.id, u.full_name, r.code AS role, COALESCE(u.temp_password_issued, false) AS temp_password_issued
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
  if (result.rowCount > 0) {
    const { temp_password_issued: temporaryPassword, ...user } = result.rows[0];
    const timing = await readSessionTiming({query:execute}, payload);
    if (timing.expired) throw new HttpError(401, "Your session expired due to inactivity. Please sign in again.", "SESSION_INACTIVE");
    // A temporary password only unlocks the steps needed to replace it. Every other
    // operation waits, whatever the role, until the account owner chooses a password.
    if (temporaryPassword && !passwordChangeAllowed(req))
      throw new HttpError(403, PASSWORD_CHANGE_REQUIRED_MESSAGE, "PASSWORD_CHANGE_REQUIRED");
    if (["opm", "spm"].includes(user.role)) {
      const current = (await execute("select license_expiry::text as expiry from user_licenses where user_id=$1 and superseded_at is null order by (to_jsonb(user_licenses)->>'verification_status'='verified') desc nulls last, license_expiry desc, created_at desc,id desc limit 1", [user.id])).rows[0];
      const policy = licenseAccessPolicy(current?.expiry);
      const pendingRenewal = (await execute(PENDING_RENEWAL_SQL, [user.id])).rows[0]?.pending;
      const renewalOnly = policy.mode === "view_only" || pendingRenewal;
      const url = (req.originalUrl || req.url || "").split("?")[0];
      const read = ["GET", "HEAD"].includes(req.method);
      const accountAction = /\/auth\/(logout|reset-password|refresh|activity|session)$/.test(url);
      const renewalAction = req.method === "POST" && /\/licenses\/renewals$/.test(url);
      if (renewalAction && policy.daysToExpiry !== null && policy.daysToExpiry <= 23)
        throw new HttpError(403, "The seven-day renewal submission window has ended. Visit your Administrator to complete the renewal process.", "LICENSE_ADMIN_REQUIRED");
      const ownCredentials = read && url.endsWith("/licenses/credentials/" + user.id);
      const licenseStatus = read && /\/licenses\/me$/.test(url);
      const renewalFile = read && (/\/licenses\/renewals\/\d+\/file$/.test(url)||/\/licenses\/credentials\/[0-9a-f-]+\/file$/i.test(url));
      let ownStoredFile = false;
      const storedFileId = read && url.match(/\/files\/([0-9a-f-]+)\/content$/i)?.[1];
      if (storedFileId && renewalOnly) ownStoredFile = (await execute("select 1 from license_renewal_requests where user_id=$1 and file_ref in ($2,$3) union all select 1 from user_licenses where user_id=$1 and upload_file_ref in ($2,$3) limit 1", [user.id,"db:"+storedFileId,"db://"+storedFileId])).rowCount > 0;
      if (renewalOnly && !accountAction && !renewalAction && !ownCredentials && !licenseStatus && !renewalFile && !ownStoredFile)
        throw new HttpError(403, LICENSE_VIEW_ONLY_MESSAGE, "LICENSE_RENEWAL_ONLY");
    }
    return user;
  }
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
              WHERE project_id = $1 AND user_id = $2 AND (unassigned_at IS NULL OR EXISTS (
                SELECT 1 FROM projects p WHERE p.id=$1 AND p.lifecycle_status='archived'))`;
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
