import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLatestRequestGate} from '../src/pages/queue/requestOrderV42.js';
test('v42 newer polling response wins over slower earlier response',()=>{
 const gate=createLatestRequestGate();
 const older=gate.next();const newer=gate.next();
 assert.equal(gate.isLatest(older),false);
 assert.equal(gate.isLatest(newer),true);
});
test('v42 logout invalidates old requests even if the account later returns',()=>{
 const gate=createLatestRequestGate();const first=gate.next();
 gate.invalidate();assert.equal(gate.isLatest(first),false);
 const second=gate.next();assert.equal(gate.isLatest(second),true);
 for(const value of [null,undefined,0,NaN,1.5])assert.equal(gate.isLatest(value),false);
});
test('v42 manual queue UI checks both active account token and request generation',()=>{
 const source=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
 assert.match(source,/readGate\.current\.invalidate\(\)/);
 assert.match(source,/readGate\.current\.next\(\)/);
 assert.match(source,/getToken\(\)!==token\|\|!readGate\.current\.isLatest\(requestId\)/);
});
