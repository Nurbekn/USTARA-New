'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandlers}=require('../controllers/adminSmartBookingRules');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const path=require('node:path');
const fs=require('node:fs');
const ROOT=path.resolve(__dirname,'..');
const rows=a=>({rows:a,rowCount:a.length});
function response(){return {statusCode:200,body:null,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(d){this.body=d;return this;}};}
function adminDb({enabled=true,revision=2,missing=false,commitFails=false}={}){
 const calls=[],released=[];
 const client={async query(sql,args=[]){calls.push({sql,args});
  if(sql.includes('SELECT enabled,revision FROM'))return rows(missing?[]:[{enabled,revision}]);
  if(sql.includes('UPDATE smart_booking_admin_settings'))return rows([{enabled:args[0],revision:revision+1,updated_at:new Date().toISOString()}]);
  if(sql==='COMMIT' && commitFails)throw Error('lost connection on COMMIT');
  return rows([]);
 },release(broken){released.push(broken);}};
 const db={connect:async()=>client,query:async(sql)=>{calls.push({sql});return rows(missing?[]:[{enabled,revision,updated_at:new Date()}]);}};
 return {db,calls,released};
}
test('admin GET is strictly role guarded and never cached',async()=>{
 const f=adminDb();const h=createHandlers(f.db);const denied=response();
 await h.get({user:{role:'barber'}},denied);assert.equal(denied.statusCode,403);assert.equal(f.calls.length,0);
 const allowed=response();await h.get({user:{role:'admin',id:3}},allowed);
 assert.equal(allowed.statusCode,200);assert.equal(allowed.headers['Cache-Control'],'no-store');
 assert.equal(allowed.body.enabled,true);
});
test('strict PUT payload validation precedes database access',async()=>{
 const f=adminDb();const h=createHandlers(f.db);
 for(const body of [{enabled:'false',expected_revision:2},{enabled:false,expected_revision:'2'},
   {enabled:false,expected_revision:0},{enabled:false,expected_revision:1.2},null]){
  const res=response();await h.update({user:{role:'admin',id:3},body},res);assert.equal(res.statusCode,400);
 }
 const denied=response();await h.update({user:{role:'customer',id:3},body:{enabled:false,expected_revision:2}},denied);
 assert.equal(denied.statusCode,403);assert.equal(f.calls.length,0);
});
test('pause writes admin audit and commits exactly once',async()=>{
 const f=adminDb();const r=response();await createHandlers(f.db).update({user:{role:'admin',id:8},body:{enabled:false,expected_revision:2}},r);
 assert.equal(r.statusCode,200);assert.equal(r.body.enabled,false);assert.equal(r.body.revision,3);assert.equal(r.body.changed,true);
 assert.ok(f.calls.some(x=>x.sql.includes('FOR UPDATE')));
 assert.deepEqual(f.calls.find(x=>x.sql.includes('INSERT INTO smart_booking_admin_settings_events')).args,[8,true,false,2,3]);
 assert.equal(f.calls.filter(x=>x.sql==='COMMIT').length,1);assert.deepEqual(f.released,[false]);
 assert.equal(r.headers['Cache-Control'],'no-store');
});
test('stale expected revision is 409, rollback, no audit mutation',async()=>{
 const f=adminDb({revision:8});const r=response();await createHandlers(f.db).update({user:{role:'admin',id:5},body:{enabled:false,expected_revision:7}},r);
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'stale_policy');
 assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));
 assert.ok(!f.calls.some(x=>x.sql.includes('UPDATE smart_booking_admin_settings')||x.sql.includes('INSERT INTO smart_booking_admin_settings_events')));
});
test('idempotent desired state records no fake event and leaves revision unchanged',async()=>{
 const f=adminDb({enabled:false});const r=response();await createHandlers(f.db).update({user:{role:'admin',id:5},body:{enabled:false,expected_revision:2}},r);
 assert.equal(r.statusCode,200);assert.equal(r.body.changed,false);assert.equal(r.body.revision,2);
 assert.ok(!f.calls.some(x=>x.sql.includes('smart_booking_admin_settings_events')));
});
test('missing policy and uncertain COMMIT fail closed (broken connection)',async()=>{
 const missing=adminDb({missing:true});const m=response();await createHandlers(missing.db).update({user:{role:'admin',id:5},body:{enabled:false,expected_revision:2}},m);
 assert.equal(m.statusCode,503);assert.ok(missing.calls.some(x=>x.sql==='ROLLBACK'));
 const f=adminDb({commitFails:true});const res=response();await createHandlers(f.db).update({user:{role:'admin',id:5},body:{enabled:false,expected_revision:2}},res);
 assert.equal(res.statusCode,503);assert.deepEqual(f.released,[true]);
 assert.equal(f.calls.filter(x=>x.sql==='COMMIT').length,1);
 assert.ok(!f.calls.some(x=>x.sql==='ROLLBACK'));
});
function worker({policy=true,disabled=false,existing=null}={}){
 const calls=[];
 const c={query:async(sql,args=[])=>{calls.push({sql,args});
  if(sql.includes('WHERE state IN') && sql.includes('next_check_at<=clock_timestamp()'))return rows([{id:8,barber_id:4}]);
  if(sql.includes('smart_booking_openings')&&sql.includes('FOR UPDATE'))return rows([{id:8,barber_id:4,start_at:new Date(Date.now()+3600000),duration_minutes:30,state:'offered'}]);
  if(sql.includes('SELECT clock_timestamp() AS db_now'))return rows([{db_now:new Date()}]);
  if(sql.includes('AS taken'))return rows([{taken:false}]);
  if(sql.includes('SELECT id,expires_at FROM smart_booking_offers')&&sql.includes('FOR UPDATE'))return rows(existing?[existing]:[]);
  if(sql.includes('SELECT enabled FROM smart_booking_admin_settings'))return rows(policy?[{enabled:!disabled}]:[]);
  if(sql.includes('SELECT q.id FROM walkin_queue'))return rows([{id:16}]);
  if(sql.includes('INSERT INTO smart_booking_offers'))return rows([{id:34,expires_at:new Date(Date.now()+300000)}]);
  return rows([]);
 },release(){}};
 return {db:{connect:async()=>c},calls};
}
test('paused worker creates NO new offers, and never changes bookings or sent notices',async()=>{
 const f=worker({disabled:true});assert.deepEqual(await createSmartBookingOffers(f.db).tick(),{kind:'paused'});
 assert.ok(f.calls.some(x=>x.sql.includes('FOR SHARE')&&x.sql.includes('smart_booking_admin_settings')));
 assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO smart_booking_offers')||x.sql.includes('INSERT INTO smart_booking_telegram_outbox')));
 assert.ok(!f.calls.some(x=>x.sql.includes('UPDATE bookings')||x.sql.includes('UPDATE smart_booking_offers')));
});
test('paused worker still expires stale pending offers but does not send another',async()=>{
 const f=worker({disabled:true,existing:{id:55,expires_at:new Date(Date.now()-60000)}});
 assert.deepEqual(await createSmartBookingOffers(f.db).tick(),{kind:'paused'});
 assert.ok(f.calls.some(x=>x.sql.includes("status='expired'")));
 assert.ok(f.calls.some(x=>x.sql.includes("status='cancelled'")&&x.sql.includes('smart_booking_telegram_outbox')));
 assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO smart_booking_offers')));
});
test('enabled worker creates offers; missing singleton fails closed',async()=>{
 const f=worker();assert.deepEqual(await createSmartBookingOffers(f.db).tick(),{kind:'offered',offer_id:34});
 const index=f.calls.findIndex(x=>x.sql.includes('SELECT enabled FROM smart_booking_admin_settings'));
 const insert=f.calls.findIndex(x=>x.sql.includes('INSERT INTO smart_booking_offers'));
 assert.ok(index>0&&insert>index);
 const missing=worker({policy:false});await assert.rejects(createSmartBookingOffers(missing.db).tick(),{code:'smart_booking_policy_unavailable',status:503});
 assert.ok(!missing.calls.some(x=>x.sql.includes('INSERT INTO smart_booking_offers')));
});
test('migration is forward-only, admin audit, bootstrap schema and untouched offers',()=>{
 const sql=fs.readFileSync(path.join(ROOT,'database/migrations/20261218_smart_booking_admin_rules.sql'),'utf8');
 const source=fs.readFileSync(path.join(ROOT,'services/smartBookingOffers.js'),'utf8');
 const boot=fs.readFileSync(path.join(ROOT,'database/bootstrap.sql'),'utf8');
 assert.match(sql,/REFERENCES admin_accounts\(id\)/);
 assert.match(sql,/smart_booking_admin_settings_events/);
 assert.match(sql,/previous_enabled<>next_enabled/);
 assert.match(sql,/VALUES\(1,TRUE,1\)/);
 assert.doesNotMatch(sql,/(?:UPDATE|DELETE|TRUNCATE)\s+(?:bookings|smart_booking_offers)\b/i);
 assert.match(source,/WHERE id=1 FOR SHARE/);
 assert.match(boot,/migrations\/20261218_smart_booking_admin_rules\.sql/);
});
