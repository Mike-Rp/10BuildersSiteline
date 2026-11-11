import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseCoverageQuota } from '../src/phase-coverage-policy.ts';
test('50% specialty coverage rounds up for every phase size', () => {
 for (const [count, quota] of [[1,1],[2,1],[3,2],[4,2],[5,3],[6,3]]) assert.equal(phaseCoverageQuota(Array.from({length:count},(_,i)=>String(i))),quota);
 assert.equal(phaseCoverageQuota(['a','a','b','c']),2);
});
