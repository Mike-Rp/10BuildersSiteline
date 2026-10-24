// Manpower list import: idnumber, firstname, middlename, lastname, suffix (optional). Pure (no React/DOM, no xlsx) so it can be tested.
// Takes sheet rows (array of arrays) and returns the workers plus a report that explains every decision.
import { normalizeSuffix, parseIdNumber, splitTrailingSuffix, SUFFIX_LABELS } from "./identity.ts"

export const MANPOWER_PARSER_VERSION = 1
export const MAX_IMPORT_ROWS = 5000
const HEADER_SEARCH_ROWS = 20

export type ImportIssue = { row: number; message: string }
export type ImportedWorker = {
  row: number
  idNumber: string // empty when the worker is new and the system will assign one
  firstName: string
  middleName: string
  lastName: string
  suffix: string // "Jr.", "III", or empty
}
export type ManpowerImportReport = {
  parserVersion: number
  headerRow: number | null
  workers: ImportedWorker[]
  newCount: number // rows without an idnumber
  existingCount: number // rows with a valid idnumber
  skipped: ImportIssue[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
  ok: boolean // no errors and at least one worker
}

const ALIASES: Record<string, string> = {
  idnumber: "idNumber",
  idno: "idNumber",
  id: "idNumber",
  firstname: "firstName",
  givenname: "firstName",
  middlename: "middleName",
  middleinitial: "middleName",
  lastname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  suffix: "suffix",
  namesuffix: "suffix",
  ext: "suffix",
  nameext: "suffix",
  extension: "suffix",
  nameextension: "suffix",
}
const REQUIRED = ["idNumber", "firstName", "lastName"] as const
export const normalizeHeader = (value: unknown) =>
  String(value ?? "").toLowerCase().replace(/[^a-z]/g, "")

const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()

function findHeader(rows: unknown[][]) {
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const columns: Record<string, number> = {}
    rows[i].forEach((cell, index) => {
      const key = ALIASES[normalizeHeader(cell)]
      if (key && !(key in columns)) columns[key] = index
    })
    if (REQUIRED.every((key) => key in columns)) return { index: i, columns }
  }
  return null
}
// Which required headers the best candidate row is missing, so the message can name them.
function missingHeaders(rows: unknown[][]) {
  let best: string[] = [...REQUIRED]
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const found = new Set(rows[i].map((cell) => ALIASES[normalizeHeader(cell)]).filter(Boolean))
    const missing = REQUIRED.filter((key) => !found.has(key))
    if (missing.length < best.length) best = missing
  }
  return best
}
const HEADER_LABEL: Record<string, string> = { idNumber: "idnumber", firstName: "firstname", lastName: "lastname" }

export function parseManpowerRows(rows: unknown[][]): ManpowerImportReport {
  const report: ManpowerImportReport = {
    parserVersion: MANPOWER_PARSER_VERSION,
    headerRow: null,
    workers: [],
    newCount: 0,
    existingCount: 0,
    skipped: [],
    errors: [],
    warnings: [],
    ok: false,
  }
  const header = findHeader(rows)
  if (!header) {
    const names = missingHeaders(rows).map((key) => HEADER_LABEL[key]).join(", ")
    report.errors.push({ row: 1, message: `Missing column: ${names}. Use the template headers: idnumber, firstname, middlename, lastname, suffix.` })
    return report
  }
  report.headerRow = header.index + 1
  const { columns } = header
  const body = rows.slice(header.index + 1)
  // Only filled rows count toward the limit: empty rows that still carry Excel formatting are not workers.
  let filled = 0
  for (let offset = 0; offset < body.length; offset++) {
    if (body[offset].every((cell) => !text(cell))) continue
    if (++filled > MAX_IMPORT_ROWS) {
      report.errors.push({ row: header.index + offset + 2, message: `The file has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files.` })
      return report
    }
  }
  const seen = new Map<string, number>()
  body.forEach((cells, offset) => {
    const row = header.index + offset + 2
    const get = (key: string) => (key in columns ? text(cells[columns[key]]) : "")
    const values = [get("idNumber"), get("firstName"), get("middleName"), get("lastName"), get("suffix")]
    if (cells.every((cell) => !text(cell))) {
      report.skipped.push({ row, message: "Blank row." })
      return
    }
    if (cells.some((cell) => /^total\b/i.test(text(cell)))) {
      report.skipped.push({ row, message: "Total row." })
      return
    }
    const [rawId, firstName, middleName, typedLastName, rawSuffix] = values
    let idNumber = ""
    if (rawId) {
      const parsed = parseIdNumber(rawId)
      if (parsed?.kind !== "worker") {
        report.errors.push({
          row,
          message: /^\d+$/.test(rawId)
            ? `idnumber "${rawId}" lost its format. Set the idnumber column to Text so it reads like 02000-0045.`
            : `idnumber "${rawId}" is not valid. Use the form 02000-0045, or leave it blank for a new worker.`,
        })
        return
      }
      idNumber = rawId.toUpperCase().trim()
      const first = seen.get(idNumber)
      if (first) {
        report.errors.push({ row, message: `idnumber ${idNumber} is already used on row ${first}.` })
        return
      }
      seen.set(idNumber, row)
    }
    if (!firstName || !typedLastName) {
      report.errors.push({ row, message: `${!firstName ? "firstname" : "lastname"} is blank.` })
      return
    }
    let lastName = typedLastName
    let suffix = ""
    if (rawSuffix) {
      suffix = normalizeSuffix(rawSuffix) ?? ""
      if (!suffix) {
        report.errors.push({ row, message: `suffix "${rawSuffix}" is not recognized. Use ${SUFFIX_LABELS.join(", ")}, or leave it blank.` })
        return
      }
    } else {
      // "Santos Jr." typed into lastname: move the suffix to its own field and say so in the report.
      const split = splitTrailingSuffix(typedLastName)
      if (split.suffix) {
        ;({ lastName, suffix } = split)
        report.warnings.push({ row, message: `Moved "${suffix}" from lastname to suffix. Last name is now "${lastName}".` })
      }
    }
    report.workers.push({ row, idNumber, firstName, middleName, lastName, suffix })
    if (idNumber) report.existingCount++
    else report.newCount++
  })
  report.ok = report.errors.length === 0 && report.workers.length > 0
  if (!report.workers.length && !report.errors.length)
    report.errors.push({ row: report.headerRow, message: "The file has a header but no workers." })
  return report
}

// One line per issue for the user: "Row 22: lastname is blank."
export const describeIssue = (issue: ImportIssue) => `Row ${issue.row}: ${issue.message}`
