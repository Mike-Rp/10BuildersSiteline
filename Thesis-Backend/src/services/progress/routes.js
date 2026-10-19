import { Router } from "express";
import {
  submitProgressUpdate, getPendingUpdate, approveProgressUpdate, rejectProgressUpdate,
  getEscalatedUpdates, sweepOverdueUpdates,
  submitReworkRequest, getReworkRequests, approveRework, rejectRework,
  getProjectHistory, addProjectNote, getProjectNotes,
} from "./controller.js";
 
import { authorizePhaseUpload } from "./phase.controller.js";
import { optionalPhaseUpload } from "./phase-upload.utility.js";
const router = Router();

router.post("/projects/:id/progress-updates", authorizePhaseUpload, optionalPhaseUpload, submitProgressUpdate);
router.get("/projects/:id/progress-updates/pending", async (req, res) => { await getPendingUpdate(req, res); });
router.get("/progress-updates/escalated", async (req, res) => { await getEscalatedUpdates(req, res); });
router.post("/progress-updates/sweep", async (req, res) => { await sweepOverdueUpdates(req, res); });
router.post("/progress-updates/:id/approve", async (req, res) => { await approveProgressUpdate(req, res); });
router.post("/progress-updates/:id/reject", async (req, res) => { await rejectProgressUpdate(req, res); });
 

router.post("/projects/:id/rework-requests", async (req, res) => { await submitReworkRequest(req, res); });
router.get("/rework-requests", async (req, res) => { await getReworkRequests(req, res); });
router.post("/rework-requests/:id/approve", async (req, res) => { await approveRework(req, res); });
router.post("/rework-requests/:id/reject", async (req, res) => { await rejectRework(req, res); });
 

router.get("/projects/:id/history", async (req, res) => { await getProjectHistory(req, res); });
router.post("/projects/:id/notes", async (req, res) => { await addProjectNote(req, res); });
router.get("/projects/:id/notes", async (req, res) => { await getProjectNotes(req, res); });
 
export default router;