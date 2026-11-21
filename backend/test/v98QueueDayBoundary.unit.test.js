'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Test the controller without requiring external npm/PostgreSQL packages.
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
const requestId='b'.repeat(32);
const today='2026-11-19', yesterday='2026-11-18';
const ticket=(date=today,status='waiting')=>({id:'123',barber_id:7,request_key:requestId,
 display_label:'Mehmon',queue_date:date,status,queue_position:1,
 created_at:'2026-11-19T10:00:00Z',called_at:status==='waiting'?null:'2026-11-19T10:01:00Z',
 arrived_at:null,started_at:null,finished_at:['left','served','missed'].includes(status)?'2026-11-19T10:10:00Z':null});
function harness({duplicate=null,active=[],recent=[],entry=null,dbToday=true,allowFinish=true}={}){
 const queries=[],releases=[];
 const client={async query(sql,args=[]){
   queries.push({sql,args});
   const records=rows=>({rowCount:rows.length,rows});
   if(sql.includes('SELECT b.id FROM barbers'))return records([{id:7}]);
   if(sql.includes('WHERE barber_id=$1 AND request_key=$2 FOR UPDATE'))return records(duplicate?[duplicate]:[]);
   if(sql.includes('queue_date=(statement_timestamp()')&&sql.includes(' AS today'))return records([{today:dbToday}]);
   if(sql.includes('FROM walkin_queue WHERE barber_id=$1')&&sql.includes('status IN (\'waiting\',\'called\',\'arrived\',\'in_service\')')){
     return records(sql.includes('queue_date=(statement_timestamp()')?active.filter(x=>x.queue_date===today):active);
   }
   if(sql.includes('FROM walkin_queue WHERE barber_id=$1')&&sql.includes("status IN ('served','missed','left')"))return records(recent);
   if(sql.includes('AND id=$2 FOR UPDATE'))return records(entry?[entry]:[]);
   if(sql.startsWith('UPDATE walkin_queue SET status=$1')){
     const valid=allowFinish&&sql.includes('queue_date=(statement_timestamp()');
     return records(valid?[ticket(today,args[0])]:[]);
   }
   if(sql.includes('AS open_now'))return records([{open_now:true}]);
   return records([]);
 },release(discard){releases.push(discard)}};
 const actions=createHandlers({connect:async()=>client});
 const request=(body={},params={})=>({body,params,user:{role:'barber',profileId:7,id:22}});
 async function send(method,body={},params={}){
   const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(payload){this.body=payload;return this}};
   await actions[method](request(body,params),res);
   return res;
 }
 return {send,queries,releases};
}
const finds=(h,part)=>h.queries.filter(x=>x.sql.includes(part));

