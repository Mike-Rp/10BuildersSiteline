import assert from "node:assert/strict"
import test from "node:test"
import {
  buildWorkEmail,
  emailNamePart,
  formatCompanyCode,
  formatStaffIdNumber,
  formatWorkerIdNumber,
  normalizeSuffix,
  parseIdNumber,
} from "../src/identity.ts"
import { describeIssue, parseManpowerRows } from "../src/manpower-import.ts"
import { buildManpowerTemplate, parseManpowerWorkbook } from "../src/manpower-workbook.ts"

const HEADER = ["idnumber", "firstname", "middlename", "lastname"]

test("ID numbers keep leading zeros and reject bad input", () => {
  assert.equal(formatCompanyCode(2000), "02000")
  assert.equal(formatWorkerIdNumber(2000, 45), "02000-0045")
  assert.equal(formatWorkerIdNumber("02000", 9999), "02000-9999")
  assert.equal(formatStaffIdNumber(12), "10B-00012")
  assert.equal(formatWorkerIdNumber(2000, 10000), "02000-10000")
  assert.equal(formatWorkerIdNumber(100000, 1), "100000-0001")
  assert.throws(() => formatWorkerIdNumber(2000, 0))
  assert.throws(() => formatCompanyCode(-1))
  assert.deepEqual(parseIdNumber("02000-10000"), { kind: "worker", companyCode: "02000", seq: 10000 })
  assert.deepEqual(parseIdNumber("100000-0001"), { kind: "worker", companyCode: "100000", seq: 1 })
  assert.equal(parseIdNumber("02000-00045"), undefined)
  assert.equal(parseIdNumber("002000-0045"), undefined)
  assert.equal(formatStaffIdNumber(123456), "10B-123456")
  assert.deepEqual(parseIdNumber("10B-123456"), { kind: "staff", seq: 123456 })
  assert.equal(parseIdNumber("10B-012345"), undefined)
  assert.deepEqual(parseIdNumber(" 02000-0045 "), { kind: "worker", companyCode: "02000", seq: 45 })
  assert.deepEqual(parseIdNumber("10b-00012"), { kind: "staff", seq: 12 })
  assert.equal(parseIdNumber("2000-45"), undefined)
  assert.equal(parseIdNumber(""), undefined)
})

test("work email is initial.lastname.digits and strips accents and punctuation", () => {
  assert.equal(buildWorkEmail("Renz", "Villaverde", "10B-00012"), "r.villaverde.00012@10builders.com")
  assert.equal(buildWorkEmail("Mary Grace", "Dela Cruz", "10B-00003"), "m.delacruz.00003@10builders.com")
  assert.equal(buildWorkEmail("Ñico", "Peña", "10B-00004"), "n.pena.00004@10builders.com")
  assert.equal(buildWorkEmail("Dan", "Santos-Reyes", "10B-00005"), "d.santosreyes.00005@10builders.com")
  assert.equal(buildWorkEmail("Juan", "Santos Jr.", "10B-00007"), "j.santos.00007@10builders.com")
  assert.equal(emailNamePart("D'Souza"), "dsouza")
  assert.throws(() => buildWorkEmail("Juan", "Santos", "02000-0045"))
  assert.throws(() => buildWorkEmail("", "Santos", "10B-00005"))
})

test("the backend work-email builder gives the same answers as the frontend one", async () => {
  const backend = await import("../Thesis-Backend/src/services/accounts/work-email.js")
  const names = [
    ["Renz", "Villaverde"], ["Mary Grace", "Dela Cruz"], ["Ñico", "Peña"], ["Dan", "Santos-Reyes"],
    ["Juan", "Santos Jr."], ["Ana", "Dela Cruz, III"], ["Leo", "V"], ["Jose", "D'Souza"],
  ]
  for (const staffId of ["10B-00012", "10B-99999", "10B-100000"])
    for (const [first, last] of names)
      assert.equal(backend.buildWorkEmail(first, last, staffId), buildWorkEmail(first, last, staffId), `${first} ${last} ${staffId}`)
  for (const value of ["jr", "Jr.", "III", "iv", "v", "Esq.", "", "senior"])
    assert.equal(backend.normalizeSuffix(value), normalizeSuffix(value), value)
  assert.throws(() => backend.buildWorkEmail("Juan", "Santos", "02000-0045"))
  assert.throws(() => backend.buildWorkEmail("", "Santos", "10B-00005"))
})

test("a clean file imports with new and existing workers", () => {
  const report = parseManpowerRows([
    HEADER,
    ["02000-0001", "Juan", "Reyes", "Santos"],
    ["", "Maria", "", "Cruz"],
  ])
  assert.equal(report.ok, true)
  assert.equal(report.workers.length, 2)
  assert.equal(report.existingCount, 1)
  assert.equal(report.newCount, 1)
  assert.equal(report.workers[1].middleName, "")
})

