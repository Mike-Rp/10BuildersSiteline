import { Router } from "express";
import { login, adminLogin, refresh, reset, logout } from "./controller.js";
const router = Router();
router.post('/admin', adminLogin);


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
