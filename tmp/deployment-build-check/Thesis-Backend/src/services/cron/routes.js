import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { sendError, sendOk, handleError } from "../../common/utilities/access.utility.js";
import { errorlog } from "../../common/utilities/logger.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { sweepLicenses } from "../accounts/license-sweep.utility.js";
import { sweepLicensesSafe } from "../licenses/sweep.js";

const router = Router();

const digest = (value) => createHash("sha256").update(value).digest();

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set on the project. */
const requireCronSecret = (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    errorlog("CRON_SECRET is not set; refusing cron request.");
    return sendError(res, "Missing or invalid cron credentials.", 401);
  }
  const header = req.headers.authorization;
  const supplied = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!supplied || !timingSafeEqual(digest(supplied), digest(secret))) {
    return sendError(res, "Missing or invalid cron credentials.", 401);
  }
  return next();
};

const runLicenseSweep = async (req, res) => {
  try {
    // The account sweep (missing/expiring/expired notices), then the engineer sweep: reminder days, grace-period alerts
    // and expired reassignment requests. The second never fails the first.
    const result = await withTransaction(async (db) => ({ ...(await sweepLicenses(db)), engineers: await sweepLicensesSafe(db) }));
    return sendOk(res, "License reminders swept.", 1, result);
  } catch (error) {
    return handleError(res, error);
  }
};

router.get("/license-sweep", requireCronSecret, runLicenseSweep);
router.post("/license-sweep", requireCronSecret, runLicenseSweep);

export default router;
