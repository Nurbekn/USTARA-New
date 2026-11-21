import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_MANUAL_SERVICES,toggleManualService,secondsRemaining} from '../src/pages/queue/manualQueueModel.js';
import {readFileSync} from 'node:fs';

test('v38 manual queue allows at most 20 selected services and preserves selection on overflow',()=>{
 let ids=[];for(let i=1;i<=20;i++)ids=toggleManualService(ids,i,true);
 assert.equal(ids.length,MAX_MANUAL_SERVICES);
 assert.deepEqual(toggleManualService(ids,21,true),ids);
 assert.deepEqual(toggleManualService(ids,20,true),ids);
 assert.equal(toggleManualService(ids,7,false).length,19);
 assert.equal(toggleManualService(ids,21,false).length,20);
});
test('v38 helper rejects malformed IDs and keeps previous selection intact',()=>{
 const ids=[1,2];for(const id of [-1,0,2.5,NaN,'3',Infinity])assert.deepEqual(toggleManualService(ids,id,true),ids);
 assert.deepEqual(toggleManualService(ids,3,true),[1,2,3]);
 assert.deepEqual(toggleManualService(ids,2,false),[1]);
});
test('v38 countdown never returns NaN, Infinity or negative seconds',()=>{
 const now=Date.parse('2026-11-18T10:00:00Z');
 assert.equal(secondsRemaining('2026-11-18T10:00:01Z',now),1);
 assert.equal(secondsRemaining('2026-11-18T09:59:59Z',now),0);
 assert.equal(secondsRemaining('invalid',now),0);
 assert.equal(secondsRemaining(undefined,now),0);
 assert.equal(secondsRemaining('2026-11-18T10:00:01Z',NaN),0);
});
test('v38 manual UI clears private data on logout, checks stale requests and supports explicit retries',()=>{
 const source=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
 assert.match(source,/subscribeSession/);
 assert.match(source,/getToken\(\)!==token/);
 assert.match(source,/clearPrivate\(\)/);
 assert.match(source,/if\(e\.status===401\)\{clearPrivate\(\);clearSession\(\);setHasAccount\(false\);\}/);
 assert.match(source,/else if\(e\.status===403\)clearPrivate\(\)/);
 assert.match(source,/inFlight\.current\.has/);
 assert.match(source,/serviceErrors\[offer\.id\]/);
 assert.match(source,/Xizmatlarni qayta yuklash/);
 assert.match(source,/MAX_MANUAL_SERVICES/);
 assert.match(source,/setHasAccount\(!!current\)/);
 assert.match(source,/disabled=\{busy\|\|!hasAccount/);
 assert.match(source,/<Link to="\/login">Kirish<\/Link>/);
});
