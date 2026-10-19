import { Router } from "express";
import { createProject, updateProject, deleteProject } from "./controller.js";
import { getProjects, getProjectById } from "./read.controller.js";
import { upload } from "../../common/utilities/upload.utility.js";
import { createIntake, uploadContract, uploadSubconContract } from "./intake.controller.js";
import { getRecommendations, rerunRecommendations, swapOpm, updatePhaseTeam } from "./recommend.controller.js";
import { createIntakeDraft,getIntakeLog } from "./intake-log.controller.js";
import { createIntakeClient,selectIntakeClient } from "./intake-client.controller.js";
const router = Router();
router.get("/intake-log",getIntakeLog);
router.post("/intake/drafts",createIntakeDraft);
router.post("/intake/client-account",createIntakeClient);
router.post("/:id/client",selectIntakeClient);

router.get('/recommendations', async (req, res) => {
  await getRecommendations(req, res);
});
 
router.get('/recommendations/rerun', async (req, res) => {
  await rerunRecommendations(req, res);
});
 
router.get('/recommendations/swap-opm', async (req, res) => {
  await swapOpm(req, res);
});
 
router.put('/recommendations/update-phase-team', async (req, res) => {
  await updatePhaseTeam(req, res);
});

router.post('/intake', async (req, res) => {
  await createIntake(req, res);
});
 
router.post('/intake/upload-contract', upload.single('file'), async (req, res) => {
  await uploadContract(req, res);
});
 
router.post('/intake/upload-subcon-contract', upload.single('file'), async (req, res) => {
  await uploadSubconContract(req, res);
});

router.get('/', async (req, res) => {
  await getProjects(req, res);
});
 
router.get('/:id', async (req, res) => {
  await getProjectById(req, res);
});
 
router.post('/', async (req, res) => {
  await createProject(req, res);
});
 
router.put('/:id', async (req, res) => {
  await updateProject(req, res);
});
 
router.delete('/:id', async (req, res) => {
  await deleteProject(req, res);
});
 
 
export default router;