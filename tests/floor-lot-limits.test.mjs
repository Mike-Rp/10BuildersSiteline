import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFloorMeasurements } from '../Thesis-Backend/src/domain/inquiry-assessment.js';
test('floor measurements respect lot area in both modes without limiting combined floor area', () => {
  assert.equal(normalizeFloorMeasurements({mode:'same',areaPerFloor:235},5,234),null);
  assert.equal(normalizeFloorMeasurements({mode:'same',areaPerFloor:60},5,234).total,300);
  assert.equal(normalizeFloorMeasurements({mode:'individual',areas:[134,60,80,90,100]},5,234).total,464);
  assert.equal(normalizeFloorMeasurements({mode:'individual',areas:[134,235,60]},3,234),null);
  assert.equal(normalizeFloorMeasurements({mode:'individual',areas:[134,60]},2,100),null);
  assert.equal(normalizeFloorMeasurements({mode:'individual',areas:[234,234]},2,234).total,468);
  assert.equal(normalizeFloorMeasurements({mode:'individual',areas:[60,'']},2,234),null);
});
