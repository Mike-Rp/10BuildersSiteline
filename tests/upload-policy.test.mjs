import assert from "node:assert/strict"
import test from "node:test"
import XLSX from "xlsx"
import { readFileSync } from "node:fs"
import { readManpowerFile } from "../Thesis-Backend/src/services/workspace/manpower-import.utility.js"
import { validateUpload } from "../Thesis-Backend/src/services/workspace/upload-policy.utility.js"
import { fileType } from "../Thesis-Backend/src/services/progress/phase-upload.utility.js"
import { DOCUMENT_UPLOAD_LIMIT_MB, MANPOWER_UPLOAD_LIMIT_MB, uploadRequirements, validateFile } from "../src/model.ts"

const workbook = extension => {
  const book=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([["Name","Trade"],["Sample Worker","Carpenter"]]),"Manpower")
  return XLSX.write(book,{type:"buffer",bookType:extension})
}

test("documents accept PDF/PNG/JPG/JPEG, check content and reject Excel, CSV and WebP",async()=>{
  for(const [name,buffer,type] of [
    ["inspection.PDF",Buffer.from("%PDF-1.4"),"application/pdf"],
    ["inspection.png",Buffer.from([137,80,78,71,13,10,26,10]),"image/png"],
    ["inspection.jpg",Buffer.from([255,216,255]),"image/jpeg"],
    ["inspection.JPEG",Buffer.from([255,216,255]),"image/jpeg"],
  ]) assert.equal(await validateUpload({originalname:name,buffer}),type)
  for(const name of ["workers.xlsx","workers.xls","workers.csv","photo.webp","report.docx"])
    await assert.rejects(validateUpload({originalname:name,buffer:Buffer.from("%PDF-1.4")}),/Supported files/)
  await assert.rejects(validateUpload({originalname:"report.png",buffer:Buffer.from("%PDF-1.4")}),/does not match/)
  assert.throws(()=>fileType({originalname:"photo.webp",buffer:Buffer.from("RIFFxxxxWEBP")}),/Supported files/)
  await assert.rejects(validateUpload({originalname:"report.pdf",buffer:Buffer.alloc(10*1024*1024+1)}),/10 MB/)
})

test("Excel manpower lists accept real XLSX/XLS and cannot use document rules",async()=>{
  for(const extension of ["xlsx","xls"]) {
    const buffer=workbook(extension)
    const contentType=await validateUpload({originalname:`crew.${extension}`,buffer},"manpower")
    assert.match(contentType,/application\/vnd\./)
    await assert.rejects(validateUpload({original_name:`crew.${extension}`,content:buffer},"document"),/Supported files/)
  }
  for(const name of ["crew.csv","crew.pdf","crew.png"])
    await assert.rejects(validateUpload({originalname:name,buffer:Buffer.from("test")},"manpower"),/Excel/)
  for(const name of ["crew.xlsx","crew.xls"])
    await assert.rejects(validateUpload({originalname:name,buffer:Buffer.from("renamed text")},"manpower"),/valid/)
  await assert.rejects(validateUpload({originalname:"crew.xlsx",buffer:Buffer.alloc(15*1024*1024+1)},"manpower"),/15 MB/)
  await assert.rejects(validateUpload({originalname:"crew.xlsx",buffer:workbook("xlsx")},"anything"),/purpose/)
})

test("valid XLSX namespace prefixes and absolute relationships are accepted for all 800 laborers", async () => {
  const buffer = readFileSync(new URL("./fixtures/prefixed-manpower.xlsx", import.meta.url))
  const file = { originalname: "800-laborers-sample.xlsx", buffer }
  assert.equal(await validateUpload(file, "manpower"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  const workers = readManpowerFile(file)
  assert.equal(workers.length, 800)
  assert.equal(new Set(workers.map(worker => worker.workerId)).size, 800)
  assert.deepEqual(workers[0], { workerId: "W-0001", name: "Juan Santos" })
  assert.deepEqual(workers[799], { workerId: "W-0800", name: "Diana Villanueva" })
})

test("frontend rejects cross-purpose formats, empty files and unsupported extensions",()=>{
  assert.match(validateFile(new File([],"report.pdf")),/non-empty/)
  for(const name of ["crew.xlsx","crew.xls","crew.csv","photo.webp"])
    assert.match(validateFile(new File(["test"],name)),/files only/)
  for(const name of ["report.pdf","photo.png","crew.csv"])
    assert.match(validateFile(new File(["test"],name),true),/files only/)
  assert.equal(validateFile(new File(["test"],"crew.XLSX"),true),"")
})

test("each PDF permits up to 10 MB, rejects one byte over, and retains the separate Excel limit", () => {
  const mb = 1024 * 1024
  assert.equal(DOCUMENT_UPLOAD_LIMIT_MB, 10)
  assert.equal(MANPOWER_UPLOAD_LIMIT_MB, 15)
  for (const name of ["report.pdf", "REPORT.PDF", "photo.jpg", "photo.jpeg", "photo.png"]) {
    assert.equal(validateFile({ name, size: 10 * mb }), "")
    assert.match(validateFile({ name, size: 10 * mb + 1 }), /10 MB or smaller/)
  }
  assert.equal(validateFile({ name: "crew.xlsx", size: 15 * mb }, true), "")
  assert.match(validateFile({ name: "crew.xlsx", size: 15 * mb + 1 }, true), /15 MB or smaller/)
  assert.match(uploadRequirements(), /Project files share a 10 MB total limit/)
  assert.match(uploadRequirements(true), /Maximum 15 MB per file/)
})
