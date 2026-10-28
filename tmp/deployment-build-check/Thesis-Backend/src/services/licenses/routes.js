import { Router } from "express";
import { requireRoles } from "../../common/utilities/access.utility.js";
import { uploadLicenseFile } from "../accounts/manage.controller.js";
import { myLicense, submitRenewal, listRenewals, renewalFile, verifyRenewal, rejectRenewal } from "./renewal.controller.js";
import {
  overrideOptions, overview, createOverride, myRequests, acceptRequest, declineRequest, projectHistory, workRecord,
} from "./override.controller.js";

const router = Router();
// Engineer
router.get("/me", myLicense);
router.get("/requests", myRequests);
router.post("/requests/:id/accept", acceptRequest);
router.post("/requests/:id/decline", declineRequest);
// Administrator
router.post("/renewals", requireRoles("admin"), uploadLicenseFile, submitRenewal);
router.get("/renewals", listRenewals);
router.post("/renewals/:id/verify", verifyRenewal);
router.post("/renewals/:id/reject", rejectRenewal);
router.get("/overview", overview);
router.get("/override-options", overrideOptions);
router.post("/overrides", createOverride);
// Engineer (own file) or Administrator
router.get("/renewals/:id/file", renewalFile);
// Staff of the project, former holders (read-only) and Administrators — never clients
router.get("/history", projectHistory);
router.get("/work-record/:userId", workRecord);

export default router;
