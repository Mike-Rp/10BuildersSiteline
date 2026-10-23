import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))

test("login banners remain real WebP files in deployments without Git LFS", async () => {
  for (const slide of ["construction", "teams", "documents"]) {
    for (const width of [720, 1120]) {
      const path = `public/images/login-${slide}-${width}.webp`
      const bytes = await readFile(new URL(`../${path}`, import.meta.url))
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF", path)
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP", path)
      const attributes = execFileSync("git", ["check-attr", "filter", "text", "--", path], { cwd: root, encoding: "utf8" })
      assert.match(attributes, /filter: unset/)
      assert.match(attributes, /text: unset/)
      const options = { cwd: root, input: bytes, encoding: "utf8" }
      const stored = execFileSync("git", ["hash-object", `--path=${path}`, "--stdin"], options)
      const original = execFileSync("git", ["hash-object", "--no-filters", "--stdin"], options)
      assert.equal(stored, original, `${path} must store image bytes, not an LFS pointer`)
    }
  }
})
