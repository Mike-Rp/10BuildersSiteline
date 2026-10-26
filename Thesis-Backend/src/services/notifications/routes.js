import { Router } from "express";
import { getNotifications, markRead, dismiss } from "./controller.js";
const router = Router();
router.get("/", getNotifications);
router.patch("/:id/read", markRead);
router.post("/:id/dismiss", dismiss);
export default router;
