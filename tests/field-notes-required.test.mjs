import test from "node:test"
import assert from "node:assert/strict"
import { assertUpdateHasContent } from "../Thesis-Backend/src/services/progress/phase-update.utility.js"

test("API progress submissions require meaningful field notes regardless of attachments, checklists or issue categories", () => {
  for (const note of [undefined,null,""," \t\n "]) {
    for (const body of [{}, {file_ids:["file"]}, {checklist_submissions:[{item_id:"1"}]}, {issue_categories:["Safety"]}]) {
      assert.throws(()=>assertUpdateHasContent({...body,note},true),error=>error.status===422 && /field notes/i.test(error.message))
    }
  }
  assert.doesNotThrow(()=>assertUpdateHasContent({note:"Concrete delivery recorded."}))
})
