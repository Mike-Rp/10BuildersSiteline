import test from "node:test"
import assert from "node:assert/strict"
import { CLIENT_EMAIL_PATTERN, clientEmailError } from "../Thesis-Backend/src/domain/client-email.js"

test("new client emails require the exact Gmail domain and reject lookalikes, suffixes and malformed addresses", () => {
  for (const email of [undefined, null, 42, "", "name@", "@gmail.com", "mika@gmial.com", "name@yahoo.com", "name@10builders.com", "name@gmail.com.evil", "name@notgmail.com", "name@@gmail.com", "na me@gmail.com", "name@gmail.com\nother@gmail.com", "x".repeat(245) + "@gmail.com"]) {
    assert.match(clientEmailError(email), /@gmail.com/)
  }
})
test("Gmail validation accepts case variations, trimmed input, dots and tags", () => {
  const htmlPattern = new RegExp("^(?:" + CLIENT_EMAIL_PATTERN + ")$")
  for (const email of ["mika@gmail.com", "Mika@GMAIL.COM", "mika.hiro+project@gmail.com", "  mika@gmail.com  "]) {
    assert.equal(clientEmailError(email), "", email)
    assert.equal(htmlPattern.test(email.trim()), true)
  }
})
