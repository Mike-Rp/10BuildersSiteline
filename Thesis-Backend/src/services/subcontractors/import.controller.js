import { v4 as uuidv4 } from "uuid";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { HttpError, handleError, sendOk, requireUser, isUuid } from "../../common/utilities/access.utility.js";
import { composeFullName, NAME_SUFFIXES, normalizeSuffix, splitTrailingSuffix } from "../accounts/work-email.js";

const IMPORT_ROLES = ["admin"];
export const MAX_IMPORT_WORKERS = 5000;
// Canonical worker ID only: 02000-0045, or longer parts without leading zeros (02000-10000).
const WORKER_ID_RE = /^([0-9]{5}|[1-9][0-9]{5,})-([0-9]{4}|[1-9][0-9]{4,})$/;
const NAME_MAX = 100;
const FULL_NAME_MAX = 150;

const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// Checks every row and returns { rows, errors }. Errors are row-numbered; a row that fails is not saved,
// and one failing row rejects the whole file.
export function validateImportRows(workers) {
  const rows = [];
  const errors = [];
  const seen = new Map();
  workers.forEach((entry, index) => {
    const row = Number.isInteger(entry?.row) && entry.row > 0 ? entry.row : index + 2;
    const fail = (message) => errors.push({ row, message });
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail("This row is not a worker record.");
    const idNumber = text(entry.id_number).toUpperCase();
    const firstName = text(entry.first_name);
    const middleName = text(entry.middle_name);
    let lastName = text(entry.last_name);
    let suffix = "";
    if (idNumber && !WORKER_ID_RE.test(idNumber))
      return fail(`id_number "${idNumber}" is not valid. Use the form 02000-0045, or leave it blank for a new worker.`);
    if (idNumber) {
      if (seen.has(idNumber)) return fail(`id_number ${idNumber} is already used on row ${seen.get(idNumber)}.`);
      seen.set(idNumber, row);
    }
    if (!firstName) return fail("first_name is blank.");
    if (!lastName) return fail("last_name is blank.");
    if (firstName.length > NAME_MAX || middleName.length > NAME_MAX || lastName.length > NAME_MAX)
      return fail(`Names can be at most ${NAME_MAX} characters.`);
    if (text(entry.suffix)) {
      suffix = normalizeSuffix(entry.suffix) ?? "";
      if (!suffix) return fail(`suffix "${text(entry.suffix)}" is not recognized. Use ${NAME_SUFFIXES.join(", ")}, or leave it blank.`);
    } else {
      const split = splitTrailingSuffix(lastName);
      lastName = split.lastName;
      suffix = split.suffix;
    }
    const fullName = composeFullName({ firstName, middleName, lastName, suffix });
    if (fullName.length > FULL_NAME_MAX) return fail(`The full name is longer than ${FULL_NAME_MAX} characters.`);
    rows.push({ row, idNumber, firstName, middleName, lastName, suffix, fullName });
  });
  return { rows, errors };
}

// The IDs in `rows` that do not belong to this company. The same message for another company's ID and for one
// that does not exist, so IDs cannot be probed.
export async function unknownIdProblems(client, companyId, rows) {
  const wanted = rows.filter((r) => r.idNumber).map((r) => r.idNumber);
  const current = new Map();
  if (wanted.length) {
    const found = await client.query(
      `SELECT id, id_number, first_name, middle_name, last_name, suffix
         FROM subcontractor_workers WHERE subcontractor_id = $1 AND id_number = ANY($2::text[])`, [companyId, wanted]);
    for (const worker of found.rows) current.set(worker.id_number, worker);
  }
  const problems = rows.filter((r) => r.idNumber && !current.has(r.idNumber)).map((r) => ({
    row: r.row,
    message: `${r.idNumber} is not one of this company's workers. Leave id_number blank for a new worker.`,
  }));
  return { current, problems };
}

// Saves validated rows for one company, inside the caller's transaction. Returns { errors } without saving
// anything when an ID is not this company's, else { created, updated, unchanged }.
// The row lock makes two imports into the same company take turns.
export async function applyImport(client, companyId, rows, userId) {
  const company = await client.query(
    `SELECT id FROM subcontractors WHERE id = $1 AND COALESCE(is_deleted,false) = false FOR UPDATE`, [companyId]);
  if (company.rowCount === 0) throw new HttpError(404, "Subcontractor not found.");
  const { current, problems } = await unknownIdProblems(client, companyId, rows);
  if (problems.length) return { errors: problems };

  const created = [];
  let updated = 0;
  let unchanged = 0;
  for (const r of rows) {
    if (r.idNumber) {
      const old = current.get(r.idNumber);
      const same = (old.first_name ?? "") === r.firstName && (old.middle_name ?? "") === r.middleName
        && (old.last_name ?? "") === r.lastName && (old.suffix ?? "") === r.suffix;
      if (same) { unchanged++; continue; }
      await client.query(
        `UPDATE subcontractor_workers SET full_name = $2, first_name = $3, middle_name = $4, last_name = $5,
                suffix = $6, updated_by = $7, updated_at = now() WHERE id = $1`,
        [old.id, r.fullName, r.firstName, r.middleName || null, r.lastName, r.suffix || null, userId]);
      updated++;
    } else {
      // id_number is left out on purpose: a trigger always assigns the next number for this company.
      const inserted = await client.query(
        `INSERT INTO subcontractor_workers
           (id, subcontractor_id, full_name, first_name, middle_name, last_name, suffix, status, availability_status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'available', $8, $8)
         RETURNING id_number, first_name, middle_name, last_name, suffix`,
        [uuidv4(), companyId, r.fullName, r.firstName, r.middleName || null, r.lastName, r.suffix || null, userId]);
      created.push({ row: r.row, ...inserted.rows[0] });
    }
  }
  return { created, updated, unchanged };
}

export const rejected = (res, errors) => {
  const shown = errors.slice(0, 10).map((e) => `Row ${e.row}: ${e.message}`).join(" ");
  const message = `The file was not imported. ${shown}${errors.length > 10 ? ` (and ${errors.length - 10} more)` : ""}`;
  return res.status(422).json({
    code: 422, status_text: "Unprocessable Entity", message,
    error: { code: "IMPORT_REJECTED", message, rows: errors },
  });
};

// POST /subcontractors/:id/workers/import
// body: { workers: [{ id_number?, first_name, middle_name?, last_name, suffix?, row? }] }
// A blank id_number is a new worker (the database assigns the next number). A filled one must already belong to
// this company; anything else, including another company's ID, is rejected. Transfers are a separate Admin action.
// All or nothing: any invalid row, or any failure while saving, leaves the company's workers unchanged.
export const importWorkers = async (req, res) => {
  try {
    const user = await requireUser(req, res, IMPORT_ROLES);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid subcontractor id.");
    const workers = req.body?.workers;
    if (!Array.isArray(workers) || workers.length === 0) throw new HttpError(400, "workers must be a non-empty array.");
    if (workers.length > MAX_IMPORT_WORKERS) throw new HttpError(400, `At most ${MAX_IMPORT_WORKERS} workers can be imported at once. Split the file.`);

    const { rows, errors } = validateImportRows(workers);
    if (errors.length) return rejected(res, errors);

    const result = await withTransaction((client) => applyImport(client, id, rows, user.id));

    if (result.errors) return rejected(res, result.errors);
    return sendOk(res, "Workers imported.", result.created.length, result, 201);
  } catch (error) {
    return handleError(res, error);
  }
};
