import assert from "node:assert/strict"
import test from "node:test"
import XLSX from "xlsx"
import { companyRegistrationErrors, manpowerRows } from "../Thesis-Backend/src/domain/company-registration.js"
import { readManpowerFile } from "../Thesis-Backend/src/services/workspace/manpower-import.utility.js"
import { applyWorkflow } from "../src/workflows.ts"
import { initialState } from "./fixtures/demo-state.ts"

const valid = { name: "New Crew Company", phone: "09171234567", email: "new.company@gmail.com" }
function book(rows, extension = "xlsx") {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Manpower")
  return { originalname: `laborers.${extension}`, buffer: XLSX.write(workbook, { type: "buffer", bookType: extension }) }
}

test("company contacts require exactly 11 digits and an exact Gmail domain", () => {
  assert.deepEqual(companyRegistrationErrors(valid), {})
  assert.deepEqual(companyRegistrationErrors({ ...valid, email: " USER.Name+crew@GMAIL.COM " }), {})
  for (const phone of ["", "0917", "091712345678", "+639171234567", "0917abc4567", 9171234567])
    assert.match(companyRegistrationErrors({ ...valid, phone }).phone, /11-digit/)
  for (const email of ["", "company@yahoo.com", "company@notgmail.com", "company@gmail.com.evil", "user name@gmail.com", "user@@gmail.com"])
    assert.match(companyRegistrationErrors({ ...valid, email }).email, /@gmail.com/)
})

test("two-column XLSX and XLS lists count laborers and retain their IDs", () => {
  for (const extension of ["xlsx", "xls"]) {
    const workers = readManpowerFile(book([["Worker ID", "Laborer Name"], ["0001", "Juan Dela Cruz"], ["0002", "Maria Santos"], [], ["0003", "  Pedro   Reyes  "]], extension))
    assert.deepEqual(workers, [{ workerId: "0001", name: "Juan Dela Cruz" }, { workerId: "0002", name: "Maria Santos" }, { workerId: "0003", name: "Pedro Reyes" }])
  }
})

test("missing columns, empty rosters, incomplete rows, duplicate IDs and formulas are rejected", () => {
  for (const rows of [[], [["Worker ID", "Laborer Name"]], [["Worker ID"], ["1"]], [["Worker ID", "Laborer Name"], ["", "Juan"]], [["Worker ID", "Laborer Name"], ["1", ""]]])
    assert.throws(() => readManpowerFile(book(rows)), /Worker ID|Laborer Name/)
  assert.throws(() => readManpowerFile(book([["Worker ID", "Laborer Name"], ["W1", "Juan"], ["w1", "Pedro"]])), /more than once/)
  assert.throws(() => manpowerRows([{ name: "One", rows: [["Worker ID", "Laborer Name"], ["1", "Juan"]] }, { name: "Two", rows: [["Worker ID", "Laborer Name"], ["1", "Pedro"]] }]), /more than once/)
  const workbook = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([["Worker ID", "Laborer Name"], ["1", "Juan"]])
  sheet.A2 = { t: "s", v: "1", f: '"1"' }
  XLSX.utils.book_append_sheet(workbook, sheet, "Manpower")
  assert.throws(() => readManpowerFile({ buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) }), /without formulas/)
  assert.equal(readManpowerFile(book([["Worker ID", "Laborer Name"], ["1", "Juan"], ["2", "Juan"]])).length, 2, "Two people may share a name when IDs differ")
})

test("a Site PM can suggest an unassigned company with no projects, and only its owner can withdraw it", () => {
  const state = initialState()
  state.projects = []
  const company = { ...valid, id: "standalone", contact: "", status: "approved", submittedBy: "", projectId: "forged", availability: "committed",
    manpowerCount: 999, activeProjectIds: ["forged"], manpowerDocuments: [], documents: [], note: "", version: 1 }
  const requested = applyWorkflow(state, "a5", { type: "request_company", company })
  const saved = requested.companies.find(item => item.id === company.id)
  assert.equal(saved.projectId, "")
  assert.equal(saved.status, "pending")
  assert.equal(saved.availability, "available")
  assert.equal(saved.manpowerCount, 0)
  assert.deepEqual(saved.activeProjectIds, [])
  assert.throws(() => applyWorkflow(requested, "a4", { type: "archive_company_request", companyId: saved.id }), /Only your/)
  assert.equal(applyWorkflow(requested, "a5", { type: "archive_company_request", companyId: saved.id }).companies.find(item => item.id === saved.id).status, "archived")
  assert.equal(company.availability, "committed", "Do not mutate the caller's draft")
})
