
import { Router } from "express";

import {
  getAdminDashboard,
  getOpmDashboard,
  getSpmDashboard,
  getClientDashboard,
  getSchedulePerformance
} from "./controller.js";

const router = Router();

router.get("/admin", getAdminDashboard);

router.get("/opm", getOpmDashboard);

router.get("/spm", getSpmDashboard);

router.get("/client", getClientDashboard);

router.get("/schedule-performance", getSchedulePerformance);

export default router;
