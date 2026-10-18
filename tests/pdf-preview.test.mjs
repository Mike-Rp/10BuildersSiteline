import assert from "node:assert/strict"
import test from "node:test"
import { canHideNativePdfToolbar } from "../src/pdfFirstPage.ts"

test("native PDF toolbar hiding is trusted only for Chromium desktop viewers", () => {
  // Chrome / Edge / Brave desktop
  assert.equal(
    canHideNativePdfToolbar({ userAgentData: {}, pdfViewerEnabled: true }),
    true,
  )
  // Firefox and Safari have no userAgentData
  assert.equal(canHideNativePdfToolbar({ pdfViewerEnabled: true }), false)
  // Android Chrome has no inline PDF viewer
  assert.equal(
    canHideNativePdfToolbar({ userAgentData: {}, pdfViewerEnabled: false }),
    false,
  )
  assert.equal(canHideNativePdfToolbar({}), false)
})
