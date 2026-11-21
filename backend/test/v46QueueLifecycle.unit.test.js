'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Keep independent of pg/express: controller is created with an injected DB.
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
const {cancelUnconfirmedQueueOffers}=require('../services/queueOfferLifecycle');
const data=rows=>({rows,rowCount:rows.length});
const user={role:'barber',profileId:7,id:17};
const ticket=(status='waiting')=>({id:21,barber_id:7,request_key:'a'.repeat(32),display_label:'Mijoz',queue_date:'2026-11-19',status,queue_position:1,created_at:new Date()});
function fixture({authorized=true,called=null,waiting=null,finish=null,offers=[],rejectOffers=false}={}){
 const sql=[],releases=[];
 const c={async query(q,args=[]){
  sql.push({q,args});
  if(q.includes('SELECT b.id FROM barbers'))return data(authorized?[{id:7}]:[]);
  if(q.includes("AND status='called' FOR UPDATE"))return data(called?[called]:[]);
  if(q.includes("AND status='waiting' ORDER BY queue_position ASC NULLS LAST,id LIMIT 1 FOR UPDATE"))return data(waiting?[waiting]:[]);
  if(q.startsWith("UPDATE walkin_queue SET status='called'"))return data(waiting?[ticket('called')]:[]);
  if(q.includes('AND id=$2 FOR UPDATE'))return data(finish?[finish]:[]);
  if(q.startsWith('UPDATE walkin_queue SET status=$1'))return data(finish?[ticket(args[0])]:[]);
  if(q.includes('UPDATE smart_booking_offers f')){
   if(rejectOffers)throw Error('simulated database failure');
   return data(offers);
  }
  return data([]);
 },release(broken){releases.push(broken);}};
 const db={connect:async()=>c,query:async(q,args=[])=>{
  sql.push({q,args});
  if(q.includes('SELECT b.id FROM barbers'))return data(authorized?[{id:7}]:[]);
  return data([]);
 }};
 const handlers=createHandlers(db);
 async function invoke(method,body={},params={},actor=user){
  const state={status:200};
  const res={status(x){state.status=x;return this;},json(x){state.body=x;return this;},set(){return this;}};
  await handlers[method]({user:actor,body,params},res);
  return state;
 }
 return {invoke,sql,releases};
}
const queries=h=>h.sql.map(v=>v.q);

