import assert from "node:assert/strict"
import test from "node:test"
import { footprintError } from "../Thesis-Backend/src/domain/site-occupancy.js"

test("planning occupancy checks the ground floor separately from total floor area", () => {
  assert.equal(footprintError(210,147,41900,true), "")
  assert.match(footprintError(210,147.01,41900,true), /147 m²/)
  assert.match(footprintError(210,210,41900,true), /70%/)
  assert.match(footprintError(210,147,100,true), /include at least/)
  assert.match(footprintError(210,undefined,41900,true), /Enter the ground-floor footprint/)
  assert.equal(footprintError(210,undefined,41900), "", "legacy inquiries retain unknown footprints")
  assert.match(footprintError(210,0,41900,true), /positive/)
})
