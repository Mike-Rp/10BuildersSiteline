import assert from "node:assert/strict"
import test from "node:test"
import XLSX from "xlsx"
import { validateUpload } from "../Thesis-Backend/src/services/workspace/upload-policy.utility.js"
import { fileType } from "../Thesis-Backend/src/services/progress/phase-upload.utility.js"
import { validateFile } from "../src/model.ts"

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

test("frontend rejects cross-purpose formats, empty files and unsupported extensions",()=>{
  assert.match(validateFile(new File([],"report.pdf")),/non-empty/)
  for(const name of ["crew.xlsx","crew.xls","crew.csv","photo.webp"])
    assert.match(validateFile(new File(["test"],name)),/files only/)
  for(const name of ["report.pdf","photo.png","crew.csv"])
    assert.match(validateFile(new File(["test"],name),true),/files only/)
  assert.equal(validateFile(new File(["test"],"crew.XLSX"),true),"")
})
