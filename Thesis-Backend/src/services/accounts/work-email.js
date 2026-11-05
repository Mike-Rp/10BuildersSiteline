// Staff work email: [first initial].[last name].[staff digits]@10builders.com, e.g. r.villaverde.00012@10builders.com.
// Mirrors src/identity.ts in the frontend; tests/id-numbers.test.mjs checks that both give the same answers.
export const WORK_EMAIL_DOMAIN = "10builders.com";
export const NAME_SUFFIXES = ["Jr.", "Sr.", "II", "III", "IV", "V"];
const SUFFIX_LOOKUP = Object.fromEntries(NAME_SUFFIXES.map(label => [label.toLowerCase().replace(/\.$/, ""), label]));
export const STAFF_ID_RE = /^10B-(\d{5}|[1-9]\d{5,})$/;

// "jr" -> "Jr.", "iii" -> "III". undefined for anything not on the list.
export const normalizeSuffix = value => SUFFIX_LOOKUP[String(value ?? "").trim().toLowerCase().replace(/[.,]$/, "")];

// "Santos Jr." or "Santos, Jr." -> { lastName: "Santos", suffix: "Jr." }. A one-word last name is never split.
export function splitTrailingSuffix(lastName) {
  const match = /^(.+?),?\s+(\S+)$/.exec(String(lastName ?? "").trim());
  const suffix = match ? normalizeSuffix(match[2]) : undefined;
  return match && suffix ? { lastName: match[1], suffix } : { lastName: String(lastName ?? "").trim(), suffix: "" };
}

// "Peña" -> "pena", "Dela Cruz" -> "delacruz", "D'Souza" -> "dsouza".
export const emailNamePart = value => String(value ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildWorkEmail(firstName, lastName, staffIdNumber) {
  const match = STAFF_ID_RE.exec(String(staffIdNumber ?? "").trim().toUpperCase());
  if (!match) throw new Error("A staff ID number like 10B-00012 is required.");
  const initial = emailNamePart(firstName).charAt(0);
  const last = emailNamePart(splitTrailingSuffix(lastName).lastName);
  if (!initial || !last) throw new Error("First and last name are needed to build a work email.");
  return `${initial}.${last}.${match[1]}@${WORK_EMAIL_DOMAIN}`;
}

// The name as stored in users.full_name: "Renz Santos Villaverde Jr."
export function composeFullName({ firstName, middleName, lastName, suffix }) {
  return [firstName, middleName, lastName, suffix].map(part => String(part ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
}
