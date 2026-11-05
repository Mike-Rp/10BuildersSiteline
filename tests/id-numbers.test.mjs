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