test("suffix is optional, normalized, and pulled out of lastname when typed there", () => {
  const report = parseManpowerRows([
    [...HEADER, "suffix"],
    ["", "Juan", "", "Santos", "jr"],
    ["", "Jose", "", "Reyes", "iii"],
    ["", "Ana", "", "Lim", ""],
    ["", "Pedro", "", "Cruz, Sr.", ""],
    ["", "Leo", "", "V", ""],
    ["", "Ben", "", "Tan", "Esq."],
  ])
  assert.deepEqual(report.workers.map((w) => [w.lastName, w.suffix]), [
    ["Santos", "Jr."], ["Reyes", "III"], ["Lim", ""], ["Cruz", "Sr."], ["V", ""],
  ])
  assert.deepEqual(report.warnings.map((w) => w.row), [5])
  assert.deepEqual(report.errors.map((e) => e.row), [7])
  assert.match(report.errors[0].message, /suffix "Esq\." is not recognized/)
})

test("the suffix column is optional and matched under other names", () => {
  const report = parseManpowerRows([["Name Ext.", ...HEADER], ["", "", "Juan", "", "Santos"], ["II", "", "Jose", "", "Cruz"]])
  assert.equal(report.ok, true)
  assert.deepEqual(report.workers.map((w) => w.suffix), ["", "II"])
  assert.equal(parseManpowerRows([HEADER, ["", "Juan", "", "Santos"]]).workers[0].suffix, "")
})

test("headers are found below a title and matched loosely", () => {
  const report = parseManpowerRows([
    ["Acme Builders manpower"],
    [],
    ["ID Number", "First Name", "Middle Name", "Last Name"],
    ["02000-0001", "Juan", "", "Santos"],
  ])
  assert.equal(report.headerRow, 3)
  assert.equal(report.ok, true)
})

test("blank and total rows are skipped and reported", () => {
  const report = parseManpowerRows([HEADER, ["02000-0001", "Juan", "", "Santos"], [], ["Total", "", "", "1"]])
  assert.equal(report.ok, true)
  assert.deepEqual(report.skipped.map((s) => s.row), [3, 4])
})

test("duplicate, malformed and numeric ids are errors with row numbers", () => {
  const report = parseManpowerRows([
    HEADER,
    ["02000-0001", "Juan", "", "Santos"],
    ["02000-0001", "Pedro", "", "Cruz"],
    ["ABC", "Ana", "", "Lim"],
    ["200045", "Leo", "", "Tan"],
    ["", "", "", "Solo"],
  ])
  assert.equal(report.ok, false)
  assert.deepEqual(report.errors.map((e) => e.row), [3, 4, 5, 6])
  assert.match(describeIssue(report.errors[0]), /^Row 3: idnumber 02000-0001 is already used on row 2/)
  assert.match(report.errors[2].message, /Text/)
  assert.match(report.errors[3].message, /firstname is blank/)
})

test("the row limit counts filled rows only, so formatted empty rows do not block a real list", () => {
  const worker = (i) => ["", "First" + i, "", "Last" + i]
  const filled = Array.from({ length: 5000 }, (_, i) => worker(i))
  const blanks = Array.from({ length: 300 }, () => ["", "", "", ""])
  const ok = parseManpowerRows([HEADER, ...filled, ...blanks])
  assert.equal(ok.ok, true)
  assert.equal(ok.workers.length, 5000)
  assert.equal(ok.skipped.length, 300)
  const over = parseManpowerRows([HEADER, ...filled, worker(5000), ...blanks])
  assert.equal(over.ok, false)
  assert.equal(over.errors.length, 1)
  assert.equal(over.errors[0].row, 5002)
  assert.match(over.errors[0].message, /more than 5000 rows/)
})

test("a missing header names the column", () => {
  const report = parseManpowerRows([["idnumber", "firstname"], ["02000-0001", "Juan"]])
  assert.equal(report.ok, false)
  assert.match(report.errors[0].message, /lastname/)
})

test("a header with no workers is rejected", () => {
  const report = parseManpowerRows([HEADER])
  assert.equal(report.ok, false)
  assert.match(report.errors[0].message, /no workers/)
})

test("the generated template round-trips through the workbook reader", () => {
  const empty = parseManpowerWorkbook(buildManpowerTemplate())
  assert.equal(empty.headerRow, 1)
  assert.equal(empty.workers.length, 0)
  assert.equal(empty.ok, false)
})

test("an unreadable file gives a plain error, not a crash", () => {
  const report = parseManpowerWorkbook(new Uint8Array([1, 2, 3]))
  assert.equal(report.ok, false)
  assert.equal(report.errors.length, 1)
})
