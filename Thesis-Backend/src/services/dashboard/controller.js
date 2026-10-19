import { handleError, sendOk, requireUser } from "../../common/utilities/access.utility.js";
import { getAdminMetrics, getAdminActiveSitesData, getOpmMetrics, getSpmMetrics, getClientMetrics } from "./metrics.js";
import { getSchedulePerformanceData } from "./schedule-performance.js";

export const getAdminDashboard = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const data = await getAdminMetrics();
    return sendOk(res, "Resource retrieved successfully.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getAdminActiveSites = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const data = await getAdminActiveSitesData();
    return sendOk(res, "Resource retrieved successfully.", data.activeSites.length, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getOpmDashboard = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["opm"]);
    if (!user) return;
    const data = await getOpmMetrics(user.id);
    return sendOk(res, "Resource retrieved successfully.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getSpmDashboard = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["spm"]);
    if (!user) return;
    const data = await getSpmMetrics(user.id);
    return sendOk(res, "Resource retrieved successfully.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getClientDashboard = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["client"]);
    if (!user) return;
    const data = await getClientMetrics(user.id);
    return sendOk(res, "Resource retrieved successfully.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getSchedulePerformance = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const data = await getSchedulePerformanceData(req.query);
    return sendOk(res, "Resource retrieved successfully.", data.series.length, data);
  } catch (error) {
    return handleError(res, error);
  }
};

