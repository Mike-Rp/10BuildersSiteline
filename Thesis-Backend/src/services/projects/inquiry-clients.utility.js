import { HttpError, isUuid } from "../../common/utilities/access.utility.js";

const draftFields = ["client_record", "client_type", "client_name", "company_name", "primary_contact", "designation", "email", "phone", "existing_client_source", "existing_client_id", "existing_client_verified", "existing_client_phone_missing", "name", "address", "project_type", "lot_area", "floor_area_sqm", "floor_count", "consultation", "classification", "immediate_consultation", "anticipated_start", "overview"];

export function inquiryDraftDetails(input) {
  const details = { intake_draft: "yes" };
  for (const key of draftFields) {
    const value = input?.[key];
    if (value == null || value === "") continue;
    const limit = key === "overview" ? 2000 : key === "address" ? 500 : 150;
    if (!["string", "number"].includes(typeof value) || String(value).length > limit || (typeof value === "number" && !Number.isFinite(value)))
      throw new HttpError(422, `Enter a valid ${key.replaceAll("_", " ")}.`);
    details[key] = value;
  }
  return details;
}

export function inquiryClientIdentity(input) {
  if (input.client_type == null && input.client_record == null) return {}; // Retain legacy intake snapshots.
  if (!["individual", "company"].includes(input.client_type)) throw new HttpError(422, "Select Individual or Company / organization.");
  if (!["new", "existing"].includes(input.client_record)) throw new HttpError(422, "Select New client or Existing client.");
  const result = { client_record: input.client_record, client_type: input.client_type };
  for (const key of ["company_name", "designation"]) {
    if (input[key] != null && (typeof input[key] !== "string" || input[key].trim().length > 150)) throw new HttpError(422, `Enter a valid ${key.replaceAll("_", " ")}.`);
    if (input.client_type === "company" && input[key]?.trim()) result[key] = input[key].trim();
  }
  if (input.client_type === "company" && (!result.company_name || typeof input.primary_contact !== "string" || !input.primary_contact.trim()))
    throw new HttpError(422, "Enter the company name and primary contact's name.");
  if (input.client_record === "existing") {
    if (!["account", "inquiry"].includes(input.existing_client_source) || !isUuid(input.existing_client_id)) throw new HttpError(422, "Select an existing client record.");
    result.existing_client_source = input.existing_client_source;
    result.existing_client_id = input.existing_client_id;
    if (input.existing_client_verified !== "yes") throw new HttpError(422, "Verify the selected client's identity and contact details.");
    result.existing_client_verified = "yes";
  }
  return result;
}

function profile(details) {
  const type = details.client_type === "company" ? "company" : "individual";
  return { client_type: type, client_name: String(details.client_name || ""), company_name: type === "company" ? String(details.company_name || details.client_name || "") : "",
    primary_contact: String(details.primary_contact || ""), designation: String(details.designation || ""), email: String(details.email || ""), phone: String(details.phone || "") };
}

export async function findInquiryClients(db, query) {
  const term = typeof query === "string" ? query.trim().slice(0, 100) : "";
  if (term.length < 2) return [];
  const { rows } = await db.query(`
    SELECT * FROM (
      SELECT 'inquiry' AS source,i.id,i.updated_at, jsonb_build_object(
        'client_type',coalesce(i.details->>'client_type','individual'),'client_name',i.details->>'client_name',
        'company_name',i.details->>'company_name','primary_contact',i.details->>'primary_contact',
        'designation',i.details->>'designation','email',i.details->>'email','phone',i.details->>'phone') AS details
      FROM project_inquiries i WHERE coalesce(i.details->>'intake_draft','')<>'yes'
      UNION ALL
      SELECT 'account',u.id,u.updated_at,jsonb_build_object('client_type','individual','client_name',u.full_name)
        ||coalesce(m.metadata->'clientProfile','{}'::jsonb)||jsonb_build_object('email',u.email,'phone',u.phone)
      FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN workspace_account_metadata m ON m.user_id=u.id
      WHERE r.code='client' AND u.status IN ('active','invited') AND NOT coalesce(u.is_deleted,false)
    ) clients WHERE position(lower($1) in lower(coalesce(details->>'client_name','')||' '||coalesce(details->>'company_name','')||' '||coalesce(details->>'primary_contact','')||' '||coalesce(details->>'email','')||' '||coalesce(details->>'phone',''))) > 0
    ORDER BY updated_at DESC NULLS LAST,id LIMIT 50`, [term]);
  const seen = new Set();
  return rows.sort((a,b) => Number(b.source === "account") - Number(a.source === "account")).flatMap(row => {
    const details = profile(row.details);
    const key = `${details.client_type}:${details.client_name.toLowerCase()}:${details.email.toLowerCase()}`;
    if (!details.client_name || !details.email || seen.has(key)) return [];
    seen.add(key);
    return [{ id: row.id, source: row.source, ...details }];
  }).slice(0, 20);
}

export async function resolveInquiryClient(db, input) {
  if (input.client_record !== "existing") return input;
  inquiryClientIdentity(input);
  let details;
  if (input.existing_client_source === "account") {
    const { rows } = await db.query(`SELECT jsonb_build_object('client_type','individual','client_name',u.full_name)
      ||coalesce(m.metadata->'clientProfile','{}'::jsonb)||jsonb_build_object('email',u.email,'phone',u.phone) AS details
      FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN workspace_account_metadata m ON m.user_id=u.id
      WHERE u.id=$1 AND r.code='client' AND u.status IN ('active','invited') AND NOT coalesce(u.is_deleted,false) FOR SHARE OF u`, [input.existing_client_id]);
    details = rows[0]?.details;
  } else {
    const { rows } = await db.query("SELECT details FROM project_inquiries WHERE id=$1 AND coalesce(details->>'intake_draft','')<>'yes' FOR SHARE", [input.existing_client_id]);
    details = rows[0]?.details;
  }
  if (!details) throw new HttpError(409, "The selected client record is unavailable. Search for the client again.");
  const saved = profile(details);
  // A missing phone may be supplied for this inquiry without changing the account.
  return { ...input, ...saved, phone: saved.phone || input.phone, client_record: "existing" };
}
