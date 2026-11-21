'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Offline fakes exercise SQL/write-order checks only, not real PostgreSQL.
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQrController');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const token='a'.repeat(48),requestId='b'.repeat(32);
const rows=(...items)=>({rows:items,rowCount:items.length});

function qr({consume=true,finalize=true,pendingLive=true,expiredOnConsume=false}={}){
 const calls=[];
 const conn={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('SELECT b.id FROM barbers'))return rows({id:7});
  if(sql.includes('FROM walkin_qr_tokens')&&sql.includes('FOR UPDATE'))return rows({id:5,barber_id:7,used_at:null,token_live:true});
    if(sql.includes('WHERE qr_token_id=$1'))return rows();
  if(sql.includes('FROM walkin_qr_requests WHERE id=$1')&&sql.includes('FOR UPDATE'))
   return rows({id:10,barber_id:7,request_key:requestId,display_label:'Mehmon',status:'pending',pending_live:true});
  if(sql.includes('AS open_now'))return rows({open_now:true});
  if(sql.includes('count(*)::int AS total'))return rows({total:0});
  if(sql.includes('INSERT INTO walkin_qr_requests'))return rows({id:10});
  if(sql.includes('UPDATE walkin_qr_tokens SET used_at'))return consume?rows({id:5}):rows();
  if(sql.includes('AS used,')&&sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return rows({used:false,token_live:!expiredOnConsume});
  if(sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return rows({token_live:true});
  if(sql.includes('INSERT INTO walkin_queue('))return rows({id:80});
  if(sql.includes('UPDATE walkin_qr_requests SET status='))return finalize?rows({id:10}):rows();
  if(sql.includes('AS pending_live')&&sql.includes('FROM walkin_qr_requests WHERE id=$1'))return rows({pending_live:pendingLive});
  return rows();
 },release(){}};
 const handlers=createHandlers({connect:async()=>conn});
 async function call(which,body,params={}){
  const out={status:200};
  await handlers[which]({body,params,headers:{},user:{role:'barber',id:91,profileId:7}},
   {status(code){out.status=code;return this;},set(){return this;},json(data){out.body=data;return this;}});
  return out;
 }
 return {call,calls};
}
test('v53/1 QR consumption checks expiry at the very last token UPDATE',async()=>{
 const h=qr({consume:false});const result=await h.call('requestJoin',{token,request_id:requestId,label:'Mehmon'});
 assert.equal(result.status,409);
 const written=h.calls.find(x=>x.sql.includes('UPDATE walkin_qr_tokens SET used_at'));
 assert.match(written.sql,/AND used_at IS NULL AND expires_at>clock_timestamp\(\)/);
 assert.match(written.sql,/RETURNING id/);
 assert.equal(h.calls.at(-1).sql,'ROLLBACK');
 assert.ok(h.calls.some(x=>x.sql.includes('INSERT INTO walkin_qr_requests')));
});
test('v53/2 valid QR consumption still commits exactly once',async()=>{
 const h=qr();const result=await h.call('requestJoin',{token,request_id:requestId,label:'Mehmon'});
 assert.equal(result.status,202);
 assert.equal(h.calls.filter(x=>x.sql.includes('UPDATE walkin_qr_tokens SET used_at')).length,1);
 assert.equal(h.calls.at(-1).sql,'COMMIT');
});
test('v53/3 final QR approval requires still-open schedule, rolls back joined entry',async()=>{
 const h=qr({finalize:false,pendingLive:true});
 const result=await h.call('decide',{decision:'approve'},{id:'10'});
 assert.equal(result.status,409);assert.equal(result.body.code,'barber_closed');
 const update=h.calls.find(x=>x.sql.includes('UPDATE walkin_qr_requests SET status='));
 assert.match(update.sql,/\$5='rejected' OR EXISTS/);
 assert.match(update.sql,/ustara_effective_day_schedule\(\$6/);
 assert.match(update.sql,/clock_timestamp\(\)/);
 assert.equal(h.calls.at(-1).sql,'ROLLBACK');
 assert.ok(h.calls.some(x=>x.sql.includes('INSERT INTO walkin_queue(')));
});
test('v53/4 expired QR approval still reports 410; rejection does not require open shop',async()=>{
 const old=qr({finalize:false,pendingLive:false});
 const result=await old.call('decide',{decision:'approve'},{id:'10'});
 assert.equal(result.status,410);assert.equal(result.body.code,'request_expired');
 const rejected=qr();const r=await rejected.call('decide',{decision:'reject'},{id:'10'});
 assert.equal(r.status,200);assert.equal(r.body.status,'rejected');
 assert.equal(rejected.calls.at(-1).sql,'COMMIT');
 assert.equal(rejected.calls.some(x=>x.sql.includes('INSERT INTO walkin_queue(')),false);
});

function offer({finalCreate=true}={}){
 const calls=[];
 const c={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('SELECT enabled FROM smart_booking_admin_settings'))return rows({enabled:true});
  if(sql.includes('SELECT clock_timestamp() AS db_now'))return rows({db_now:new Date()});
  if(sql.includes('FROM smart_booking_openings')&&sql.includes('next_check_at<=clock_timestamp()'))return rows({id:2,barber_id:3});
  if(sql.includes('FROM smart_booking_openings')&&sql.includes('FOR UPDATE'))return rows({id:2,barber_id:3,start_at:new Date(Date.now()+3600000),state:'open',duration_minutes:30});
  if(sql.includes('AS taken'))return rows({taken:false});
  if(sql.includes('SELECT q.id FROM walkin_queue q'))return rows({id:7});
  if(sql.includes('INSERT INTO smart_booking_offers('))return finalCreate?rows({id:11,expires_at:new Date(Date.now()+300000)}):rows();
  if(sql.includes('FROM walkin_qr_requests r')&&sql.includes('t.token_hash=$1'))return rows({entry_id:7,barber_id:3});
  if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))return rows({opening_id:2,barber_id:3,start_at:new Date(Date.now()+3600000),duration_minutes:30,state:'offered',id:11,status:'pending',expires_at:new Date(Date.now()+300000),queue_status:'waiting',queue_today:true});
  if(sql.includes('FOR SHARE OF r'))return rows({ok:true});
  if(sql.includes('UPDATE smart_booking_offers f'))return rows({id:11});
  return rows();
 },release(){}};
 return {service:createSmartBookingOffers({connect:async()=>c}),calls};
}
test('v53/5 offer worker refuses a candidate that became too late before INSERT',async()=>{
 const h=offer({finalCreate:false}),r=await h.service.tick();
 assert.deepEqual(r,{kind:'closed'});
 const write=h.calls.find(x=>x.sql.includes('INSERT INTO smart_booking_offers('));
 assert.match(write.sql,/o\.start_at>clock_timestamp\(\)\+interval '5 minutes'/);
 assert.match(write.sql,/q\.queue_date=\(clock_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date/);
 assert.match(write.sql,/q\.status='waiting'/);
 assert.ok(!h.calls.some(x=>x.sql.includes('INSERT INTO smart_booking_telegram_outbox')));
 assert.ok(h.calls.some(x=>x.sql.includes("state='closed'")));
 assert.equal(h.calls.at(-1).sql,'COMMIT');
});
test('v53/6 valid candidate creates one offer and one pending notification',async()=>{
 const h=offer(),r=await h.service.tick();
 assert.deepEqual(r,{kind:'offered',offer_id:11});
 assert.equal(h.calls.filter(x=>x.sql.includes('INSERT INTO smart_booking_offers(')).length,1);
 assert.equal(h.calls.filter(x=>x.sql.includes('INSERT INTO smart_booking_telegram_outbox')).length,1);
 assert.equal(h.calls.at(-1).sql,'COMMIT');
});
test('v53/7 accepting schedules exactly 2 minutes after committed DB decision timestamp',async()=>{
 const h=offer();const r=await h.service.decide({token,request_id:requestId,offer_id:11,action:'accept'});
 assert.equal(r.offer.status,'accepted');
 const write=h.calls.find(x=>x.sql.includes('SET state=$2,next_check_at=CASE'));
 assert.ok(write,'missing DB-anchored next-check update');
 assert.match(write.sql,/SELECT decided_at\+interval '2 minutes' FROM smart_booking_offers WHERE id=\$3/);
 assert.match(write.sql,/ELSE clock_timestamp\(\)/);
 assert.deepEqual(write.args,[2,'accepted',11]);
});
test('v53/8 rejecting schedules immediate DB-time recheck without JS timestamps',async()=>{
 const h=offer();const r=await h.service.decide({token,request_id:requestId,offer_id:11,action:'reject'});
 assert.equal(r.offer.status,'rejected');
 const write=h.calls.find(x=>x.sql.includes('SET state=$2,next_check_at=CASE'));
 assert.deepEqual(write.args,[2,'open',11]);
 assert.match(write.sql,/ELSE clock_timestamp\(\)/);
});

test('v53/9 staging refuses production or missing explicit local authorization',()=>{
 const {validateV53}=require('../scripts/v53-staging');
 assert.throws(()=>validateV53({NODE_ENV:'production',USTARA_V53_STAGING:'I_AUTHORIZE_LOCAL_STAGING'}));
 assert.throws(()=>validateV53({NODE_ENV:'test'}),/v53: explicit/);
});

test('v53/10 QR consumed just after deadline returns 410 expired, never a 202',async()=>{
 const h=qr({consume:false,expiredOnConsume:true});
 const result=await h.call('requestJoin',{token,request_id:requestId,label:'Mehmon'});
 assert.equal(result.status,410);assert.equal(result.body.code,'qr_expired');
 assert.equal(h.calls.at(-1).sql,'ROLLBACK');
});
