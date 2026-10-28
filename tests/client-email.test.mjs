import test from "node:test"
import assert from "node:assert/strict"
import { CLIENT_EMAIL_PATTERN, clientEmailError } from "../Thesis-Backend/src/domain/client-email.js"

test("new client emails require the exact company domain and reject personal addresses, lookalikes and malformed addresses", () => {
  for (const email of [undefined, null, 42, "", "name@", "@10builders.com", "name@gmail.com", "name@yahoo.com", "name@10builder.com", "name@10builders.com.evil", "name@sub.10builders.com", "name@not10builders.com", "name@@10builders.com", "na me@10builders.com", "name@10builders.com\nother@10builders.com", "x".repeat(245) + "@10builders.com"]) {
    assert.match(clientEmailError(email), /@10builders\.com/)
  }
})
test("client company-email validation accepts case variations, trimmed input, dots and tags", () => {
  const htmlPattern = new RegExp("^(?:" + CLIENT_EMAIL_PATTERN + ")$")
  for (const email of ["hiro.mika@10builders.com", "Hiro.Mika@10BUILDERS.COM", "hiro.mika+project@10builders.com", "  hiro.mika@10builders.com  "]) {
    assert.equal(clientEmailError(email), "", email)
    assert.equal(htmlPattern.test(email.trim()), true)
  }
})
