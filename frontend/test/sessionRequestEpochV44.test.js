import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSessionRequestEpoch} from '../src/pages/queue/sessionRequestEpochV44.js';

test('v44: captured async request belongs to one session only',()=>{
 const gate=createSessionRequestEpoch();
 const first=gate.capture();
 assert.equal(gate.isCurrent(first),true);
 gate.invalidate();
 assert.equal(gate.isCurrent(first),false);
 const next=gate.capture();
 assert.equal(gate.isCurrent(next),true);
 gate.invalidate();
 assert.equal(gate.isCurrent(next),false);
 assert.equal(gate.isCurrent(NaN),false);
});
test('v44: manual queue invalidates in-flight service fetch on logout/login',()=>{
 const source=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
 assert.match(source,/serviceEpoch\.current\.invalidate\(\)/);
 assert.match(source,/inFlight\.current\.clear\(\)/);
 assert.match(source,/serviceEpoch\.current\.capture\(\)/);
 assert.match(source,/getToken\(\)===token&&serviceEpoch\.current\.isCurrent\(epoch\)/);
});
