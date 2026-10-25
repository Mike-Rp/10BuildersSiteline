// Uploads, including site photos awaiting release, are internal by default.
import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { newUploadedDoc } from "../src/uploadDocument.ts"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n")
const file = { name: "site.jpg", size: 1234, type: "image/jpeg" }

test("uploads are internal by default and client-visible only when asked", () => {
  const base = { id: "d1", label: "Evidence", file, owner: "Site PM" }
  assert.equal(newUploadedDoc(base).clientVisible, false)
  assert.equal(newUploadedDoc({ ...base, clientVisible: false }).clientVisible, false)
  assert.equal(newUploadedDoc({ ...base, clientVisible: true }).clientVisible, true)
  // Anything that is not exactly true stays internal.
  assert.equal(newUploadedDoc({ ...base, clientVisible: undefined }).clientVisible, false)
  const doc = newUploadedDoc({ ...base, clientVisible: true })
  assert.deepEqual([doc.id, doc.label, doc.name, doc.uploaded, doc.owner, doc.size, doc.mime], ["d1", "Evidence", "site.jpg", true, "Site PM", 1234, "image/jpeg"])
})

test("the shared Upload component builds its document through that rule and defaults to internal", () => {
  const panels = read("../src/panels.tsx")
  const upload = panels.slice(panels.indexOf("export function Upload("), panels.indexOf("export function Upload(") + 4500)
  assert.match(upload, /clientVisible = false,/, "the prop defaults to internal")
  assert.match(upload, /newUploadedDoc\(\{ id, label, file, owner, clientVisible \}\)/)
  assert.doesNotMatch(upload, /clientVisible: true/)
})

test("site photo upload accurately describes pending release and no upload pre-releases photos", () => {
  const screens = ["../src/RoleWorkspace.tsx", "../src/App.tsx", "../src/panels.tsx", "../src/ClientPortal.tsx", "../src/LeadSubcontractorPanel.tsx"]
  for (const path of screens) {
    const source = read(path)
    for (const match of source.matchAll(/<Upload\b[\s\S]*?\/>/g)) {
      assert.doesNotMatch(match[0], /\bclientVisible\b/, "uploads cannot claim the photo has already been released")
    }
  }
  assert.match(read("../src/RoleWorkspace.tsx"), /Site photo \(pending client release\)/)
})
