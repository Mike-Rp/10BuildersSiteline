import assert from "node:assert/strict"
import test from "node:test"
import { resolveApiBase } from "../src/api/base.ts"

test("published builds always use the Express API on the website's domain", () => {
  for (const configured of [
    undefined, "", "/api/v1", "http://localhost:3000/api/v1",
    "http://127.0.0.1:3000/api/v1", "http://[::1]:3000/api/v1",
    "https://bockxrkbcswkbtggblzo.supabase.co",
    "https://api.example.com/api/v1", "invalid address",
  ]) {
    assert.equal(resolveApiBase(configured, true), "/api/v1")
  }
})

test("local development retains its configurable API address", () => {
  assert.equal(resolveApiBase(undefined, false), "http://localhost:3000/api/v1")
  assert.equal(resolveApiBase("  ", false), "http://localhost:3000/api/v1")
  assert.equal(resolveApiBase("http://localhost:3001/api/v1", false), "http://localhost:3001/api/v1")
  assert.equal(resolveApiBase(" https://api.example.com/api/v1/ ", false), "https://api.example.com/api/v1")
})
