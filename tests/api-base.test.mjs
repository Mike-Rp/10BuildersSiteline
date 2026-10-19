import assert from "node:assert/strict"
import test from "node:test"
import { resolveApiBase } from "../src/api/base.ts"

test("published builds route accidental loopback overrides to the hosted API", () => {
  for (const host of ["localhost", "127.0.0.1", "127.0.0.2", "[::1]", "0.0.0.0", "api.localhost"]) {
    assert.equal(resolveApiBase(`http://${host}:3000/api/v1`, true), "/api/v1")
  }
  assert.equal(resolveApiBase(undefined, true), "/api/v1")
})

test("API configuration preserves local development and separate HTTPS backends", () => {
  assert.equal(resolveApiBase(undefined, false), "http://localhost:3000/api/v1")
  assert.equal(resolveApiBase("http://localhost:3001/api/v1", false), "http://localhost:3001/api/v1")
  assert.equal(resolveApiBase(" https://api.example.com/api/v1/ ", true), "https://api.example.com/api/v1")
  assert.equal(resolveApiBase("/api/v1", true), "/api/v1")
})
