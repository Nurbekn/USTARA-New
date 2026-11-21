'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {transaction}=require('../services/smartBookingOffers');
const {queueEntryId,createQueueSelfExit}=require('../services/queueSelfExit');
const {createHandlers}=require('../controllers/queueSelfExitController');
function fakeDb({commitError=null,beginError=null,rollbackError=null}={}) {
 const sql=[],releases=[];
 const c={query:async q=>{
  sql.push(q);
  if(q==='BEGIN'&&beginError)throw beginError;
  if(q==='COMMIT'&&commitError)throw commitError;
  if(q==='ROLLBACK'&&rollbackError)throw rollbackError;
  return {rows:[],rowCount:0};
 },release:b=>releases.push(b)};
 return {db:{connect:async()=>c},sql,releases};
}
test('v91 successful transaction returns result and releases healthy connection',async()=>{
 const f=fakeDb();assert.deepEqual(await transaction(f.db,async()=>({ok:true})),{ok:true});
 assert.equal(f.sql.at(-1),'COMMIT');assert.deepEqual(f.releases,[false]);
});
test('v91 COMMIT uncertainty permanently discards connection, no misleading ROLLBACK',async()=>{
 const original=Object.assign(new Error('connection reset'),{code:'ECONNRESET'});
 const f=fakeDb({commitError:original});
 await assert.rejects(transaction(f.db,async()=>42),e=>e===original&&e.commitUncertain===true);
 assert.equal(f.sql.filter(x=>x==='COMMIT').length,1);
 assert.ok(!f.sql.includes('ROLLBACK'));
 assert.deepEqual(f.releases,[true]);
});
test('v91 failed operation rolls back and safely returns healthy connection',async()=>{
 const f=fakeDb();await assert.rejects(transaction(f.db,async()=>{throw Error('bad request');}),/bad request/);
 assert.equal(f.sql.at(-1),'ROLLBACK');assert.deepEqual(f.releases,[false]);
});
test('v91 failed rollback discards connection',async()=>{
 const f=fakeDb({rollbackError:Error('broken')});
 await assert.rejects(transaction(f.db,async()=>{throw Error('failure');}),/failure/);
 assert.deepEqual(f.releases,[true]);
});
test('v91 BEGIN failure avoids rollback and returns connection cleanly',async()=>{
 const f=fakeDb({beginError:Error('cannot begin')});
 await assert.rejects(transaction(f.db,async()=>42),/cannot begin/);
 assert.deepEqual(f.releases,[false]);assert.ok(!f.sql.includes('ROLLBACK'));
});
for (const val of ['0','-1','01','0001','+1',' 1','1 ','1e2','0x10','1.0', '2147483648','Infinity','NaN','abc','',null,undefined,0,1.5,2147483648]) {
 test('v91 queue ID rejects noncanonical input '+String(val),()=>assert.equal(queueEntryId(val),null));
}
for(const val of ['1','2147483647',1,2147483647]){
 test('v91 queue ID accepts canonical PG int4 '+String(val),()=>assert.equal(queueEntryId(val),Number(val)));
}
test('v91 malformed ID is rejected before opening DB transaction',async()=>{
 let connected=false;
 const db={connect:async()=>{connected=true;throw Error('should never connect');}};
 await assert.rejects(createQueueSelfExit(db).leaveManual({entry_id:'0x10',actor:{}}),{status:400,code:'invalid_entry'});
 assert.equal(connected,false);
});
function response(){return {code:0,headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};}
test('v91 controller maps ambiguous COMMIT to safe recheck-only response',async()=>{
 const db={connect:async()=>{throw Object.assign(new Error('private commit failure'),{commitUncertain:true,status:409});}};
 const api=createHandlers(db),res=response();
 await api.leaveQr({body:{token:'a'.repeat(48),request_id:'b'.repeat(32)}},res);
 assert.equal(res.code,503);assert.equal(res.body.code,'queue_result_unknown');
 assert.match(res.body.message,/holatini tekshiring/);
 assert.ok(!JSON.stringify(res.body).includes('private'));
 assert.equal(res.headers['Cache-Control'],'no-store');
});
test('v91 controller maps serialization retry SQLSTATE to 409 without sensitive detail',async()=>{
 const db={connect:async()=>{throw Object.assign(new Error('private connection details'),{code:'40001'});}};
 const res=response();await createHandlers(db).leaveQr({body:{token:'a'.repeat(48),request_id:'b'.repeat(32)}},res);
 assert.equal(res.code,409);assert.equal(res.body.code,'queue_busy');
 assert.ok(!JSON.stringify(res.body).includes('private'));
});
