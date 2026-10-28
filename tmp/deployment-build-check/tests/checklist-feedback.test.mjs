// What a Site PM sees under a checklist activity: the Office PM's rejection reason is never confused with the
// note the Site PM wrote when uploading.
import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { checklistFeedback } from "../src/checklistFeedback.ts"

const SUBMITTED = "Uploaded the signed inspection sheet"
const REJECTED = "Photo is blurry; re-shoot the rebar spacing"
const REWORK = "Withdrawn after the slab crack report"

test("rejected evidence shows the reviewer's reason, and the submission note stays separate", () => {
  const feedback = checklistFeedback({ status: "missing", reviewNote: REJECTED, submissionNote: SUBMITTED })
  assert.equal(feedback.rejection, REJECTED)
  assert.equal(feedback.submission, SUBMITTED)
  assert.notEqual(feedback.rejection, feedback.submission)
  assert.equal(feedback.rework, undefined)
})

test("a submitted or approved item never shows a rejection, whatever notes it carries", () => {
  for (const status of ["submitted", "approved"]) {
    const feedback = checklistFeedback({ status, reviewNote: "Looks good", submissionNote: SUBMITTED })
    assert.equal(feedback.rejection, undefined, status)
    assert.equal(feedback.submission, SUBMITTED, status)
  }
})

test("a submission note alone is never presented as a rejection", () => {
  const feedback = checklistFeedback({ status: "missing", submissionNote: SUBMITTED })
  assert.equal(feedback.rejection, undefined)
  assert.equal(feedback.submission, SUBMITTED)
})

test("rework keeps its own reason and is not shown as a rejection", () => {
  const feedback = checklistFeedback({ status: "rework_required", reviewNote: REWORK, reworkReason: REWORK, submissionNote: SUBMITTED })
  assert.equal(feedback.rework, REWORK)
  assert.equal(feedback.rejection, undefined)
  assert.equal(feedback.submission, SUBMITTED)
})

test("the Site PM checklist renders those three notes with distinct labels and no leftover mixed field", () => {
  const source = fs.readFileSync(new URL("../src/RoleWorkspace.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n")
  assert.match(source, /Rejected by Office PM:<\/strong> \{checklistFeedback\(item\)\.rejection\}/)
  assert.match(source, /Rework: \{checklistFeedback\(item\)\.rework\}/)
  assert.match(source, /Your submission note: \{checklistFeedback\(item\)\.submission\}/)
  assert.doesNotMatch(source, /\{item\.note\b/)
})
