import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMixedUseScope, normalizeMixedUseScope } from '../Thesis-Backend/src/domain/mixed-use-scope.js';
import { inquiryEngineerScopes } from '../Thesis-Backend/src/domain/inquiry-engineer-scopes.js';
import { inquiryPhases } from '../Thesis-Backend/src/services/projects/inquiries.js';
test('Mixed-Use inquiry scope generates all supported phase combinations with specialty mappings',async()=>{
 for(let features=0;features<16;features++) {
  const scope={...defaultMixedUseScope(),uses:['residential','retail','office','hotel'],basis:'Confirmed project plans and contracted scope.',confirmed:true};
  Object.keys(scope.features).forEach((key,index)=>scope.features[key]=!!(features&(1<<index)));
  const expected=normalizeMixedUseScope(scope).phases;
  const actual=await inquiryPhases({query(){throw Error('Scope must generate its own phases')}},'Mixed-Use',{...scope,phases:['Spoofed phase']});
  assert.deepEqual(actual,expected);
  assert.deepEqual(Object.keys(inquiryEngineerScopes('Mixed-Use',actual)),actual);
  assert.equal(new Set(actual).size,actual.length);
 }
});
