import { sendError } from "./access.utility.js";

const MAX_TRACKED_KEYS = 10000;

/**
 * Blocks sign-in attempts after repeated failures, counted per client address and per
 * submitted email. Only 401/403 responses count; a successful sign-in clears the email's
 * count. State lives in this process, so on serverless hosting each warm instance keeps
 * its own count and the limit is best-effort.
 */
export const loginFailureLimiter = ({ windowMs = 15 * 60 * 1000, max = 10 } = {}) => {
  const failures = new Map();

  const live = (key, now) => {
    const entry = failures.get(key);
    if (!entry) return null;
    if (entry.resetAt <= now) {
      failures.delete(key);
      return null;
    }
    return entry;
  };

  const keysFor = (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
    return [`ip:${req.ip}`, ...(email ? [`email:${email}`] : [])];
  };

  const prune = (now) => {
    if (failures.size < MAX_TRACKED_KEYS) return;
    for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
  };

  return (req, res, next) => {
    const now = Date.now();
    const keys = keysFor(req);
    const blocked = keys.map((key) => live(key, now)).filter((entry) => entry && entry.count >= max);
    if (blocked.length) {
      const retryAfter = Math.ceil((Math.max(...blocked.map((entry) => entry.resetAt)) - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return sendError(res, "Too many failed sign-in attempts. Try again later.", 429);
    }
    res.on("finish", () => {
      const finished = Date.now();
      if (res.statusCode === 401 || res.statusCode === 403) {
        prune(finished);
        for (const key of keys) {
          const entry = live(key, finished) ?? { count: 0, resetAt: finished + windowMs };
          entry.count += 1;
          failures.set(key, entry);
        }
      } else if (res.statusCode < 400) {
        for (const key of keys) if (key.startsWith("email:")) failures.delete(key);
      }
    });
    return next();
  };
};
