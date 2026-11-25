import test from 'node:test';
import assert from 'node:assert/strict';
import { normalInquiryDeadline } from '../Thesis-Backend/src/domain/inquiry-office-hours.js';
test('Normal deadlines count nine office hours and skip evenings and weekends',()=>{
for(const [start,end] of [
 ['2026-11-23T08:00:00+08:00','2026-11-23T17:00:00+08:00'],
 ['2026-11-23T14:00:00+08:00','2026-11-24T14:00:00+08:00'],
 ['2026-11-27T14:00:00+08:00','2026-11-30T14:00:00+08:00'],
 ['2026-11-27T17:00:00+08:00','2026-11-30T17:00:00+08:00'],
 ['2026-11-28T12:00:00+08:00','2026-11-30T17:00:00+08:00'],
 ['2026-11-23T07:00:00+08:00','2026-11-23T17:00:00+08:00']
]) assert.equal(normalInquiryDeadline(start),new Date(end).toISOString());
});
