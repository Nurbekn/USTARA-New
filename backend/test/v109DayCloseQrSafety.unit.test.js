'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const dbPath=require.resolve('../db');
const old=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers:createQr}=require('../controllers/walkinQrController');
const {createHandlers:createQueue}=require('../controllers/walkinQueueController');
if(old)require.cache[dbPath]=old;else delete require.cache[dbPath];
const barber={role:'barber',profileId:7,id:12};
const snapshot=()=>({queue_date:'2026-11-20',as_of:'2026-11-20T10:00:00Z',closed:true,revision:1,
 waiting:0,called:0,arrived:0,in_service:0,pending_qr:0,active_bookings:0,active_offers:0,past_unresolved:0});
function response(){return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(s){this.statusCode=s;return this;},json(x){this.body=x;return this;}};}
function qrFixture({open=true,closed=false,inserted=true,expiresAt=new Date('2026-11-20T12:00:00Z'),missingExpiry=false,issuedTotal=0,dbFail=false}={}){
 const queries=[],releases=[];
 const db={async connect(){return {async query(sql){queries.push(sql);
  if(sql.includes('SELECT b.id FROM barbers'))return {rowCount:1,rows:[{id:7}]};
  if(sql.includes('FROM barber_day_closures'))return {rowCount:1,rows:[{closed}]};
  if(sql.includes('AS open_now'))return {rowCount:1,rows:[{open_now:open}]};
  if(sql.includes('count(*)::int AS total'))return {rowCount:1,rows:[{total:issuedTotal}]};
  if(sql.includes('SELECT ttl_minutes'))return {rowCount:1,rows:[{ttl_minutes:10}]};
  if(sql.includes('INSERT INTO walkin_qr_tokens')){
   if(dbFail)throw Error('private SQL details');
   return {rowCount:inserted?1:0,rows:inserted?[missingExpiry?{}:{expires_at:expiresAt}]:[]};
  }
  return {rowCount:0,rows:[]};
 },release(b){releases.push(!!b)}}}};
 const send=async()=>{const r=response();await createQr(db).tokenCreate({user:barber,headers:{origin:'http://localhost:5173'},body:{origin:'http://localhost:5173'}},r);return r;};
 return {send,queries,releases};
}
test('v109: QR is never issued outside effective schedule',async()=>{
 const f=qrFixture({open:false}),r=await f.send();
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'barber_closed');
 assert.equal(f.queries.some(x=>x.includes('INSERT INTO walkin_qr_tokens')),false);
 assert.equal(f.queries.at(-1),'ROLLBACK');
});
test('v109: persisted closed day rejects QR without reaching schedule',async()=>{
 const f=qrFixture({closed:true}),r=await f.send();
 assert.equal(r.statusCode,409);assert.equal(f.queries.some(x=>x.includes('AS open_now')),false);
 assert.equal(f.queries.some(x=>x.includes('INSERT INTO walkin_qr_tokens')),false);
});
test('v109: final QR INSERT checks effective schedule after preflight',async()=>{
 const f=qrFixture(),r=await f.send();assert.equal(r.statusCode,201);
 const preflight=f.queries.find(x=>x.includes('AS open_now'));
 const insert=f.queries.find(x=>x.includes('INSERT INTO walkin_qr_tokens'));
 assert.match(preflight,/ustara_effective_day_schedule/);
 assert.match(insert,/SELECT \$1,\$2,clock_timestamp\(\)/);
 assert.match(insert,/WHERE EXISTS\(SELECT 1 FROM ustara_effective_day_schedule/);
 assert.match(insert,/Asia\/Tashkent/);
 assert.equal(f.queries.at(-1),'COMMIT');assert.deepEqual(f.releases,[false]);
});
test('v109: QR schedule can expire between preflight and final write',async()=>{
 const f=qrFixture({inserted:false}),r=await f.send();
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'barber_closed');
 assert.equal(f.queries.at(-1),'ROLLBACK');
 assert.equal(r.headers['Cache-Control'],'no-store');
});
for(const bad of [null,'2026-11-20T12:00:00',new Date('invalid'),0]){
 test('v109: malformed QR expiry fails closed and rolls back',async()=>{
  const f=qrFixture({expiresAt:bad}),r=await f.send();
  assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_unavailable');
  assert.equal(f.queries.at(-1),'ROLLBACK');
 });
}
test('v109: absent QR expiry is rejected',async()=>{
 const r=await qrFixture({missingExpiry:true}).send();assert.equal(r.statusCode,503);
});
for(const total of [null,-1,'0',0.5,Number.MAX_SAFE_INTEGER+1]){
 test('v109: malformed QR issuance count fails closed before INSERT',async()=>{
  const f=qrFixture({issuedTotal:total}),r=await f.send();
  assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_unavailable');
  assert.equal(f.queries.some(x=>x.includes('INSERT INTO walkin_qr_tokens')),false);
 });
}
test('v109: QR issuance quota is still enforced',async()=>{
 const f=qrFixture({issuedTotal:6}),r=await f.send();
 assert.equal(r.statusCode,429);assert.equal(r.body.code,'qr_issue_limit');
});
test('v109: QR database error never exposes private SQL details',async()=>{
 const r=await qrFixture({dbFail:true}).send();
 assert.equal(r.statusCode,503);assert.doesNotMatch(JSON.stringify(r.body),/private SQL details/);
});
function queueFixture({row=snapshot(),commitFails=false}={}){
 const queries=[],releases=[];
 const db={async connect(){return {async query(sql){queries.push(sql);
  if(sql==='COMMIT'&&commitFails)throw Error('lost read-only COMMIT');
  if(sql.includes('SELECT b.id FROM barbers'))return {rowCount:1,rows:[{id:7}]};
  if(sql.includes('WITH clock AS'))return {rowCount:row?1:0,rows:row?[row]:[]};
  if(sql.startsWith('UPDATE barber_day_closures'))return {rowCount:1,rows:[{revision:2}]};
  return {rowCount:0,rows:[]};
 },release(b){releases.push(!!b)}}}};
 const send=async(type,body={})=>{const r=response();await createQueue(db)[type]({user:barber,body},r);return r;};
 return {send,queries,releases};
}
async function guestWithPendingCount(total){
 const queries=[];
 const db={async connect(){return {async query(sql){queries.push(sql);
  if(sql.includes('FROM walkin_qr_tokens') && sql.includes('FOR UPDATE'))return {rowCount:1,rows:[{id:10,barber_id:7,used_at:null,token_live:true}]};
  if(sql.includes('SELECT b.id FROM barbers'))return {rowCount:1,rows:[{id:7}]};
  if(sql.includes('FROM walkin_qr_requests') && sql.includes('WHERE qr_token_id'))return {rowCount:0,rows:[]};
  if(sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return {rowCount:1,rows:[{token_live:true}]};
  if(sql.includes('AS open_now'))return {rowCount:1,rows:[{open_now:true}]};
  if(sql.includes('count(*)::int AS total'))return {rowCount:1,rows:[{total}]};
  return {rowCount:0,rows:[]};
 },release(){}}}};
 const r=response();await createQr(db).requestJoin({body:{token:'a'.repeat(48),request_id:'b'.repeat(32)}},r);
 return {r,queries};
}
for(const total of [null,-1,'0',0.5,Number.MAX_SAFE_INTEGER+1]){
 test('v109: malformed pending guest count must not consume QR token',async()=>{
  const {r,queries}=await guestWithPendingCount(total);
  assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_unavailable');
  assert.equal(queries.some(x=>x.includes('INSERT INTO walkin_qr_requests')),false);
  assert.equal(queries.some(x=>x.includes('UPDATE walkin_qr_tokens SET used_at')),false);
 });
}
test('v109: full guest QR capacity is still enforced',async()=>{
 const {r,queries}=await guestWithPendingCount(20);
 assert.equal(r.statusCode,429);assert.equal(r.body.code,'queue_full');
 assert.equal(queries.some(x=>x.includes('INSERT INTO walkin_qr_requests')),false);
});
test('v109: readiness preview takes shared identity locks and never writes data',async()=>{
 const f=queueFixture(),r=await f.send('dayClosePreview');
 assert.equal(r.statusCode,200);assert.equal(f.queries[0],'BEGIN');
 assert.ok(f.queries.some(x=>x.includes('FOR SHARE OF b,u')));
 assert.ok(!f.queries.some(x=>/^(INSERT|UPDATE|DELETE) /.test(x)));
 assert.equal(f.queries.at(-1),'COMMIT');
});
test('v109: lost COMMIT from read-only preview is UNAVAILABLE, not UNKNOWN write',async()=>{
 const f=queueFixture({commitFails:true}),r=await f.send('dayClosePreview');
 assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_unavailable');
 assert.deepEqual(f.releases,[true]);
 assert.ok(!f.queries.includes('ROLLBACK'));
});
for(const bad of [
 {as_of:null},{as_of:0},{as_of:'2026-11-20T10:00:00'},
 {as_of:'2026-11-20T20:00:00Z'},{as_of:'2026-11-19T18:30:00Z'},
 {queue_date:'2026-11-31'},
]){
 test('v109: malformed or other-day DB preview never reports READY '+JSON.stringify(bad),async()=>{
  const r=await queueFixture({row:{...snapshot(),...bad}}).send('dayClosePreview');
  assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_unavailable');
  assert.equal(r.body.ready,undefined);
 });
}
const reopen=(overrides={})=>({expected_date:'2026-11-20',expected_revision:1,
 reviewed_at:'2026-11-20T09:59:50Z',confirm:'REOPEN',...overrides});
test('v109: reopen must supply an authoritative review timestamp',async()=>{
 const f=queueFixture(),r=await f.send('reopenDay',{expected_date:'2026-11-20',expected_revision:1,confirm:'REOPEN'});
 assert.equal(r.statusCode,400);assert.equal(f.queries.length,0);
});
for(const reviewed_at of ['2026-11-20T09:59:29Z','2026-11-20T10:00:01Z','not-a-time']){
 test('v109: expired, future or malformed reopening confirmation rejected',async()=>{
  const f=queueFixture(),r=await f.send('reopenDay',reopen({reviewed_at}));
  assert.equal(r.statusCode,reviewed_at==='not-a-time'?400:409);
  assert.ok(!f.queries.some(x=>x.startsWith('UPDATE barber_day_closures')));
 });
}
test('v109: valid fresh reopen is audited and committed',async()=>{
 const f=queueFixture(),r=await f.send('reopenDay',reopen());
 assert.equal(r.statusCode,200);assert.equal(r.body.closed,false);
 assert.ok(f.queries.some(x=>x.includes('INSERT INTO barber_day_close_events')));
 assert.equal(f.queries[0],'BEGIN');
});
