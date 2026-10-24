import { Router } from "express";
import { importWorkers } from "./import.controller.js";
import { transferWorker, getWorkerIdNumbers } from "./transfer.controller.js";
import {
  submitManpower, listSubmissions, getSubmission, approveSubmission, rejectSubmission, withdrawSubmission,
} from "./submission.controller.js";
import {
  getSubcontractors, getSubcontractorById, createSubcontractor,
  getWorkers, addWorker, updateWorker, replaceWorkerCertifications, getWorkerHistory,
  getMatches, createRequest, getRequests, approveRequest, rejectRequest,
  getAssignments, releaseAssignment, downloadCrewCsv,
} from "./controller.js";

const router = Router();


router.get("/subcontractors", async (req, res) => { await getSubcontractors(req, res); });
router.post("/subcontractors", async (req, res) => { await createSubcontractor(req, res); });
router.get("/subcontractors/:id", async (req, res) => { await getSubcontractorById(req, res); });
router.get("/subcontractors/:id/crew.csv", async (req, res) => { await downloadCrewCsv(req, res); });

router.get("/subcontractors/:id/workers", async (req, res) => { await getWorkers(req, res); });
router.post("/subcontractors/:id/workers", async (req, res) => { await addWorker(req, res); });
router.post("/subcontractors/:id/workers/import", async (req, res) => { await importWorkers(req, res); });
router.post("/subcontractors/:id/manpower-submissions", async (req, res) => { await submitManpower(req, res); });
router.get("/subcontractors/:id/manpower-submissions", async (req, res) => { await listSubmissions(req, res); });
router.get("/manpower-submissions/:id", async (req, res) => { await getSubmission(req, res); });
router.post("/manpower-submissions/:id/approve", async (req, res) => { await approveSubmission(req, res); });
router.post("/manpower-submissions/:id/reject", async (req, res) => { await rejectSubmission(req, res); });
router.post("/manpower-submissions/:id/withdraw", async (req, res) => { await withdrawSubmission(req, res); });
router.patch("/workers/:id", async (req, res) => { await updateWorker(req, res); });
router.put("/workers/:id/certifications", async (req, res) => { await replaceWorkerCertifications(req, res); });
router.get("/workers/:id/history", async (req, res) => { await getWorkerHistory(req, res); });
router.post("/workers/:id/transfer", async (req, res) => { await transferWorker(req, res); });
router.get("/workers/:id/id-numbers", async (req, res) => { await getWorkerIdNumbers(req, res); });

router.get("/projects/:id/subcontractor-matches", async (req, res) => { await getMatches(req, res); });
router.post("/projects/:id/subcontractor-requests", async (req, res) => { await createRequest(req, res); });
router.get("/projects/:id/subcontractor-assignments", async (req, res) => { await getAssignments(req, res); });
router.get("/subcontractor-requests", async (req, res) => { await getRequests(req, res); });
router.post("/subcontractor-requests/:id/approve", async (req, res) => { await approveRequest(req, res); });
router.post("/subcontractor-requests/:id/reject", async (req, res) => { await rejectRequest(req, res); });
router.delete("/subcontractor-assignments/:id", async (req, res) => { await releaseAssignment(req, res); });

export default router;