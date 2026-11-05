import { HttpError } from "../../common/utilities/access.utility.js";
import { composeFullName, NAME_SUFFIXES, normalizeSuffix, splitTrailingSuffix } from "../accounts/work-email.js";

const NAME_MAX = 100;
const FULL_NAME_MAX = 150;
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
export const NAME_FIELDS = ["first_name", "middle_name", "last_name", "suffix"];
export const hasNameParts = (body) => NAME_FIELDS.some((field) => body?.[field] !== undefined);

// Builds the stored name from first/middle/last/suffix. `current` fills in parts the request leaves out, so a
// request that only changes last_name keeps the rest. A suffix typed into last_name is moved to suffix.
// Throws HttpError(400) with a plain message.
export function parseWorkerName(body, current = {}) {
  const part = (field) => {
    const value = body[field] !== undefined ? body[field] : current[field];
    if (value !== null && value !== undefined && typeof value !== "string") throw new HttpError(400, `${field} must be text.`);
    return clean(value);
  };
  const firstName = part("first_name");
  const middleName = part("middle_name");
  let lastName = part("last_name");
  let suffix = "";
  if (!firstName) throw new HttpError(400, "first_name is required.");
  if (!lastName) throw new HttpError(400, "last_name is required.");
  if ([firstName, middleName, lastName].some((value) => value.length > NAME_MAX)) throw new HttpError(400, `Names can be at most ${NAME_MAX} characters.`);
  const rawSuffix = clean(body.suffix !== undefined ? body.suffix : current.suffix);
  if (rawSuffix) {
    suffix = normalizeSuffix(rawSuffix) ?? "";
    if (!suffix) throw new HttpError(400, `suffix must be one of: ${NAME_SUFFIXES.join(", ")}.`);
  } else {
    const split = splitTrailingSuffix(lastName);
    lastName = split.lastName;
    suffix = split.suffix;
  }
  const fullName = composeFullName({ firstName, middleName, lastName, suffix });
  if (fullName.length > FULL_NAME_MAX) throw new HttpError(400, `The full name can be at most ${FULL_NAME_MAX} characters.`);
  return { firstName, middleName, lastName, suffix, fullName };
}
