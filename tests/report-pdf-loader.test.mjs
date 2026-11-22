import test from "node:test"
import assert from "node:assert/strict"
import { createReportPdfSafely, PdfExporterLoadError } from "../src/report-pdf-loader.ts"

test("missing report, engine and font modules produce a reloadable error without exposing asset URLs", async () => {
  for (const message of ["'text/html' is not a valid JavaScript MIME type for module script 'https://example.test/assets/report-pdf-old.js'", "Failed to fetch dynamically imported module: /assets/old.js", "Importing a module script failed.", "Loading chunk 42 failed."]) {
    const error = new TypeError(message)
    for (const load of [async () => { throw error }, async () => ({createReportPdf:async () => { throw error }})]) {
      await assert.rejects(createReportPdfSafely("<h1>Report</h1>",false,load), reason => {
        assert.ok(reason instanceof PdfExporterLoadError)
        assert.match(reason.message,/Reload the page/)
        assert.doesNotMatch(reason.message,/text\/html|assets\/|example\.test/)
        return true
      })
    }
  }
})

test("successful PDF export preserves the template and layout; generation errors remain distinguishable", async () => {
  const blob = new Blob(["pdf"],{type:"application/pdf"})
  assert.equal(await createReportPdfSafely("approved snapshot",true,async () => ({ createReportPdf:async (html,landscape) => {
    assert.equal(html,"approved snapshot"); assert.equal(landscape,true); return blob
  }})),blob)
  const error = new Error("Invalid PDF table")
  await assert.rejects(createReportPdfSafely("",false,async () => ({createReportPdf:async () => {throw error}})), reason => reason === error)
})
