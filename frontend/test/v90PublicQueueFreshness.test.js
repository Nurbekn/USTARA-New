import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePublicQueueSummary, createPublicQueueRequestRunner,
  PUBLIC_QUEUE_MAX_AGE_MS, PUBLIC_QUEUE_MAX_FUTURE_MS,
} from '../src/pages/user/barber/publicQueueModel.js';

const t = Date.parse('2026-11-19T14:20:00.000Z');
const sample = {
  barber_id: 7, waiting_count: 3, currently_called: true, day_closed: false,
  new_arrival_estimate: {min_minutes: 15, max_minutes: 90, approximate: true},
  as_of: new Date(t).toISOString(),
};
const valid = (row = sample, barber = 7, now = t) => parsePublicQueueSummary(row, barber, now);
test('fresh public queue counts and coarse ETA can be shown', () => {
  assert.deepEqual(valid(),sample);
  assert.ok(valid(sample,'7'));
  assert.equal(valid(sample,8),null);
});
test('unknown private metadata never reaches components', () => {
  const result = valid({...sample,phone:'+9981', display_label:'Guest',ticket_id:2,customer_id:55});
  assert.equal(Object.hasOwn(result,'phone'),false);
  assert.equal(Object.hasOwn(result,'display_label'),false);
  assert.equal(Object.hasOwn(result,'customer_id'),false);
  assert.deepEqual(Object.keys(result).sort(),['barber_id','waiting_count','currently_called','day_closed','new_arrival_estimate','as_of'].sort());
});
test('ETA unavailable can be shown as unknown, not zero minutes', () => {
  assert.equal(valid({...sample,new_arrival_estimate:null}).new_arrival_estimate,null);
});
test('queue timestamp beyond max age or future clock skew fails closed', () => {
  assert.ok(valid(sample,7,t+PUBLIC_QUEUE_MAX_AGE_MS));
  assert.equal(valid(sample,7,t+PUBLIC_QUEUE_MAX_AGE_MS+1),null);
  assert.ok(valid(sample,7,t-PUBLIC_QUEUE_MAX_FUTURE_MS));
  assert.equal(valid(sample,7,t-PUBLIC_QUEUE_MAX_FUTURE_MS-1),null);
});
for (const bad of ['', '2026-11-19','tomorrow','2026-11-19T14:20:00Z',
 '2026-11-19T14:20:00.000+00:00','2026-02-30T14:20:00.000Z',null,0])
  test(`reject bad or noncanonical update timestamp ${String(bad)}`,()=>{
    assert.equal(valid({...sample,as_of:bad}),null);
  });
for (const bad of [-1,1.5,'0','3',null,undefined,true,2147483648,Number.NaN])
 test(`reject invalid queue count ${String(bad)}`,()=>{
  assert.equal(valid({...sample,waiting_count:bad}),null);
 });
for (const bad of ['true',1,0,null,undefined])
 test(`reject nonboolean call state ${String(bad)}`,()=>{
  assert.equal(valid({...sample,currently_called:bad}),null);
 });
for (const bad of [null,[],undefined,{},'7',0,2147483648])
 test(`reject wrong response identity ${String(bad)}`,()=>{
  assert.equal(valid({...sample,barber_id:bad}),null);
 });
for (const bad of ['07','7e0','0x7',7.5,0,2147483648])
 test(`reject invalid requested profile ID ${String(bad)}`,()=>{
  assert.equal(valid(sample,bad),null);
 });
for (const [name,eta] of Object.entries({
  noObject:'50', noNumber:{min_minutes:'15',max_minutes:30,approximate:true},
  badOrder:{min_minutes:30,max_minutes:10,approximate:true},
  negative:{min_minutes:-5,max_minutes:10,approximate:true},
  fiveMinuteStep:{min_minutes:7,max_minutes:30,approximate:true},
  tooLong:{min_minutes:0,max_minutes:1445,approximate:true},
  notApprox:{min_minutes:0,max_minutes:30,approximate:false},
  infinity:{min_minutes:0,max_minutes:Infinity,approximate:true},
  missingApprox:{min_minutes:0,max_minutes:30},
  array:[],
  undefined:undefined,
 }))test(`reject invalid ETA ${name}`,()=>{
  assert.equal(valid({...sample,new_arrival_estimate:eta}),null);
 });
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('older network response cannot overwrite newer result even if it ignores abort',async()=>{
  const a=deferred(),b=deferred(),results=[],signals=[];
  const req=createPublicQueueRequestRunner((id,signal)=>{signals.push(signal);return signals.length===1?a.promise:b.promise;},x=>results.push(x),()=>t);
  const first=req.refresh(7),second=req.refresh(7);
  assert.equal(signals[0].aborted,true);
  b.resolve({...sample,waiting_count:4});await second;
  a.resolve({...sample,waiting_count:1});await first;
  assert.equal(results.length,1);assert.equal(results[0].value.waiting_count,4);
  req.stop();
});
test('a failed update clears previous queue rather than leaving misleading older number',async()=>{
  let attempts=0;const results=[];
  const req=createPublicQueueRequestRunner(async()=>{attempts++;if(attempts===2)throw Error('offline');return sample;},x=>results.push(x),()=>t);
  await req.refresh(7);await req.refresh(7);
  assert.deepEqual(results.map(x=>x.status),['ready','error']);
  assert.equal(results[1].value,null);
  req.stop();
});
test('wrong barber response from server is never accepted',async()=>{
  const results=[];
  const req=createPublicQueueRequestRunner(async()=>sample,x=>results.push(x),()=>t);
  await req.refresh(8);
  assert.deepEqual(results.map(x=>x.status),['error']);
  req.stop();
});
test('unmounted view cancels outstanding request and ignores late success',async()=>{
  const job=deferred(),results=[];
  const req=createPublicQueueRequestRunner(()=>job.promise,x=>results.push(x),()=>t);
  const pending=req.refresh(7);req.stop();job.resolve(sample);await pending;
  await req.refresh(7);
  assert.deepEqual(results,[]);
});
test('latest failed response is visible only to its current request',async()=>{
  const a=deferred(),b=deferred(),results=[];let count=0;
  const req=createPublicQueueRequestRunner(()=>++count===1?a.promise:b.promise,x=>results.push(x),()=>t);
  const first=req.refresh(7),second=req.refresh(7);
  b.resolve(sample);await second;
  a.reject(Error('slow timeout'));await first;
  assert.deepEqual(results.map(x=>x.status),['ready']);req.stop();
});
