import { HttpError } from "../../common/utilities/access.utility.js";
import { clientOwnedEnabled } from "./client-owned-activation.js";

// Preserve existing invited-account behavior, but never treat an unredeemed
// client-owned invitation as a verified account or project association.
export async function assertProjectClientReady(db, projectId) {
  const links = (await db.query(`SELECT u.id,u.status,u.is_deleted,r.code AS role
    FROM user_client_project_links l LEFT JOIN users u ON u.id=l.user_id
    LEFT JOIN roles r ON r.id=u.role_id WHERE l.project_id=$1`, [projectId])).rows;
  const installed = (await db.query("SELECT to_regclass('public.client_portal_invitations') IS NOT NULL AS ready")).rows[0]?.ready;
  const invitation = installed ? (await db.query("SELECT redeemed_at,redeemed_by FROM client_portal_invitations WHERE project_id=$1", [projectId])).rows[0] : undefined;
  if (links.length > 1)
    throw new HttpError(409, "More than one client account is linked to this project. Ask Admin to review the links in Project monitoring > Client account.", "CLIENT_PROJECT_LINK_AMBIGUOUS");
  if (invitation && !invitation.redeemed_at) {
    const message = clientOwnedEnabled()
      ? "The client has not redeemed this project's invitation. Ask the assigned Office PM to issue the activation code in Project monitoring > Client account. The client must verify the project contact and their login email before project activation."
      : "This project is waiting for client invitation verification, but new client registration is currently disabled. The administrator must configure registration and email verification before the client can finish. Adding contact information again will not resolve this.";
    throw new HttpError(409, message, "CLIENT_PROJECT_INVITATION_PENDING");
  }
  if (!links.length)
    throw new HttpError(409, "No client portal account is linked to this project. Ask the assigned Office PM to open Project monitoring > Client account and complete the available client setup steps. The inquiry's contact details alone do not create a portal account.", "CLIENT_PROJECT_ACCOUNT_MISSING");
  const account = links[0];
  if (!account.id || account.role !== "client" || account.is_deleted || !["active", "invited"].includes(account.status))
    throw new HttpError(409, "The linked client account is unavailable. Ask Admin to review its status in Project monitoring > Client account.", "CLIENT_PROJECT_ACCOUNT_UNAVAILABLE");
  if (invitation && (invitation.redeemed_by !== account.id || account.status !== "active"))
    throw new HttpError(409, "The linked client account does not match the verified project invitation. Ask Admin to review the client link; do not create another account.", "CLIENT_PROJECT_ACCOUNT_UNVERIFIED");
  return account;
}
