import test from "node:test"
import assert from "node:assert/strict"
import { CLIENT_EMAIL_PATTERN, clientEmailError } from "../Thesis-Backend/src/domain/client-email.js"

test("client emails reject missing, malformed and oversized addresses", () => {
  for (const email of [undefined, null, 42, "", "name@", "@gmail.com", "namegmail.com", "name@@gmail.com", "na me@gmail.com", "name@gmail.com\nother@gmail.com", "x".repeat(245) + "@gmail.com"]) {
    assert.match(clientEmailError(email), /valid client email/)
  }
})
test("clients can use their existing personal or business email with case variations, dots and tags", () => {
  const htmlPattern = new RegExp("^(?:" + CLIENT_EMAIL_PATTERN + ")$")
  for (const email of ["hiro.mika@gmail.com", "Hiro.Mika@GMAIL.COM", "hiro.mika+project@gmail.com", "  hiro.mika@yahoo.com  ", "client@outlook.com", "client@clientcompany.ph", "existing.client@10builders.com"]) {
    assert.equal(clientEmailError(email), "", email)
    assert.equal(htmlPattern.test(email.trim()), true)
  }
})
