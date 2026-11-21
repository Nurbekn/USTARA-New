'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers:queueHandlers}=require('../controllers/walkinQueueController');
const {createHandlers:settingsHandlers,validMinutes}=require('../controllers/adminQueueSettings');
const data=rows=>({rows,rowCount:rows.length});
function res(){const r={statusCode:200,headers:{},jsonBody:null};return {
  status(n){r.statusCode=n;return this;},set(k,v){r.headers[k]=v;return this;},json(v){r.jsonBody=v;return this;},result:r};}
function queueHarness(ids=[11,12,13],{failWrite=false}={}){
 const sql=[];let released=0;
 const client={async query(q,args=[]){sql.push({q,args});
  if(q.includes('SELECT b.id FROM barbers'))return data([{id:7}]);
  if(q.startsWith('SELECT id FROM walkin_queue'))return data(ids.map(id=>({id})));
  if(failWrite&&q.includes('UPDATE walkin_queue AS w'))throw Error('DB failed');
  if(q.startsWith('UPDATE walkin_queue AS w'))return data(ids.map(id=>({id})));
  return data([]);},release(){released++;}};
 const h=queueHandlers({connect:async()=>client});
 async function call(id,direction,reason='Mijoz iltimosi bilan almashtirish',expected_order=ids,user={role:'barber',id:23,profileId:7}){
  const r=res();await h.reorder({user,params:{id},body:{direction,reason,expected_order}},r);return r.result;
 }
 return {call,sql,get released(){return released;}};
}
test('reorder moves next in line up with a reason and audit inside the transaction',async()=>{
 const h=queueHarness(),r=await h.call('12','up');
 assert.equal(r.statusCode,200);assert.deepEqual(r.jsonBody,{changed:true,entry_id:12,old_position:2,new_position:1});
 const updated=h.sql.find(x=>x.q.startsWith('UPDATE walkin_queue AS w'));
 assert.deepEqual(updated.args,[[12,11,13],7]);
 const log=h.sql.find(x=>x.q.includes('INSERT INTO walkin_queue_reorder_events'));
 assert.deepEqual(log.args,[7,12,23,2,1,'Mijoz iltimosi bilan almashtirish']);
 assert.equal(h.sql.at(-1).q,'COMMIT');assert.equal(h.released,1);
 assert.ok(h.sql.findIndex(x=>x.q.includes('pg_advisory_xact_lock'))<h.sql.findIndex(x=>x.q.includes('UPDATE walkin_queue AS w')));
});
test('moving down changes order only after fresh client observation',async()=>{
 const h=queueHarness(),r=await h.call(12,'down');
 assert.equal(r.statusCode,200);assert.deepEqual(h.sql.find(x=>x.q.includes('UPDATE walkin_queue AS w')).args[0],[11,13,12]);
 const old=queueHarness([11,13,12]);const stale=await old.call(12,'up', 'Navbat tartibi uchun sabab',[11,12,13]);
 assert.equal(stale.statusCode,409);assert.equal(stale.jsonBody.code,'queue_changed');
 assert.equal(old.sql.at(-1).q,'ROLLBACK');assert.ok(!old.sql.some(x=>x.q.includes('INSERT INTO walkin_queue_reorder_events')));
});
test('barber cannot move beyond edge, move other barbers, or omit reason',async()=>{
 const h=queueHarness();const edge=await h.call(11,'up');assert.equal(edge.statusCode,409);
 const foreign=await h.call(99,'up');assert.equal(foreign.statusCode,404);
 const reason=await h.call(12,'down','short');assert.equal(reason.statusCode,400);
 const nonBarber=await h.call(12,'up','Mijozning asosli iltimosi',[11,12,13],{role:'customer',id:20,profileId:20});
 assert.equal(nonBarber.statusCode,403);assert.equal(h.sql.filter(x=>x.q.startsWith('UPDATE walkin_queue AS w')).length,0);
});
test('failed reorder rolls back and does not audit',async()=>{
 const h=queueHarness([11,12,13],{failWrite:true}),r=await h.call(12,'up');
 assert.equal(r.statusCode,503);assert.equal(h.sql.at(-1).q,'ROLLBACK');
 assert.equal(h.sql.filter(x=>x.q.includes('INSERT INTO walkin_queue_reorder_events')).length,0);
});
function adminHarness(initial=10,{failInsert=false}={}){
 const sql=[];const state={minutes:initial};let released=0;
 const client={async query(q,args=[]){sql.push({q,args});
  if(q.startsWith('SELECT ttl_minutes FROM walkin_qr_settings'))return data([{ttl_minutes:state.minutes}]);
  if(q.startsWith('UPDATE walkin_qr_settings'))state.minutes=args[0];
  if(failInsert&&q.includes('INSERT INTO walkin_qr_settings_events'))throw Error('audit failure');
  return data([]);},release(){released++;}};
 const h=settingsHandlers({connect:async()=>client,query:async(q,args)=>{sql.push({q,args});return data([{ttl_minutes:state.minutes,updated_at:new Date()}]);}});
 async function call(method,minutes,user={id:1,role:'admin'}){const r=res();await h[method]({body:{ttl_minutes:minutes},user},r);return r.result;}
 return {call,sql,state,get released(){return released;}};
}
test('Admin QR setting can be lowered or extended 1..120 with audit and atomic write',async()=>{
 const h=adminHarness();let r=await h.call('get');assert.equal(r.jsonBody.ttl_minutes,10);
 r=await h.call('update',3);assert.equal(r.statusCode,200);assert.equal(r.jsonBody.changed,true);
 const log=h.sql.find(x=>x.q.includes('INSERT INTO walkin_qr_settings_events'));assert.deepEqual(log.args,[1,10,3]);
 assert.equal(h.sql.at(-1).q,'COMMIT');
 r=await h.call('update',120);assert.equal(r.statusCode,200);assert.equal(r.jsonBody.ttl_minutes,120);
 assert.equal(h.sql.filter(x=>x.q.includes('INSERT INTO walkin_qr_settings_events')).length,2);
 r=await h.call('update',120);assert.equal(r.jsonBody.changed,false);
 assert.equal(h.sql.filter(x=>x.q.includes('INSERT INTO walkin_qr_settings_events')).length,2);
});
test('QR config never accepts customer credentials or invalid minutes',async()=>{
 const h=adminHarness();for(const value of [0,121,-1,1.5,'20',null,undefined]){
  assert.equal((await h.call('update',value)).statusCode,400);
 }
 assert.equal((await h.call('update',20,{role:'barber',id:7})).statusCode,403);
 assert.equal((await h.call('get',null,{role:'customer',id:7})).statusCode,403);
 assert.equal(h.sql.length,0);assert.equal(validMinutes(1),true);assert.equal(validMinutes(120),true);
});
test('QR setting write that cannot be audited is rolled back',async()=>{
 const h=adminHarness(10,{failInsert:true}),r=await h.call('update',15);
 assert.equal(r.statusCode,503);assert.equal(h.sql.at(-1).q,'ROLLBACK');assert.equal(h.released,1);
});
test('schema migration separates barber queue and Admin audit, preserving existing token expiry',()=>{
 const root=path.join(__dirname,'../database');
 const sql=fs.readFileSync(path.join(root,'migrations/20261206_queue_order_qr_settings.sql'),'utf8');
 assert.match(sql,/ADD COLUMN queue_position INTEGER/);
 assert.match(sql,/CREATE TABLE walkin_queue_reorder_events/);
 assert.match(sql,/CREATE TABLE walkin_qr_settings/);
 assert.match(sql,/CREATE TABLE walkin_qr_settings_events/);
 assert.match(sql,/changed_by_user_id INTEGER REFERENCES admin_accounts/);
 assert.match(sql,/actor_user_id INTEGER NOT NULL REFERENCES admin_accounts/);
 assert.doesNotMatch(sql,/UPDATE walkin_qr_tokens/);
 const routes=fs.readFileSync(path.join(__dirname,'../routes/admin.js'),'utf8');
 assert.match(routes,/router\.get\('\/queue\/qr-settings',authMiddleware,ops\.adminOnly,qrSettings\.get\)/);
 assert.match(routes,/router\.put\('\/queue\/qr-settings',authMiddleware,ops\.adminOnly,qrSettings\.update\)/);
});
