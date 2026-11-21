'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {createManualQueueClaims,digest,isCode}=require('../services/manualQueueClaims');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const {createSmartBookingConfirmation}=require('../services/smartBookingConfirmation');
const customer={role:'customer',accountId:5,profileId:13};
const barber={role:'barber',accountId:2,profileId:7};
const code='f'.repeat(32);
const rows=x=>({rows:x,rowCount:x.length});
function fixture({verified=true,waiting=true,linked=false,match=true,eligible=true,throttled=false,offers=[],callback=true}={}){
 const events=[];
 const c={async query(sql,args=[]){
  events.push({sql,args});
  if(sql.startsWith('SELECT b.id FROM barbers b'))return rows(verified?[{id:7}]:[]);
  if(sql.includes('FROM customers c JOIN users u'))return rows([{id:13}]);
  if(sql.includes('SELECT q.id FROM walkin_queue q WHERE q.id='))return rows(waiting?[{id:11}]:[]);
  if(sql.includes('SELECT customer_id,(claim_hash IS NOT NULL'))return rows(linked?[{customer_id:13}]:[{customer_id:null,throttled}]);
  if(sql.includes('INSERT INTO walkin_manual_claims'))return rows([{claim_expires_at:new Date(Date.now()+900000)}]);
  if(sql.includes('SELECT q.id AS entry_id,q.barber_id FROM walkin_manual_claims m'))return rows(match?[{entry_id:11,barber_id:7}]:[]);
  if(sql.includes('SELECT m.entry_id FROM walkin_manual_claims m'))return rows(eligible?[{entry_id:11}]:[]);
  if(sql.includes('SELECT q.barber_id FROM walkin_queue q JOIN walkin_manual_claims'))return rows(match?[{barber_id:7}]:[]);
  if(sql.includes('SELECT q.id FROM walkin_queue q JOIN walkin_manual_claims'))return rows(match?[{id:11}]:[]);
  if(sql.includes('FROM smart_booking_offers f')&&sql.includes('smart_booking_confirmations x'))return rows(offers);
  if(sql.includes('FROM smart_booking_offers f')&&sql.includes('JOIN walkin_manual_claims m'))return rows(match?[{entry_id:11,barber_id:7}]:[]);
  if(sql.includes('UPDATE smart_booking_offers f'))return rows([{id:41}]);
  if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))return rows([{
   opening_id:9,barber_id:7,start_at:new Date(Date.now()+3600000),duration_minutes:30,
   state:'offered',id:41,status:'pending',expires_at:new Date(Date.now()+300000),queue_status:'waiting',queue_today:true}]);
  if(sql.includes('SELECT clock_timestamp() AS db_now'))return rows([{db_now:new Date()}]);
  if(sql.includes('AS taken'))return rows([{taken:false}]);
  if(sql.includes('FROM smart_booking_confirmations WHERE offer_id'))return rows([]);
  return rows([]);
 },release(){}};
 return {db:{connect:async()=>c,query:(...args)=>c.query(...args)},events};
}
test('v29 code is 128-bit hex, domain-separated hash and never valid for malformed inputs',()=>{
 assert.equal(isCode(code),true);assert.equal(isCode('g'.repeat(32)),false);
 assert.equal(digest(code).length,64);assert.equal(digest(code),digest(code));
 assert.notEqual(digest(code),require('node:crypto').createHash('sha256').update(code).digest('hex'));
});
test('only verified barber may issue single-use code for an active manual queue',async()=>{
 const f=fixture();const result=await createManualQueueClaims(f.db).issue({actor:barber,entry_id:11});
 assert.equal(result.code.length,32);assert.ok(isCode(result.code));
 assert.equal(result.entry_id,11);
 assert.ok(f.events.some(x=>x.sql.includes('NOT EXISTS(SELECT 1 FROM walkin_qr_requests')));
 const issued=f.events.find(x=>x.sql.includes('INSERT INTO walkin_manual_claims'));
 assert.equal(issued.args[0],11);assert.equal(issued.args[1],digest(result.code));
 assert.equal(f.events.some(x=>x.args?.includes(result.code)),false);
 assert.equal(f.events.at(-1).sql,'COMMIT');
});
test('QR tickets, used tickets and unverified barbers cannot issue a claim',async()=>{
 for(const options of [{verified:false},{waiting:false},{linked:true}]){
  const f=fixture(options);
  await assert.rejects(createManualQueueClaims(f.db).issue({actor:barber,entry_id:11}));
  assert.equal(f.events.at(-1).sql,'ROLLBACK');
 }
 const f=fixture();await assert.rejects(createManualQueueClaims(f.db).issue({actor:customer,entry_id:11}),{status:403});
 assert.equal(f.events.length,0);
});
test('barber cannot regenerate code repeatedly inside one-minute throttle window',async()=>{
 const f=fixture({throttled:true});
 await assert.rejects(createManualQueueClaims(f.db).issue({actor:barber,entry_id:11}),
  {status:429,code:'claim_rate_limited'});
 assert.equal(f.events.some(x=>x.sql.includes('INSERT INTO walkin_manual_claims')),false);
 assert.equal(f.events.at(-1).sql,'ROLLBACK');
});
test('authenticated customer explicitly claims ticket, consumes hash and records consent once',async()=>{
 const f=fixture();const result=await createManualQueueClaims(f.db).claim({actor:customer,code});
 assert.deepEqual(result,{linked:true,entry_id:11,offers_enabled:true});
 assert.ok(f.events.find(x=>x.sql.includes('FOR UPDATE OF c')));
 assert.ok(f.events.find(x=>x.sql.includes('pg_advisory_xact_lock')));
 const consumed=f.events.find(x=>x.sql.includes('UPDATE walkin_manual_claims SET customer_id='));
 assert.match(consumed.sql,/claim_hash=NULL,claim_expires_at=NULL/);
 assert.ok(f.events.filter(x=>x.args.some(a=>a===digest(code))).length>=1);
 assert.ok(!f.events.some(x=>x.args.some(a=>a===code)));
});
test('forged, expired or used code fails without any consent update',async()=>{
 let f=fixture();await assert.rejects(createManualQueueClaims(f.db).claim({actor:customer,code:'bad'}),{status:400});
 assert.equal(f.events.length,0);
 f=fixture({match:false});await assert.rejects(createManualQueueClaims(f.db).claim({actor:customer,code}),{status:404});
 f=fixture({eligible:false});await assert.rejects(createManualQueueClaims(f.db).claim({actor:customer,code}),{status:410});
 assert.ok(!f.events.some(x=>x.sql.includes('UPDATE walkin_manual_claims')));
});
test('customer revoke cancels unconfirmed invitation atomically but never cancels a booking',async()=>{
 const f=fixture({offers:[{id:41,opening_id:9}]});
 assert.deepEqual(await createManualQueueClaims(f.db).revoke({actor:customer,entry_id:11}),{linked:false});
 assert.ok(f.events.some(x=>x.sql.includes("UPDATE smart_booking_offers SET status='cancelled'")));
 assert.ok(f.events.some(x=>x.sql.includes('SET customer_id=NULL,consent_at=NULL')));
 assert.equal(f.events.some(x=>x.sql.includes('UPDATE bookings')),false);
 assert.equal(f.events.at(-1).sql,'COMMIT');
});
test('revoke refuses another customer queue before touching active offers',async()=>{
 const f=fixture({match:false});await assert.rejects(createManualQueueClaims(f.db).revoke({actor:customer,entry_id:11}),{status:404});
 assert.ok(!f.events.some(x=>x.sql.includes('UPDATE smart_booking_offers')));
});
test('manual offer choices need account ownership and never require QR secrets',async()=>{
 const f=fixture({match:false});
 await assert.rejects(createSmartBookingConfirmation(f.db).services({offer_id:41,manual:true,actor:customer}),{status:404});
 assert.ok(!f.events.some(x=>x.sql.includes('FROM services s')));
 const valid=fixture();
 // The mock returns no offer row; authorization succeeded and the next guard rejects stale data.
 await assert.rejects(createSmartBookingConfirmation(valid.db).services({offer_id:41,manual:true,actor:customer}),{status:410});
 assert.ok(valid.events.some(x=>x.sql.includes('JOIN walkin_manual_claims')));
});
test('manual accept enforces linked customer before state transition',async()=>{
 const f=fixture({match:false});
 await assert.rejects(createSmartBookingOffers(f.db).decideByCustomer({offer_id:41,action:'accept',actor:customer}),{status:404});
 assert.ok(!f.events.some(x=>x.sql.includes('UPDATE smart_booking_offers')));
 const valid=fixture();const accepted=await createSmartBookingOffers(valid.db).decideByCustomer({offer_id:41,action:'accept',actor:customer});
 assert.equal(accepted.offer.status,'accepted');
 assert.ok(valid.events.some(x=>x.sql.includes('FOR UPDATE OF o,f,q')));
 assert.equal(valid.events.filter(x=>x.sql.includes('JOIN walkin_manual_claims m')).length,2);
});
test('v29 DB schema and route expose separate QR and manual proofs; default deny, no auto opt-in',()=>{
 const root=path.resolve(__dirname,'..');
 const migration=fs.readFileSync(path.join(root,'database/migrations/20261210_manual_queue_claims.sql'),'utf8');
 const routes=fs.readFileSync(path.join(root,'routes/queue.js'),'utf8');
 const schema=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
 assert.match(migration,/consent_at TIMESTAMPTZ/);
 assert.match(migration,/walkin_manual_no_reusable_secret/);
 assert.match(migration,/claim_hash CHAR\(64\) UNIQUE/);
 assert.ok(!/consent_at TIMESTAMPTZ[^\n]*DEFAULT/.test(migration));
 assert.match(routes,/router\.post\('\/manual\/claim',auth,publicQrRateLimit,manual\.claim\)/);
 assert.match(routes,/router\.post\('\/offers\/:id\/confirm-booking\/customer',auth,offers\.manualConfirm\)/);
 assert.match(schema,/20261210_manual_queue_claims\.sql/);
 assert.match(fs.readFileSync(path.join(root,'services/smartBookingOffers.js'),'utf8'),/m.customer_id IS NOT NULL AND m.consent_at IS NOT NULL/);
});

