import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAccountAction} from '../src/pages/queue/manualQueueActionV40.js';
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('v40 action retains initiating account token across async request',async()=>{
 let current='old',passed;const done=deferred(),called=[];
 const job=executeAccountAction({token:'old',currentToken:()=>current,
  action:async token=>{passed=token;return done.promise;},onSuccess:()=>called.push('success'),
  onFailure:()=>called.push('error'),refresh:()=>called.push('refresh'),onComplete:()=>called.push('complete')});
 current='new';done.resolve({booking_id:1});
 assert.equal(await job,false);assert.equal(passed,'old');assert.deepEqual(called,[]);
});
test('v40 a revoked account cannot start a new stale action',async()=>{
 let calls=0;
 assert.equal(await executeAccountAction({token:'old',currentToken:()=>null,action:()=>{calls++;}}),false);
 assert.equal(calls,0);
});
test('v40 matching account gets exactly one result and refresh',async()=>{
 const events=[];
 const ok=await executeAccountAction({token:'same',currentToken:()=> 'same',action:async t=>t,
  onSuccess:v=>events.push('success:'+v),refresh:()=>events.push('refresh'),
  onComplete:()=>events.push('complete')});
 assert.equal(ok,true);assert.deepEqual(events,['success:same','refresh','complete']);
});
test('v40 only active account receives error; refresh failures do not mask action errors',async()=>{
 const errors=[],done=[];
 assert.equal(await executeAccountAction({token:'same',currentToken:()=> 'same',
  action:async()=>{throw Error('rejected');},onFailure:e=>errors.push(e.message),
  refresh:async()=>{throw Error('offline');},onComplete:()=>done.push('done')}),false);
 assert.deepEqual(errors,['rejected']);assert.deepEqual(done,['done']);
});
