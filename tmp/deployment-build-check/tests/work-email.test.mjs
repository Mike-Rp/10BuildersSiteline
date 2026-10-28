import assert from "node:assert/strict"
import test from "node:test"
import {suggestWorkEmail} from "../src/model.ts"

const names=(first,middle,last)=>({first,middle,last})
const used=(...emails)=>emails.map(email=>({email}))

test("work email follows lastname.firstname, then adds the middle initial, then a number",()=>{
  assert.equal(suggestWorkEmail(names("Juan","Antonio","Cruz"),[]),"cruz.juan@10builders.com")
  assert.equal(suggestWorkEmail(names("Juan","Antonio","Cruz"),used("cruz.juan@10builders.com")),"cruz.juan.a@10builders.com")
  assert.equal(suggestWorkEmail(names("Juan","Antonio","Cruz"),used("cruz.juan@10builders.com","CRUZ.JUAN.A@10builders.com")),"cruz.juan.a2@10builders.com")
  assert.equal(suggestWorkEmail(names("Juan","Antonio","Cruz"),used("cruz.juan@10builders.com","cruz.juan.a@10builders.com","cruz.juan.a2@10builders.com")),"cruz.juan.a3@10builders.com")
})
test("without a middle name the number follows the base form; accents and punctuation are normalized",()=>{
  assert.equal(suggestWorkEmail(names("Juan","","Cruz"),used("cruz.juan@10builders.com")),"cruz.juan2@10builders.com")
  assert.equal(suggestWorkEmail(names("José","Ñ.","de la Peña"),[]),"delapena.jose@10builders.com")
  assert.equal(suggestWorkEmail(names("José","Ñ.","de la Peña"),used("delapena.jose@10builders.com")),"delapena.jose.n@10builders.com")
  assert.equal(suggestWorkEmail(names("","","Cruz"),[]),"")
})
