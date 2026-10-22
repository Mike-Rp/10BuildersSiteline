import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { sendError, sendOk, handleError } from "../../common/utilities/access.utility.js";
import { errorlog } from "../../common/utilities/logger.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { sweepLicenses } from "../accounts/license-sweep.utility.js";

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
    const result = await withTransaction((db) => sweepLicenses(db));
    return sendOk(res, "License reminders swept.", 1, result);
  } catch (error) {
    return handleError(res, error);
  }
};

router.get("/license-sweep", requireCronSecret, runLicenseSweep);
router.post("/license-sweep", requireCronSecret, runLicenseSweep);

export default router;
