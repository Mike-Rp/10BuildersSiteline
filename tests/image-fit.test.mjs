import assert from "node:assert/strict"
import test from "node:test"
import { fitImageToLimit, fittedSize, isShrinkable, jpegName } from "../src/imageFit.ts"
import { MAX_UPLOAD_BYTES, UPLOAD_LIMIT_LABEL } from "../src/model.ts"

test("the shared upload limit is 4 MB, below the 4.5 MB Vercel request limit", () => {
  assert.equal(MAX_UPLOAD_BYTES, 4 * 1024 * 1024)
  assert.equal(UPLOAD_LIMIT_LABEL, "4 MB")
  assert.ok(MAX_UPLOAD_BYTES < 4.5 * 1024 * 1024)
})

test("only a JPG or PNG over the limit is shrunk", () => {
  const over = MAX_UPLOAD_BYTES + 1
  assert.equal(isShrinkable({ name: "site.jpg", type: "image/jpeg", size: over }), true)
  assert.equal(isShrinkable({ name: "site.PNG", type: "", size: over }), true)
  assert.equal(isShrinkable({ name: "site.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES }), false)
  assert.equal(isShrinkable({ name: "scan.pdf", type: "application/pdf", size: over }), false)
  assert.equal(isShrinkable({ name: "crew.xlsx", type: "", size: over }), false)
})

test("shrinking keeps the aspect ratio and never enlarges", () => {
  assert.deepEqual(fittedSize(4000, 3000, 2000), { width: 2000, height: 1500 })
  assert.deepEqual(fittedSize(3000, 4000, 2000), { width: 1500, height: 2000 })
  assert.deepEqual(fittedSize(800, 600, 2000), { width: 800, height: 600 })
  assert.equal(jpegName("IMG_0001.PNG"), "IMG_0001.jpg")
})

test("a file that is not shrinkable, or cannot be decoded, comes back unchanged", async () => {
  const pdf = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "scan.pdf", { type: "application/pdf" })
  assert.equal(await fitImageToLimit(pdf), pdf)
  const small = new File([new Uint8Array(10)], "ok.jpg", { type: "image/jpeg" })
  assert.equal(await fitImageToLimit(small), small)
  // No browser image decoder in this environment: the original is returned and the normal size check explains it.
  const broken = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.jpg", { type: "image/jpeg" })
  assert.equal(await fitImageToLimit(broken), broken)
})
