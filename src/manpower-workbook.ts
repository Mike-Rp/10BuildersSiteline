// Reads the first sheet of an XLSX/XLS buffer into rows for parseManpowerRows. Keeps the xlsx dependency out of the pure parser.
import * as XLSX from "xlsx"
import { SUFFIX_LABELS } from "./identity.ts"
import { parseManpowerRows, type ManpowerImportReport } from "./manpower-import.ts"

export const MANPOWER_TEMPLATE_HEADERS = ["idnumber", "firstname", "middlename", "lastname", "suffix"]

export function parseManpowerWorkbook(data: ArrayBuffer | Uint8Array): ManpowerImportReport {
  let rows: unknown[][]
  try {
    const workbook = XLSX.read(data, { type: "array" })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) throw new Error("empty")
    // raw:false returns the text Excel shows, so a Text-formatted 02000-0045 stays intact.
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true })
  } catch {
    return {
      parserVersion: 1, headerRow: null, workers: [], newCount: 0, existingCount: 0,
      skipped: [], warnings: [], ok: false,
      errors: [{ row: 1, message: "This file can't be read. Save it as .xlsx and try again." }],
    }
  }
  return parseManpowerRows(rows)
}

const toBytes = (workbook: XLSX.WorkBook) => new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)
// How many empty idnumber cells the template pre-formats as Text, so a typed 02000-0045 keeps its leading zero.
const TEMPLATE_TEXT_ROWS = 1500

// Blank template: one header row, plus an Instructions sheet. The first TEMPLATE_TEXT_ROWS rows of the idnumber
// column are formatted as Text; the parser still reports an ID that Excel turned into a number further down.
export function buildManpowerTemplate(): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([MANPOWER_TEMPLATE_HEADERS])
  for (let row = 2; row <= TEMPLATE_TEXT_ROWS + 1; row++) sheet["A" + row] = { t: "s", v: "", z: "@" }
  sheet["!ref"] = `A1:E${TEMPLATE_TEXT_ROWS + 1}`
  sheet["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 8 }]
  const help = XLSX.utils.aoa_to_sheet([
    ["Manpower list template"],
    ["Fill the first sheet only. Keep the header row."],
    ["idnumber: leave blank for a new worker, the system assigns it. Keep an existing ID as written, like 02000-0045."],
    ["middlename may be blank. firstname and lastname are required."],
    [`suffix is optional: ${SUFFIX_LABELS.join(", ")}. Put it here, not in lastname.`],
    ["Example", "02000-0045", "Juan", "Reyes", "Santos", "Jr."],
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Manpower")
  XLSX.utils.book_append_sheet(workbook, help, "Instructions")
  return toBytes(workbook)
}

export type ExportedWorker = { id_number: string; first_name?: string | null; middle_name?: string | null; last_name?: string | null; suffix?: string | null }

// The company's current list in the same layout as the template, so it can be edited and uploaded again.
export function buildManpowerExport(workers: ExportedWorker[]): Uint8Array {
  const rows = workers.map((w) => [w.id_number, w.first_name ?? "", w.middle_name ?? "", w.last_name ?? "", w.suffix ?? ""])
  const sheet = XLSX.utils.aoa_to_sheet([MANPOWER_TEMPLATE_HEADERS, ...rows])
  sheet["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 8 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Manpower")
  return toBytes(workbook)
}
