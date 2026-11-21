'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dbPath=require.resolve('../db');
const prior=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
if(prior)require.cache[dbPath]=prior;else delete require.cache[dbPath];
const base=()=>({queue_date:'2026-11-20',as_of:'2026-11-20T10:00:00.000Z',closed:false,revision:0,
 waiting:0,called:0,arrived:0,in_service:0,pending_qr:0,active_bookings:0,active_offers:0,past_unresolved:0});
const closeBody=(overrides={})=>({expected_date:'2026-11-20',expected_revision:0,reviewed_at:'2026-11-20T09:59:50.000Z',confirm:'CLOSE',...overrides});
const reopenBody=(overrides={})=>({expected_date:'2026-11-20',expected_revision:1,reviewed_at:'2026-11-20T09:59:50.000Z',confirm:'REOPEN',...overrides});
const user={role:'barber',profileId:7,id:12};
function fixture({snapshot=base(),authorized=true,closedWrite=true,reopenWrite=true,commitFails=false,writeFails=false}={}){
 const queries=[],released=[];let audit=0;
 const db={async connect(){return {async query(sql,args=[]){
  queries.push({sql,args});
  if(sql==='COMMIT'&&commitFails)throw Error('commit failed');
  if(sql.includes('SELECT b.id FROM barbers'))return {rowCount:authorized?1:0,rows:authorized?[{id:7}]:[]};
  if(sql.includes('WITH clock AS'))return {rowCount:snapshot?1:0,rows:snapshot?[snapshot]:[]};
  if(sql.startsWith('INSERT INTO barber_day_closures')){
    if(writeFails)throw Error('secret sql details');
    return {rowCount:closedWrite?1:0,rows:closedWrite?[{revision:snapshot.revision+1}]:[]};
  }
  if(sql.startsWith('UPDATE barber_day_closures'))return {rowCount:reopenWrite?1:0,rows:reopenWrite?[{revision:snapshot.revision+1}]:[]};
  if(sql.includes('INSERT INTO barber_day_close_events'))audit++;
  return {rowCount:0,rows:[]};
 },release(broken){released.push(broken===true)}}}};
 async function send(action,body=action==='closeDay'?closeBody():action==='reopenDay'?reopenBody():{},actor=user){
  const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;}};
  await createHandlers(db)[action]({body,user:actor},res);return res;
 }
 return {send,queries,released,audit:()=>audit};
}
test('v107: close only after fresh positive readiness, with one atomic audit',async()=>{
 const f=fixture(),r=await f.send('closeDay');
 assert.equal(r.statusCode,200);assert.equal(r.body.closed,true);assert.equal(r.body.revision,1);
 assert.equal(r.body.replayed,false);assert.equal(f.audit(),1);
 assert.equal(f.queries.at(-1).sql,'COMMIT');assert.equal(r.headers['Cache-Control'],'no-store');
 const statements=f.queries.map(q=>q.sql);
 assert.ok(statements.findIndex(x=>x.includes('pg_advisory_xact_lock')) < statements.findIndex(x=>x.includes('WITH clock AS')));
 assert.ok(statements.some(x=>x.includes('clock_timestamp() AT TIME ZONE')));
});
for(const field of ['waiting','called','arrived','in_service','pending_qr','active_bookings','active_offers','past_unresolved']){
 test('v107: cannot close with '+field+' outstanding',async()=>{
  const f=fixture({snapshot:{...base(),[field]:1}}),r=await f.send('closeDay');
  assert.equal(r.statusCode,409);assert.equal(r.body.code,'day_not_ready');assert.equal(f.audit(),0);
  assert.ok(!f.queries.some(x=>x.sql.startsWith('INSERT INTO barber_day_closures')));
 });
}
test('v107: never close with stale 30-second preview',async()=>{
 const f=fixture(),r=await f.send('closeDay',closeBody({reviewed_at:'2026-11-20T09:59:29Z'}));
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'day_preview_expired');assert.equal(f.audit(),0);
});
test('v107: never close with future review clock',async()=>{
 const f=fixture(),r=await f.send('closeDay',closeBody({reviewed_at:'2026-11-20T10:00:01Z'}));
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'day_preview_expired');
});
test('v107: cannot confirm yesterday on next date',async()=>{
 const f=fixture(),r=await f.send('closeDay',closeBody({expected_date:'2026-11-19'}));
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'day_changed');assert.equal(f.audit(),0);
});
test('v107: stale revision cannot close a reopened day',async()=>{
 const f=fixture({snapshot:{...base(),closed:false,revision:4}}),r=await f.send('closeDay');
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'day_changed');
});
test('v107: one lost reply can be read as replay without a second event',async()=>{
 const f=fixture({snapshot:{...base(),closed:true,revision:1}}),r=await f.send('closeDay');
 assert.equal(r.statusCode,200);assert.equal(r.body.replayed,true);assert.equal(f.audit(),0);
});
test('v107: replay of previously closed date never increments revision',async()=>{
 const f=fixture({snapshot:{...base(),closed:true,revision:3}}),r=await f.send('closeDay',closeBody({expected_revision:3}));
 assert.equal(r.statusCode,200);assert.equal(r.body.replayed,true);assert.equal(f.audit(),0);
});
test('v107: no closure if date changes during INSERT',async()=>{
 const f=fixture({closedWrite:false}),r=await f.send('closeDay');
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'day_changed');assert.equal(f.audit(),0);
});
test('v107: inactive barber cannot close day',async()=>{
 const f=fixture({authorized:false}),r=await f.send('closeDay');
 assert.equal(r.statusCode,403);assert.equal(f.audit(),0);
});
test('v107: customer role cannot close, no database query',async()=>{
 const f=fixture(),r=await f.send('closeDay',closeBody(),{role:'customer',profileId:7,id:12});
 assert.equal(r.statusCode,403);assert.equal(f.queries.length,0);
});
for(const body of [closeBody({expected_revision:-1}),closeBody({confirm:'REOPEN'}),closeBody({reviewed_at:'yesterday'}),closeBody({expected_date:'2026-11-99'})]){
 test('v107: invalid close confirmation rejected before DB connect',async()=>{
  const f=fixture(),r=await f.send('closeDay',body);assert.equal(r.statusCode,400);assert.equal(f.queries.length,0);
 });
}
test('v107: successful reopen increments revision and audits exactly once',async()=>{
 const f=fixture({snapshot:{...base(),closed:true,revision:1}}),r=await f.send('reopenDay');
 assert.equal(r.statusCode,200);assert.equal(r.body.closed,false);assert.equal(r.body.revision,2);
 assert.equal(f.audit(),1);assert.equal(f.queries.at(-1).sql,'COMMIT');
});
test('v107: replayed reopen does not write audit',async()=>{
 const f=fixture({snapshot:{...base(),closed:false,revision:2}}),r=await f.send('reopenDay');
 assert.equal(r.statusCode,200);assert.equal(r.body.replayed,true);assert.equal(f.audit(),0);
});
test('v107: cannot reopen stale revision after another close',async()=>{
 const f=fixture({snapshot:{...base(),closed:true,revision:3}}),r=await f.send('reopenDay');
 assert.equal(r.statusCode,409);assert.equal(f.audit(),0);
});
test('v107: cannot reopen a day never closed',async()=>{
 const f=fixture(),r=await f.send('reopenDay',reopenBody({expected_revision:0}));
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'day_not_closed');
});
test('v107: rollback on late reopen failure',async()=>{
 const f=fixture({snapshot:{...base(),closed:true,revision:1},reopenWrite:false}),r=await f.send('reopenDay');
 assert.equal(r.statusCode,409);assert.equal(f.audit(),0);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
test('v107: uncertain commit does not claim closure complete',async()=>{
 const f=fixture({commitFails:true}),r=await f.send('closeDay');
 assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_result_unknown');assert.deepEqual(f.released,[true]);
});
test('v107: DB errors never expose private details',async()=>{
 const f=fixture({writeFails:true}),r=await f.send('closeDay');
 assert.equal(r.statusCode,503);assert.ok(!JSON.stringify(r.body).includes('secret sql details'));
});
test('v107: migration creates scoped closure table, immutable audit and central schedule fence',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/20261216_safe_day_close.sql'),'utf8');
 assert.match(sql,/CREATE TABLE barber_day_closures/);
 assert.match(sql,/PRIMARY KEY\(barber_id,local_date\)/);
 assert.match(sql,/CREATE TABLE barber_day_close_events/);
 assert.match(sql,/WHERE dc.barber_id=p_barber_id AND dc.local_date=p_date AND dc.is_closed/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION ustara_effective_day_schedule/);
 assert.doesNotMatch(sql,/\bDELETE FROM (?:walkin_queue|bookings)\b/i);
});

test('v107: bootstrap and verification list the new schema objects and migration',()=>{
 const boot=fs.readFileSync(path.join(__dirname,'../database/bootstrap.sql'),'utf8');
 const verify=fs.readFileSync(path.join(__dirname,'../database/bootstrap/verify.sql'),'utf8');
 assert.match(boot,/\\ir migrations\/20261216_safe_day_close\.sql/);
 assert.match(verify,/barber_day_closures/);assert.match(verify,/barber_day_close_events/);
 assert.match(verify,/20261216_safe_day_close/);
});
