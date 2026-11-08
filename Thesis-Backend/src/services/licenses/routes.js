import { getCredentials,putSpecializations,submitLegacyCredential,credentialFile } from "./credentials.controller.js";
import { Router } from "express";
import { requireRoles } from "../../common/utilities/access.utility.js";
import multer from "multer";
import { sendError } from "../../common/utilities/access.utility.js";
const renewalUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}}).single("file");
const parseRenewal = (req,res,next) => renewalUpload(req,res,error => error ? sendError(res,"Use one PDF, JPG or PNG file up to 10 MB.",400) : next());
import { myLicense, submitRenewal, listRenewals, renewalFile, verifyRenewal, rejectRenewal } from "./renewal.controller.js";
import {
  overrideOptions, overview, createOverride, myRequests, acceptRequest, declineRequest, projectHistory, workRecord,
} from "./override.controller.js";

const router = Router();
router.get('/credentials/:userId',getCredentials);
router.get('/credentials/:id/file',credentialFile);
router.put('/credentials/:userId/specializations',putSpecializations);
router.post('/credentials/:id/submit-for-review',submitLegacyCredential);
// Engineer
router.get("/me", myLicense);
router.get("/requests", myRequests);
router.post("/requests/:id/accept", acceptRequest);
router.post("/requests/:id/decline", declineRequest);
// Administrator
router.post("/renewals", requireRoles("admin", "opm", "spm"), parseRenewal, submitRenewal);
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
