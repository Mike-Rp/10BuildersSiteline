
import { Router } from "express";

import {
    getMyConfirmations,
    getEscalatedConfirmations,
    acceptConfirmation,
    declineConfirmation,
    reassignConfirmation,
    getPhaseTeam,
    acceptPhase,
    declinePhase
} from "./controller.js";

const router = Router();

router.get("/", getMyConfirmations);

router.get("/escalated", getEscalatedConfirmations);

router.post("/:id/accept", acceptConfirmation);
router.post("/:id/decline", declineConfirmation);

router.post("/:id/reassign", reassignConfirmation);

router.get("/projects/:id/phase-team", getPhaseTeam);

router.post(
    "/projects/:id/phase-team/:stageId/accept",
    acceptPhase
);

router.post(
    "/projects/:id/phase-team/:stageId/decline",
    declinePhase
);

export default router;