test('v29 manual confirm creates one booking only after authenticated link and customer/barber locks',async()=>{
 const history=[],start=new Date(Date.now()+3600000),actor=customer;
 const c={async query(sql,args=[]){
  history.push({sql,args});
  if(sql.includes('FROM smart_booking_offers f')&&sql.includes('JOIN walkin_manual_claims m'))
   return rows([{entry_id:11,barber_id:7}]);
  if(sql.includes('FROM customers c JOIN users u'))return rows([{id:13}]);
  if(sql.trimStart().startsWith('SELECT')&&sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))
   return rows([{id:41,status:'accepted',decided_at:new Date(Date.now()-20000),expires_at:new Date(Date.now()+300000),
    opening_id:9,barber_id:7,start_at:start,duration_minutes:30,state:'accepted',entry_id:11,
    queue_status:'waiting',queue_date:'2026-11-18'}]);
  if(sql.includes('SELECT clock_timestamp() AS now'))return rows([{now:new Date()}]);
  if(sql.includes('SELECT ($1::date='))return rows([{today:true}]);
  if(sql.includes('FROM barbers b')&&sql.includes('FOR SHARE'))return rows([{id:7,verification_status:'approved',accepting_bookings:true}]);
  if(sql.includes('FROM services s')&&sql.includes('ORDER BY id'))return rows([{id:3,name:'Soch',price:'50000.00',duration_minutes:30}]);
  if(sql.includes('AS fits FROM ustara_effective_day_schedule'))return rows([{fits:true}]);
  if(sql.includes('AS taken'))return rows([{taken:false}]);
  if(sql.includes('INSERT INTO bookings('))return rows([{id:88,status:'confirmed'}]);
  if(sql.includes("UPDATE walkin_queue SET status='left'"))return rows([{id:11}]);
  return rows([]);
 },release(){}};
 const db={connect:async()=>c};
 const confirmation=createSmartBookingConfirmation(db);
 const result=await confirmation.confirm({offer_id:41,manual:true,service_ids:[3],
  expected_total_price:'50000.00',actor});
 assert.deepEqual(result,{booking_id:88,status:'confirmed',replayed:false});
 assert.equal(history.filter(x=>x.sql.includes('INSERT INTO bookings(')).length,1);
 assert.equal(history.filter(x=>x.sql.includes('JOIN walkin_manual_claims m')).length,2,
  'must recheck ownership after the barber lock to prevent revoke race');
 assert.ok(!history.some(x=>x.sql.includes('FROM walkin_qr_requests')));
 assert.equal(history.at(-1).sql,'COMMIT');
});
test('v29 manual confirm never falls back to QR or anonymous identity, and rejects revoked link',async()=>{
 const f=fixture({match:false});
 await assert.rejects(createSmartBookingConfirmation(f.db).confirm({offer_id:41,
  manual:true,service_ids:[3],expected_total_price:'50000.00',actor:customer}),{status:404});
 assert.ok(!f.events.some(x=>x.sql.includes('INSERT INTO bookings(')));
 const another=fixture();
 await assert.rejects(createSmartBookingConfirmation(another.db).confirm({offer_id:41,
  manual:true,service_ids:[3],expected_total_price:'50000.00',actor:barber}),{status:403});
 assert.equal(another.events.length,0);
});

