import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicQueueSummary} from '../src/pages/user/barber/publicQueueModel.js';
const now=Date.parse('2026-11-20T10:00:00.000Z');
const snapshot=(overrides={})=>({barber_id:7,waiting_count:0,currently_called:false,
 day_closed:true,new_arrival_estimate:null,as_of:new Date(now).toISOString(),...overrides});
test('v107: public summary carries explicit day closure without guest data',()=>{
 const result=parsePublicQueueSummary(snapshot({phone:'secret'}),7,now);
 assert.equal(result.day_closed,true);assert.equal(result.new_arrival_estimate,null);
 assert.equal(result.phone,undefined);
});
test('v107: closed shop cannot advertise a new-arrival ETA',()=>{
 assert.equal(parsePublicQueueSummary(snapshot({new_arrival_estimate:{min_minutes:0,max_minutes:30,approximate:true}}),7,now),null);
});
test('v107: malformed closure status cannot imply open',()=>{
 for(const bad of ['true',0,1,null,undefined])
  assert.equal(parsePublicQueueSummary(snapshot({day_closed:bad}),7,now),null);
});
test('v107: next day open again with a normal estimate',()=>{
 const row=snapshot({day_closed:false,new_arrival_estimate:{min_minutes:0,max_minutes:30,approximate:true}});
 assert.equal(parsePublicQueueSummary(row,7,now)?.day_closed,false);
});
