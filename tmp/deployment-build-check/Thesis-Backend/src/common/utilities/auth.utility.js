import { getCurrentUser } from "./access.utility.js";

/**
 * Returns the signed-in user's id, or null. The token must carry a valid JWT
 * signature, match the stored session, and belong to an active, undeleted user.
 */
export const authenticate = async (req) => {
  const user = await getCurrentUser(req);
  return user ? user.id : null;
};
