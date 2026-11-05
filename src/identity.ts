// ID numbers and staff work emails. Pure (no React/DOM) so it can be tested.
// Subcontractor worker: "<company code>-<seq>", e.g. 02000-0045. Staff: "10B-<seq>", e.g. 10B-00012.
// Numbers are text, never integers, so leading zeros survive Excel and the database.
// Company code and worker seq are minimum widths, not limits: 02000-9999 is followed by 02000-10000.
export const COMPANY_CODE_DIGITS = 5
export const WORKER_SEQ_DIGITS = 4
export const STAFF_SEQ_DIGITS = 5
export const STAFF_PREFIX = "10B"
export const WORK_EMAIL_DOMAIN = "10builders.com"

const pad = (value: number, digits: number) => String(value).padStart(digits, "0")

export function formatCompanyCode(code: number) {
  if (!Number.isSafeInteger(code) || code < 0) throw new Error("Company code must be a whole number.")
  return pad(code, COMPANY_CODE_DIGITS)
}
export function formatWorkerIdNumber(companyCode: number | string, seq: number) {
  const code = formatCompanyCode(Number(companyCode))
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error("Worker sequence must be a whole number from 1.")
  return `${code}-${pad(seq, WORKER_SEQ_DIGITS)}`
}
export function formatStaffIdNumber(seq: number) {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error("Staff sequence must be a whole number from 1.")
  return `${STAFF_PREFIX}-${pad(seq, STAFF_SEQ_DIGITS)}`
}

export type ParsedIdNumber =
  | { kind: "worker"; companyCode: string; seq: number }
  | { kind: "staff"; seq: number }
// Accepts surrounding spaces and a lowercase staff prefix. Returns undefined for anything else.
// Only the canonical spelling parses: a part longer than its minimum width has no leading zero,
// so 02000-0045 and 02000-00045 can never both exist.
export function parseIdNumber(value: unknown): ParsedIdNumber | undefined {
  const text = String(value ?? "").trim().toUpperCase()
  const worker = /^(\d{5}|[1-9]\d{5,})-(\d{4}|[1-9]\d{4,})$/.exec(text)
  if (worker) return { kind: "worker", companyCode: worker[1], seq: Number(worker[2]) }
  const staff = new RegExp(`^${STAFF_PREFIX}-(\\d{${STAFF_SEQ_DIGITS}}|[1-9]\\d{${STAFF_SEQ_DIGITS},})$`).exec(text)
  if (staff) return { kind: "staff", seq: Number(staff[1]) }
  return undefined
}

// Optional name suffix, stored in the display form on the right. Keyed by the bare lowercase form.
const SUFFIXES: Record<string, string> = { jr: "Jr.", sr: "Sr.", ii: "II", iii: "III", iv: "IV", v: "V" }
export const SUFFIX_LABELS = Object.values(SUFFIXES)
// "jr" -> "Jr.", "iii" -> "III". Returns undefined for anything not on the list.
export function normalizeSuffix(value: string) {
  return SUFFIXES[value.trim().toLowerCase().replace(/[.,]$/, "")]
}
// "Santos Jr." or "Santos, Jr." -> { lastName: "Santos", suffix: "Jr." }. A one-word last name is never split.
export function splitTrailingSuffix(lastName: string) {
  const match = /^(.+?),?\s+(\S+)$/.exec(lastName.trim())
  const suffix = match ? normalizeSuffix(match[2]) : undefined
  return match && suffix ? { lastName: match[1], suffix } : { lastName: lastName.trim(), suffix: "" }
}

// "Peña" -> "pena", "Dela Cruz" -> "delacruz", "D'Souza" -> "dsouza".
export function emailNamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}
// [first initial].[last name].[staff digits]@10builders.com, from the staff ID. Email never changes after a rename.
// A suffix is left out: "Santos Jr." gives j.santos.00012, not j.santosjr.00012.
export function buildWorkEmail(firstName: string, lastName: string, staffIdNumber: string) {
  const parsed = parseIdNumber(staffIdNumber)
  if (parsed?.kind !== "staff") throw new Error("A staff ID number like 10B-00012 is required.")
  const initial = emailNamePart(firstName).charAt(0)
  const last = emailNamePart(splitTrailingSuffix(lastName).lastName)
  if (!initial || !last) throw new Error("First and last name are needed to build a work email.")
  return `${initial}.${last}.${pad(parsed.seq, STAFF_SEQ_DIGITS)}@${WORK_EMAIL_DOMAIN}`
}
