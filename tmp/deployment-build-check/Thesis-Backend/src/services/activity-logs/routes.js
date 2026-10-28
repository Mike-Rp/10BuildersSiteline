
import { Router } from "express";

import { getActivityLogs } from "./controller.js";

const router = Router();

router.get("/", getActivityLogs);

export default router;