test('v46 write lock order: identity is bound to actor user BEFORE advisory lock',async()=>{
 const h=fixture({waiting:ticket()});
 const r=await h.invoke('callNext');assert.equal(r.status,200);
 const ids=h.sql.find(v=>v.q.includes('SELECT b.id FROM barbers'));
 assert.ok(ids.q.includes('b.user_id=$2') && ids.q.includes('FOR SHARE OF b,u'));
 assert.deepEqual(ids.args,[7,17]);
 const a=queries(h).findIndex(q=>q.includes('FOR SHARE OF b,u'));
 const b=queries(h).findIndex(q=>q.includes('pg_advisory_xact_lock'));
 assert.ok(a>=0&&a<b);
 assert.equal(queries(h).at(-1),'COMMIT');
});
test('v46 disabled or wrong barber owner cannot read or change queue',async()=>{
 const h=fixture({authorized:false,waiting:ticket()});
 assert.equal((await h.invoke('list')).status,403);
 assert.equal((await h.invoke('callNext')).status,403);
 assert.equal(queries(h).some(q=>q.startsWith('UPDATE walkin_queue')),false);
 const read=h.sql.find(v=>v.q.includes('SELECT b.id FROM barbers'));
 assert.deepEqual(read.args,[7,17]);
 assert.ok(read.q.includes('b.user_id=$2'));
 assert.equal(queries(h).at(-1),'ROLLBACK');
});
test('v46 called guest has provisional offers cancelled before queue-call notice insert',async()=>{
 const h=fixture({waiting:ticket(),offers:[{id:10,opening_id:20},{id:11,opening_id:20}]});
 const r=await h.invoke('callNext');assert.equal(r.status,200);
 const q=queries(h);
 const offer=q.findIndex(v=>v.includes('UPDATE smart_booking_offers f'));
 const open=q.findIndex(v=>v.includes('UPDATE smart_booking_openings SET'));
 const notify=q.findIndex(v=>v.includes('UPDATE smart_booking_telegram_outbox SET'));
 const enqueue=q.findIndex(v=>v.includes('INSERT INTO walkin_queue_notification_outbox'));
 assert.ok(offer>0&&offer<open&&open<notify&&notify<enqueue);
 assert.match(h.sql[offer].q,/NOT EXISTS\(SELECT 1 FROM smart_booking_confirmations/);
 assert.deepEqual(h.sql[open].args,[[20]],'duplicate opening IDs must be deduplicated');
 assert.deepEqual(h.sql[notify].args,[[10,11]]);
});
test('v46 completed ticket clears provisional offers, queue notices and Telegram links atomically',async()=>{
 const h=fixture({finish:ticket('called'),offers:[{id:10,opening_id:20}]});
 const r=await h.invoke('finish',{status:'served'},{id:'21'});
 assert.equal(r.status,200);
 const q=queries(h);
 const audit=q.findIndex(v=>v.includes('INSERT INTO walkin_queue_events'));
 const off=q.findIndex(v=>v.includes('UPDATE smart_booking_offers f'));
 const call=q.findIndex(v=>v.includes('UPDATE walkin_queue_notification_outbox'));
 const subs=q.findIndex(v=>v.includes('DELETE FROM walkin_queue_telegram_subscriptions'));
 const inv=q.findIndex(v=>v.includes('DELETE FROM walkin_queue_telegram_invites'));
 assert.ok(audit>=0&&audit<off&&off<call&&call<subs&&subs<inv);
 assert.equal(q.at(-1),'COMMIT');
});
test('v46 cleanup error rolls back the entire call; never enqueues a false call',async()=>{
 const h=fixture({waiting:ticket(),rejectOffers:true});
 const r=await h.invoke('callNext');
 assert.equal(r.status,503);
 const q=queries(h);
 assert.equal(q.at(-1),'ROLLBACK');
 assert.equal(q.some(x=>x.includes('INSERT INTO walkin_queue_notification_outbox')),false);
});
test('v46 helper leaves completed bookings and their openings untouched',async()=>{
 const sql=[];
 const r=await cancelUnconfirmedQueueOffers({async query(q,args){sql.push({q,args});return data([]);}},21);
 assert.deepEqual(r,{cancelled_offers:0});
 assert.equal(sql.length,1);
 assert.match(sql[0].q,/NOT EXISTS\(SELECT 1 FROM smart_booking_confirmations/);
});
test('v47 already finished status replay repairs unsent notices without rewriting status or audit',async()=>{
 const h=fixture({finish:ticket('served')});
 const r=await h.invoke('finish',{status:'served'},{id:'21'});
 assert.equal(r.status,200);assert.equal(r.body.replayed,true);
 assert.ok(queries(h).some(q=>q.includes('UPDATE smart_booking_offers f')));
 assert.ok(queries(h).some(q=>q.includes('UPDATE walkin_queue_notification_outbox')));
 assert.ok(!queries(h).some(q=>q.includes('INSERT INTO walkin_queue_events')));
 assert.ok(!queries(h).some(q=>q.includes('UPDATE walkin_queue SET status=')));
});

test('v46 call-next retry repairs legacy offers without duplicate call events',async()=>{
 const h=fixture({called:ticket('called'),offers:[{id:21,opening_id:99}]});
 const r=await h.invoke('callNext');
 assert.equal(r.status,200);assert.equal(r.body.replayed,true);
 const q=queries(h);
 assert.ok(q.some(x=>x.includes('UPDATE smart_booking_offers f')));
 assert.equal(q.some(x=>x.includes('INSERT INTO walkin_queue_events')),false);
 assert.equal(q.some(x=>x.includes('INSERT INTO walkin_queue_notification_outbox')),false);
});
