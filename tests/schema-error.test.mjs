import assert from "node:assert/strict"
import test from "node:test"
import { handleError } from "../Thesis-Backend/src/common/utilities/access.utility.js"

const respond = () => {
  const out = {}
  const res = {
    status(code) {
      out.status = code
      return res
    },
    json(body) {
      out.body = body
      return res
    },
  }
  return { res, out }
}

test("a missing column, table or function becomes a plain migration message, not raw SQL", () => {
  for (const code of ["42703", "42P01", "42883"]) {
    const { res, out } = respond()
    handleError(res, Object.assign(new Error('column "weight" of relation "x" does not exist'), { code }))
    assert.equal(out.status, 503)
    assert.match(out.body.message, /pending database migrations/)
    assert.ok(!/weight|relation|column/.test(out.body.message))
  }
})
