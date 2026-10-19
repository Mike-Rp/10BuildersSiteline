import { Router } from "express";
import { phaseUpload, optionalPhaseUpload } from "./phase-upload.utility.js";
import {
  getPhaseOverview, authorizePhaseUpload, uploadEvidence, approveEvidence, rejectEvidence,
  uploadPhaseFile, downloadPhaseFile, getProjectIssues, advancePhase, configurePhaseTemplate,
  getProjectStages, markChecklistSubmitted, reportProjectIssue,
} from "./phase.controller.js";
import {
  submitPhaseUpdate, approvePhaseUpdate, rejectPhaseUpdate, getPhaseUpdates, getPendingPhaseUpdates,
} from "./phase-update.controller.js";

const router = Router();
router.get("/projects/:id/phase-overview", getPhaseOverview);
router.get("/projects/:id/stages", getProjectStages);
router.get("/phase-updates/pending", getPendingPhaseUpdates);
router.get("/projects/:id/phase-updates", getPhaseUpdates);
router.post("/projects/:id/phase-updates", authorizePhaseUpload, optionalPhaseUpload, submitPhaseUpdate);
router.post("/projects/:id/phase-updates/:updateId/approve", approvePhaseUpdate);
router.post("/projects/:id/phase-updates/:updateId/reject", rejectPhaseUpdate);
router.post("/projects/:id/checklist-items/:itemId/submit", markChecklistSubmitted);
router.post("/projects/:id/checklist-items/:itemId/evidence", authorizePhaseUpload, phaseUpload, uploadEvidence);
router.post("/projects/:id/evidence/:evidenceId/approve", approveEvidence);
router.post("/projects/:id/evidence/:evidenceId/reject", rejectEvidence);
router.post("/projects/:id/phase-files", authorizePhaseUpload, phaseUpload, uploadPhaseFile);
router.get("/projects/:id/phase-files/:fileId", downloadPhaseFile);
router.get("/projects/:id/issues", getProjectIssues);
router.post("/projects/:id/issues", reportProjectIssue);
router.post("/projects/:id/advance-phase", advancePhase);
router.put("/phase-checklist-templates/:stageId", configurePhaseTemplate);
export default router;