test('v98 active queue SQL filters by Asia/Tashkent calendar day',async()=>{
 const h=harness({active:[ticket(yesterday),ticket(today)]});
 const r=await h.send('list');
 assert.equal(r.statusCode,200);
 assert.equal(r.body.active.length,1);
 assert.equal(r.body.active[0].queue_date,today);
 const active=finds(h,'AS manual_linked')[0].sql;
 assert.match(active,/queue_date=\(statement_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date/);
 assert.match(active,/status IN \('waiting','called','arrived','in_service'\)/);
 assert.equal(r.headers['Cache-Control'],'no-store');
});

test('v98 past-day active records do not become current active tickets',async()=>{
 const h=harness({active:[ticket(yesterday,'called')]});
 const r=await h.send('list');
 assert.deepEqual(r.body.active,[]);
});

test('v98 historical terminal entries may still appear in recent history',async()=>{
 const h=harness({recent:[ticket(yesterday,'served')]});
 const r=await h.send('list');
 assert.equal(r.body.recent.length,1);
 assert.equal(r.body.recent[0].status,'served');
 assert.equal(r.body.recent[0].queue_date,yesterday);
});

test('v98 today retry returns same ticket and performs no insertion',async()=>{
 const h=harness({duplicate:ticket(today)});
 const r=await h.send('join',{request_id:requestId,label:'Mehmon'});
 assert.equal(r.statusCode,200);
 assert.equal(r.body.replayed,true);
 assert.equal(r.body.entry.id,'123');
 assert.deepEqual(finds(h,'AS today')[0].args,[7,requestId]);
 assert.equal(finds(h,'INSERT INTO walkin_queue(').length,0);
 assert.equal(h.queries.at(-1).sql,'COMMIT');
});

test('v98 previous-day duplicate is rejected, not shown as a new booking',async()=>{
 const h=harness({duplicate:ticket(yesterday),dbToday:false});
 const r=await h.send('join',{request_id:requestId});
 assert.equal(r.statusCode,410);
 assert.equal(r.body.code,'queue_request_expired');
 assert.equal(finds(h,'INSERT INTO walkin_queue(').length,0);
 assert.equal(finds(h,'INSERT INTO walkin_queue_events').length,0);
 assert.equal(h.queries.at(-1).sql,'ROLLBACK');
 assert.equal(r.headers['Cache-Control'],'no-store');
});

test('v98 retry clock uses a database-supplied date result',async()=>{
 const h=harness({duplicate:ticket(today),dbToday:false});
 const r=await h.send('join',{request_id:requestId});
 assert.equal(r.statusCode,410);
 assert.deepEqual(finds(h,' AS today')[0].args,[7,requestId]);
});

test('v98 a reused request key with a different label is rejected before checking date',async()=>{
 const h=harness({duplicate:ticket(yesterday),dbToday:false});
 const r=await h.send('join',{request_id:requestId,label:'Other'});
 assert.equal(r.statusCode,409);
 assert.equal(r.body.code,'request_id_reused');
 assert.equal(finds(h,' AS today').length,0);
});

test('v98 finish update always requires current Asia/Tashkent date',async()=>{
 const h=harness({entry:ticket(today,'called')});
 const r=await h.send('finish',{status:'served',expected_status:'called'},{id:'123'});
 assert.equal(r.statusCode,200);
 assert.equal(r.body.entry.status,'served');
 const update=finds(h,'UPDATE walkin_queue SET status=$1')[0];
 assert.match(update.sql,/AND status=\$4\s+AND queue_date=\(statement_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date RETURNING/);
 assert.deepEqual(update.args,['served',7,123,'called']);
});

test('v98 a vanished or expired row is not finalized without UPDATE RETURNING',async()=>{
 const h=harness({entry:ticket(yesterday,'called'),allowFinish:false});
 const r=await h.send('finish',{status:'served',expected_status:'called'},{id:'123'});
 assert.equal(r.statusCode,409);
 assert.equal(r.body.code,'queue_changed');
 assert.equal(finds(h,'INSERT INTO walkin_queue_events').length,0);
 assert.equal(h.queries.at(-1).sql,'ROLLBACK');
});

test('v98 terminal replay remains idempotent after midnight',async()=>{
 const h=harness({entry:ticket(yesterday,'served')});
 const r=await h.send('finish',{status:'served',expected_status:'called'},{id:'123'});
 assert.equal(r.statusCode,200);
 assert.equal(r.body.replayed,true);
 assert.equal(finds(h,'UPDATE walkin_queue SET status=$1').length,0);
 assert.equal(finds(h,'INSERT INTO walkin_queue_events').length,0);
});

test('v98 stale observed status is rejected before any update',async()=>{
 const h=harness({entry:ticket(today,'arrived')});
 const r=await h.send('finish',{status:'left',expected_status:'called'},{id:'123'});
 assert.equal(r.statusCode,409);
 assert.equal(r.body.code,'queue_changed');
 assert.equal(finds(h,'UPDATE walkin_queue SET status=$1').length,0);
});

test('v98 invalid queue identifier never opens a DB connection',async()=>{
 const h=harness();
 const r=await h.send('finish',{status:'left'},{id:'0x7b'});
 assert.equal(r.statusCode,400);
 assert.equal(h.queries.length,0);
});
