import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLatestRequestGate} from '../src/pages/queue/requestOrderV42.js';
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
test('v49 QR status polling rejects response from a slower earlier request',async()=>{
 const gate=createLatestRequestGate(),older=deferred(),newer=deferred();
 let ticket=null;
 const refresh=async(future)=>{const epoch=gate.next();const value=await future.promise;
  if(gate.isLatest(epoch))ticket=value;
 };
 const first=refresh(older),second=refresh(newer);
 newer.resolve('called');await second;
 older.resolve('waiting');await first;
 assert.equal(ticket,'called');
});
test('v49 QR submission/route invalidation rejects old poll and keeps fresh response',async()=>{
 const gate=createLatestRequestGate(),old=gate.next();
 gate.invalidate();const fresh=gate.next();
 assert.equal(gate.isLatest(old),false);
 assert.equal(gate.isLatest(fresh),true);
});
test('v49 QR page fences both request sequence and receipt; aborts on unmount',()=>{
 const src=readFileSync(new URL('../src/pages/queue/QueueCheckIn.jsx',import.meta.url),'utf8');
 assert.match(src,/statusGate=useRef\(createLatestRequestGate\(\)\)/);
 assert.match(src,/statusGate\.current\.next\(\)/);
 assert.match(src,/keyRef\.current!==receipt\|\|!statusGate\.current\.isLatest\(epoch\)/);
 assert.match(src,/controller\.abort\(\);statusGate\.current\.invalidate\(\)/);
 assert.match(src,/statusGate\.current\.invalidate\(\); \/\/ submission result wins/);
});
