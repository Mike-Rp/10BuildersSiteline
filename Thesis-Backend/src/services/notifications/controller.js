import { HttpError, requireUser, handleError, sendOk } from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { listNotifications, setNotificationRead, dismissNotification } from "./notification.utility.js";

const endpoint = action => async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    // Identity comes exclusively from authentication; Admin has no recipient override.
    const data = await withTransaction(db => action(db, user.id, req));
    res.set?.("Cache-Control", "private, no-store");
    return sendOk(res, "Notifications saved or retrieved.", Array.isArray(data?.notifications) ? data.notifications.length : 1, data);
  } catch (error) { return handleError(res, error); }
};
const idFor = req => {
  if (typeof req.params.id !== "string" || !/^[1-9]\d{0,17}$/.test(req.params.id)) throw new HttpError(400, "Invalid notification ID.");
  return req.params.id;
};
export const getNotifications = endpoint((db, recipientId, req) => {
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0
    || (req.query.archived !== undefined && !["true", "false"].includes(req.query.archived))) throw new HttpError(400, "Invalid notification filters.");
  return listNotifications(db, recipientId, { limit, offset, archived: req.query.archived === "true" });
});
export const markRead = endpoint((db, recipientId, req) => {
  if (typeof req.body?.read !== "boolean") throw new HttpError(400, "Choose read or unread.");
  return setNotificationRead(db, recipientId, idFor(req), req.body.read);
});
export const dismiss = endpoint((db, recipientId, req) => dismissNotification(db, recipientId, idFor(req)));
