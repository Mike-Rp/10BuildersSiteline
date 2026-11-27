import test from 'node:test';
import assert from 'node:assert/strict';
import {floorAreaRange, normalizeFloorMeasurements} from '../src/domain/inquiry-assessment.js';
import {inquiryDetails} from '../src/services/projects/inquiries.js';
const input={client_name:'Sample',email:'client@example.com',phone:'+639321321321',name:'Sample',address:'Sample',project_type:'Residential',lot_area:250,floor_count:2,floor_area_sqm:500,consultation:30};
test('admin minimum is lot area times floor count',()=>{
 assert.equal(floorAreaRange(250,2).minimum,500);
 assert.equal(inquiryDetails(input).floor_area_sqm,500);
 assert.throws(()=>inquiryDetails({...input,floor_area_sqm:499.99}));
 assert.throws(()=>inquiryDetails({...input,floor_area_sqm:40}));
 assert.throws(()=>inquiryDetails({...input,floor_area_sqm:850.01}));
});
test('OPM same-area floors enforce 90% inclusive and 170% maximum',()=>{
 assert.equal(normalizeFloorMeasurements({mode:'same',areaPerFloor:225},2,250).total,450);
 assert.equal(normalizeFloorMeasurements({mode:'same',areaPerFloor:224.99},2,250),null);
 assert.ok(normalizeFloorMeasurements({mode:'same',areaPerFloor:425},2,250));
 assert.equal(normalizeFloorMeasurements({mode:'same',areaPerFloor:425.01},2,250),null);
});
test('OPM individual floors enforce first 90%, subsequent 70% without average masking',()=>{
 assert.equal(normalizeFloorMeasurements({mode:'individual',areas:[225,175]},2,250).total,400);
 for(const areas of [[224.99,300],[300,174.99],[426,175],[225,426]]) assert.equal(normalizeFloorMeasurements({mode:'individual',areas},2,250),null);
 assert.equal(normalizeFloorMeasurements({mode:'individual',areas:[225]},2,250),null);
 assert.equal(normalizeFloorMeasurements({mode:'individual',areas:[225,175,175]},3,250).total,575);
});
