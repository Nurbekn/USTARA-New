'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');const old=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQrController');
const {createPublicSummary}=require('../controllers/queuePublicController');
if(old)require.cache[dbPath]=old;else delete require.cache[dbPath];
const TOKEN='a'.repeat(48),KEY='b'.repeat(32);
const barber={role:'barber',id:11,profileId:7};
function response(){return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};}
function fixture({failure='COMMIT',action='tokenCreate'}={}){
 const queries=[],releases=[];
 const db={async connect(){return {async query(sql){
  queries.push(sql);
  if(sql===failure || sql.startsWith(failure))throw Object.assign(Error('internal DB URL and password must be hidden'),{code:'08006'});
  if(sql.includes('SELECT b.id FROM barbers'))return {rowCount:1,rows:[{id:7}]};
  if(sql.includes('FROM barber_day_closures'))return {rowCount:1,rows:[{closed:false}]};
  if(sql.includes('FROM walkin_qr_tokens')&&sql.includes('FOR UPDATE'))return {rowCount:1,rows:[{id:12,barber_id:7,token_live:true,used_at:null}]};
  if(sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return {rowCount:1,rows:[{token_live:true}]};
  if(sql.includes('FROM walkin_qr_requests')&&sql.includes('WHERE qr_token_id=$1'))return {rowCount:0,rows:[]};
  if(sql.includes('FROM walkin_qr_requests')&&sql.includes('FOR UPDATE'))return {rowCount:1,rows:[{id:13,barber_id:7,status:'pending',pending_live:true,request_key:KEY,display_label:'Mehmon'}]};
  if(sql.includes('AS open_now'))return {rowCount:1,rows:[{open_now:true}]};
  if(sql.includes('count(*)::int'))return {rowCount:1,rows:[{total:0}]};
  if(sql.includes('SELECT ttl_minutes FROM walkin_qr_settings'))return {rowCount:1,rows:[{ttl_minutes:10}]};
  if(sql.includes('INSERT INTO walkin_qr_tokens'))return {rowCount:1,rows:[{expires_at:new Date('2027-01-01T10:00:00Z')}]};
  if(sql.includes('INSERT INTO walkin_qr_requests'))return {rowCount:1,rows:[{id:13}]};
  if(sql.includes('UPDATE walkin_qr_tokens SET used_at'))return {rowCount:1,rows:[{id:12}]};
  if(sql.includes('UPDATE walkin_qr_requests SET status'))return {rowCount:1,rows:[{id:13}]};
  if(sql.includes('INSERT INTO walkin_queue'))return {rowCount:1,rows:[{id:14}]};
  return {rowCount:0,rows:[]};
 },release(v){releases.push(v)}};}};
 async function send(){const res=response();const handlers=createHandlers(db);
  if(action==='tokenCreate')await handlers.tokenCreate({user:barber,headers:{},body:{origin:'http://localhost:5173'}},res);
  else if(action==='requestJoin')await handlers.requestJoin({body:{token:TOKEN,request_id:KEY,label:'Mehmon'}},res);
  else if(action==='decide')await handlers.decide({user:barber,params:{id:'13'},body:{decision:'approve'}},res);
  else if(action==='pendingList')await handlers.pendingList({user:barber},res);
  return res;
 }
 return {send,queries,releases};
}
for(const action of ['tokenCreate','requestJoin','decide','pendingList']){
 test('v108: '+action+' COMMIT loss is UNKNOWN, connection discarded, never replayed automatically',async()=>{
  const f=fixture({action});const r=await f.send();
  assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_result_unknown');
  assert.equal(r.headers['Cache-Control'],'no-store');
  assert.equal(f.queries.at(-1),'COMMIT');
  assert.equal(f.queries.filter(x=>x==='ROLLBACK').length,0);
  assert.deepEqual(f.releases,[true]);
  assert.doesNotMatch(JSON.stringify(r.body),/password|internal DB|08006/);
 });
}
test('v114: QR pre-COMMIT transport error discards client even after successful ROLLBACK',async()=>{
 const f=fixture({failure:'INSERT INTO walkin_qr_tokens'}),r=await f.send();
 assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_unavailable');
 assert.equal(f.queries.at(-1),'ROLLBACK');assert.deepEqual(f.releases,[true]);
});
test('v108: normal QR mutation still commits and returns a healthy connection',async()=>{
 const f=fixture({action:'tokenCreate',failure:'NEVER'}),r=await f.send();
 assert.equal(r.statusCode,201);assert.equal(f.queries.at(-1),'COMMIT');
 assert.deepEqual(f.releases,[false]);
});
test('v108: failed QR mutation rolls back before COMMIT and does not assert uncertain commit',async()=>{
 const f=fixture({action:'tokenCreate',failure:'INSERT INTO walkin_qr_tokens'});
 // Precise matching is not required for this fixture: simulate a prior permission failure.
 const res=await f.send();assert.equal(res.statusCode,503);assert.equal(res.body.code,'queue_unavailable');
 assert.equal(f.queries.at(-1),'ROLLBACK');assert.deepEqual(f.releases,[true]);
});
const publicRow={id:7,waiting_count:0,has_called:false,day_closed:false,typical_minutes:25};
async function publicCall(as_of){let sql='';const res=response();
 const handler=createPublicSummary({async query(text){sql=text;return {rowCount:1,rows:[{...publicRow,as_of}]};}});
 await handler({params:{barberId:'7'}},res);return {sql,res};
}
test('v108: public as_of is PostgreSQL statement timestamp, never the web server clock',async()=>{
 const authoritative='2026-11-20T07:45:03.287Z';const {sql,res}=await publicCall(new Date(authoritative));
 assert.equal(res.statusCode,200);assert.equal(res.body.as_of,authoritative);
 assert.match(sql,/statement_timestamp\(\) AS as_of/);
 assert.equal(res.headers['Cache-Control'],'no-store');
});
for(const bad of [undefined,null,'invalid','2026-11-20T07:45:03',new Date('invalid')]){
 test('v108: invalid DB timestamp must not become a fake live queue '+String(bad),async()=>{
  const {res}=await publicCall(bad);assert.equal(res.statusCode,503);
  assert.equal(res.body.code,'queue_unavailable');assert.equal(Object.hasOwn(res.body,'waiting_count'),false);
 });
}
test('v108: day closure still returns null arrival estimate with authoritative clock',async()=>{
 const r=response();const db={query:async()=>({rowCount:1,rows:[{...publicRow,day_closed:true,as_of:new Date('2026-11-20T07:45:03Z')}]})};
 await createPublicSummary(db)({params:{barberId:'7'}},r);
 assert.equal(r.statusCode,200);assert.equal(r.body.day_closed,true);assert.equal(r.body.new_arrival_estimate,null);
});
