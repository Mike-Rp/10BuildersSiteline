import assert from "node:assert/strict"
import test from "node:test"
import * as XLSX from "xlsx"
import { parseManpowerRows } from "../src/manpower-import.ts"
import { buildManpowerExport, buildManpowerTemplate, parseManpowerWorkbook } from "../src/manpower-workbook.ts"
import { filterWorkers, importPayload, limitIssues, previewCounts, previewSentence, rejectionIssues } from "../src/manpower-ui.ts"

const HEADER = ["idnumber", "firstname", "middlename", "lastname", "suffix"]

test("the payload sends the Excel row, the ID as typed, and every name part", () => {
  const report = parseManpowerRows([HEADER, ["02000-0001", "Pedro", "", "Abad", ""], ["", "Juan", "Reyes", "Santos", "jr"]])
  assert.deepEqual(importPayload(report), [
    { row: 2, id_number: "02000-0001", first_name: "Pedro", middle_name: "", last_name: "Abad", suffix: "" },
    { row: 3, id_number: "", first_name: "Juan", middle_name: "Reyes", last_name: "Santos", suffix: "Jr." },
  ])
})

test("the preview counts blank rows instead of listing them", () => {
  const blanks = Array.from({ length: 198 }, () => ["", "", "", "", ""])
  const report = parseManpowerRows([HEADER, ["", "Juan", "", "Santos", ""], ["02000-0001", "Pedro", "", "Abad", ""], ...blanks, ["Total", "", "", "", "2"]])
  assert.deepEqual(previewCounts(report), { newCount: 1, existingCount: 1, blankRows: 198, otherSkipped: 1, errors: 0, warnings: 0 })
  assert.equal(previewSentence(report), "1 new worker, 1 existing worker, 198 blank rows ignored, 1 total row ignored")
  assert.equal(previewSentence(parseManpowerRows([HEADER, ["", "A", "", "B", ""], ["", "C", "", "D", ""]])), "2 new workers, 0 existing workers")
})

test("long problem lists are cut off with a count of the rest", () => {
  const issues = Array.from({ length: 73 }, (_, i) => ({ row: i + 2, message: "x" }))
  const { shown, hidden } = limitIssues(issues)
  assert.equal(shown.length, 50)
  assert.equal(hidden, 23)
  assert.deepEqual(limitIssues(issues.slice(0, 3)), { shown: issues.slice(0, 3), hidden: 0 })
})

test("a server rejection keeps its row numbers, and other failures keep their message", () => {
  const rejected = Object.assign(new Error("The file was not imported."), { status: 422, rows: [{ row: 5, message: "bad" }, { nope: 1 }] })
  assert.deepEqual(rejectionIssues(rejected), { issues: [{ row: 5, message: "bad" }], message: "The file was not imported." })
  assert.deepEqual(rejectionIssues(new Error("Cannot reach the server.")), { issues: [], message: "Cannot reach the server." })
  assert.equal(rejectionIssues("weird").message, "The import failed. Nothing was saved.")
})

test("worker search matches ID number, name or role, with every word required", () => {
  const workers = [
    { id_number: "02000-0001", full_name: "Pedro Abad", role_title: "Rebar Installer" },
    { id_number: "02000-0004", full_name: "Antonio Jacinto", role_title: "Crew Foreman" },
    { id_number: "02000-1001", full_name: "Juan Reyes Santos Jr.", role_title: null },
  ]
  assert.equal(filterWorkers(workers, "").length, 3)
  assert.deepEqual(filterWorkers(workers, "0004").map((w) => w.id_number), ["02000-0004"])
  assert.deepEqual(filterWorkers(workers, "  JUAN   santos ").map((w) => w.id_number), ["02000-1001"])
  assert.deepEqual(filterWorkers(workers, "foreman antonio").map((w) => w.id_number), ["02000-0004"])
  assert.equal(filterWorkers(workers, "pedro foreman").length, 0)
})

test("the exported list uploads back unchanged, and IDs keep their leading zeros", () => {
  const bytes = buildManpowerExport([
    { id_number: "02000-0001", first_name: "Pedro", middle_name: null, last_name: "Abad", suffix: null },
    { id_number: "02000-1001", first_name: "Juan", middle_name: "Reyes", last_name: "Santos", suffix: "Jr." },
  ])
  const report = parseManpowerWorkbook(bytes)
  assert.equal(report.ok, true)
  assert.deepEqual(report.workers.map((w) => [w.idNumber, w.firstName, w.middleName, w.lastName, w.suffix]), [
    ["02000-0001", "Pedro", "", "Abad", ""],
    ["02000-1001", "Juan", "Reyes", "Santos", "Jr."],
  ])
})

test("the template's idnumber column is pre-formatted as Text, and a typed ID survives", () => {
  const workbook = XLSX.read(buildManpowerTemplate(), { type: "array", cellStyles: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  assert.equal(sheet.A2.z, "@")
  assert.equal(sheet.A1500.z, "@")
  // Someone types an ID into the pre-formatted column and a name beside it, then saves.
  sheet.A2 = { t: "s", v: "02000-0045", z: "@" }
  sheet.B2 = { t: "s", v: "Juan" }
  sheet.D2 = { t: "s", v: "Santos" }
  const filled = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }))
  const report = parseManpowerWorkbook(filled)
  assert.equal(report.ok, true)
  assert.equal(report.workers[0].idNumber, "02000-0045")
  assert.equal(report.workers.length, 1)
})