// v33: identity lock must precede barber lock; a concurrently deactivated
// customer cannot accept an offer under a stale JWT snapshot.
test('v33 manual decision holds active customer identity lock until commit',async()=>{
 const f=fixture();
 const result=await createSmartBookingOffers(f.db).decideByCustomer({offer_id:41,action:'accept',actor:customer});
 assert.equal(result.offer.status,'accepted');
 const identity=f.events.findIndex(e=>e.sql.includes('FROM customers c JOIN users u'));
 const barberLock=f.events.findIndex(e=>e.sql.includes('pg_advisory_xact_lock'));
 const offerLock=f.events.findIndex(e=>e.sql.includes('FOR UPDATE OF o,f,q'));
 assert.ok(identity>=0&&identity<barberLock&&barberLock<offerLock);
 assert.match(f.events[identity].sql,/FOR SHARE OF c,u/);
 assert.equal(f.events.at(-1).sql,'COMMIT');
});
test('v33 deactivated customer cannot decide or mutate a manual offer',async()=>{
 const f=fixture();
 const orig=f.db.connect;
 f.db.connect=async()=>{
  const c=await orig();const query=c.query;
  return {...c,async query(sql,args){
   if(sql.includes('FROM customers c JOIN users u')){
    f.events.push({sql,args});return rows([]);
   }
   return query(sql,args);
  }};
 };
 await assert.rejects(createSmartBookingOffers(f.db).decideByCustomer({offer_id:41,action:'accept',actor:customer}),
  {status:401,code:'invalid_session'});
 assert.equal(f.events.some(e=>e.sql.includes('pg_advisory_xact_lock')),false);
 assert.equal(f.events.some(e=>e.sql.includes('UPDATE smart_booking_offers')),false);
 assert.equal(f.events.at(-1).sql,'ROLLBACK');
});

