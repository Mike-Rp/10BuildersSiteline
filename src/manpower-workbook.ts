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

// Blank template: one header row, plus an Instructions sheet. The idnumber column is not pre-formatted as Text;
// the parser reports an ID that Excel turned into a number.
export function buildManpowerTemplate(): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([MANPOWER_TEMPLATE_HEADERS])
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
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)
}
