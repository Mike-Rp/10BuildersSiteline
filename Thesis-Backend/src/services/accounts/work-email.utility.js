import { employeeIdFromWorkEmail, normalizeEmployeeId, workEmailFor } from "../../domain/work-email.js";
import { HttpError } from "../../common/utilities/access.utility.js";

const lockIds = db => db.query("select pg_advisory_xact_lock(hashtext($1))", ["work-email-allocation"]);

export function workEmailFromAssignedId(lastName, idNumber) {
  if (!normalizeEmployeeId(idNumber)) {
    throw new HttpError(503, "The database must automatically assign a valid users.id_number before a work email can be created.");
  }
  const email = typeof lastName === "string" ? workEmailFor(lastName, idNumber).toLowerCase() : "";
  if (!email || email.length > 254) throw new HttpError(400, "A valid last name is required to generate the work email.");
  return email;
}

export async function assertWorkEmailAvailable(db, email, excludingId = null, employeeId) {
  const id = employeeIdFromWorkEmail(email);
  if (employeeId !== undefined && (!normalizeEmployeeId(employeeId) || normalizeEmployeeId(employeeId) !== id)) {
    throw new HttpError(400, "The work email must match the employee ID, for example cruz.10B00168@10builders.com.");
  }
  if (!id) return;
  // Serialize account writes for this ID, including attempts with different surnames.
  await lockIds(db);
  const existing = await db.query(
    `select id from users where lower(email::text) ~ $1 and ($2::uuid is null or id<>$2::uuid) limit 1`,
    [`^[a-z0-9]+\\.${id.toLowerCase()}@10builders\\.com$`, excludingId],
  );
  if (existing.rowCount) throw new HttpError(409, "This employee ID is already assigned to another account.");
}