// v34: manual claim and revoke must serialize with UPDATE users.deactivated_at.
test('v34 manual claim and revoke both lock users + customers until transaction finishes',async()=>{
 const runs=[
  async f=>createManualQueueClaims(f.db).claim({actor:customer,code}),
  async f=>createManualQueueClaims(f.db).revoke({actor:customer,entry_id:11}),
 ];
 for(const operation of runs){
  const f=fixture();await operation(f);
  const identity=f.events.findIndex(e=>e.sql.includes('FROM customers c JOIN users u'));
  const barberLock=f.events.findIndex(e=>e.sql.includes('pg_advisory_xact_lock'));
  assert.ok(identity>=0&&identity<barberLock);
  assert.match(f.events[identity].sql,/u\.deactivated_at IS NULL\s+FOR UPDATE OF c,u/);
  assert.equal(f.events.at(-1).sql,'COMMIT');
 }
});
test('v34 paused account is rejected before manual consent is created or revoked',async()=>{
 for(const [method,args] of [
  ['claim',{actor:customer,code}],['revoke',{actor:customer,entry_id:11}],
 ]){
  const f=fixture();const oldConnect=f.db.connect;
  f.db.connect=async()=>{
   const client=await oldConnect();const oldQuery=client.query;
   return {...client,async query(sql,params){
    if(sql.includes('FROM customers c JOIN users u')){
     f.events.push({sql,args:params});return rows([]);
    }
    return oldQuery(sql,params);
   }};
  };
  await assert.rejects(createManualQueueClaims(f.db)[method](args),
   {status:401,code:'invalid_session'});
  assert.equal(f.events.some(e=>e.sql.includes('pg_advisory_xact_lock')),false);
  assert.equal(f.events.some(e=>e.sql.includes('UPDATE walkin_manual_claims')),false);
  assert.equal(f.events.at(-1).sql,'ROLLBACK');
 }
});
