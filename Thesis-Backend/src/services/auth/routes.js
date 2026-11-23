import { Router } from "express";
import { login, adminLogin, refresh, reset, logout } from "./controller.js";
import { activateClient } from "../projects/client-onboarding.js";
import { loginFailureLimiter } from "../../common/utilities/rate-limit.utility.js";
const router = Router();
router.post('/admin', adminLogin);
router.post('/client/activate', loginFailureLimiter(), activateClient);


router.post('/', async (req, res) => {
  await login(req, res);
});

router.put('/', async (req, res) => {
  await refresh(req, res);
});

router.patch('/', async (req, res) => {
  await reset(req, res);
});

router.delete('/', async (req, res) => {
  await logout(req, res);
});

export default router;
