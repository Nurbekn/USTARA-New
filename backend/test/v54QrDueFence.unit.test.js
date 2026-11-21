'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQrController');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const rows=(...items)=>({rowCount:items.length,rows:items});
const TOKEN='a'.repeat(48), KEY='b'.repeat(32);
function qrFixture({account=true,consumed=true,expiryLive=true}={}){
 const calls=[];
 const c={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('FROM walkin_qr_tokens')&&sql.includes('FOR UPDATE'))return rows({id:5,barber_id:7,used_at:null,token_live:true});
  if(sql.includes('SELECT b.id FROM barbers'))return account?rows({id:7}):rows();
  if(sql.includes('WHERE qr_token_id=$1'))return rows();
  if(sql.includes('FROM walkin_qr_tokens WHERE id=$1')&&sql.includes('AS used,'))return rows({used:false,token_live:expiryLive});
  if(sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return rows({token_live:true});
  if(sql.includes('AS open_now'))return rows({open_now:true});
  if(sql.includes('count(*)::int AS total'))return rows({total:0});
  if(sql.includes('INSERT INTO walkin_qr_requests'))return rows({id:91});
  if(sql.includes('UPDATE walkin_qr_tokens SET used_at='))return consumed?rows({id:5}):rows();
  return rows();
 },release(){}};
 const handler=createHandlers({connect:async()=>c});
 async function join(){const out={statusCode:200,status(v){this.statusCode=v;return this;},set(){return this;},json(v){this.body=v;return this;}};
  await handler.requestJoin({body:{token:TOKEN,request_id:KEY,label:'Mehmon'}},out);return out;
 }
 return {calls,join};
}
test('v54 QR: account identity SHARE lock must precede barber advisory lock',async()=>{
 const f=qrFixture(),result=await f.join();assert.equal(result.statusCode,202);
 const account=f.calls.findIndex(x=>x.sql.includes('SELECT b.id FROM barbers'));
 const advisory=f.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 const token=f.calls.findIndex(x=>x.sql.includes('FOR UPDATE')&&x.sql.includes('walkin_qr_tokens'));
 assert.ok(token>=0 && account>token && advisory>account);
 assert.match(f.calls[account].sql,/FOR SHARE OF b,u/);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('v54 QR: deactivated barber cannot queue a guest even with valid token',async()=>{
 const f=qrFixture({account:false}),r=await f.join();
 assert.equal(r.statusCode,403);assert.equal(r.body.code,'barber_unavailable');
 assert.ok(!f.calls.some(x=>x.sql.includes('pg_advisory_xact_lock')));
 assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO walkin_qr_requests')));
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('v54 QR: last token consumption must recheck operating hours in SQL',async()=>{
 const f=qrFixture(),r=await f.join();assert.equal(r.statusCode,202);
 const final=f.calls.find(x=>x.sql.includes('UPDATE walkin_qr_tokens SET used_at='));
 assert.ok(final);assert.match(final.sql,/AND EXISTS \(SELECT 1 FROM ustara_effective_day_schedule\(barber_id,/);
 assert.match(final.sql,/AT TIME ZONE 'Asia\/Tashkent'/);
 assert.match(final.sql,/AND expires_at>clock_timestamp\(\)/);
});
test('v54 QR: shop closes before final SQL write => 409, no commit',async()=>{
 const f=qrFixture({consumed:false,expiryLive:true}),r=await f.join();
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'barber_closed');
 assert.ok(f.calls.some(x=>x.sql.includes('INSERT INTO walkin_qr_requests')));
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('v54 QR: token expires before final SQL write => 410 and rollback',async()=>{
 const f=qrFixture({consumed:false,expiryLive:false}),r=await f.join();
 assert.equal(r.statusCode,410);assert.equal(r.body.code,'qr_expired');
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('v54 worker: another worker advanced due time => no early offer writes',async()=>{
 const calls=[];const c={async query(sql,args=[]){calls.push({sql,args});
  if(sql.includes('FROM smart_booking_openings')&&sql.includes('next_check_at<=clock_timestamp()'))return rows({id:8,barber_id:7});
  if(sql.includes('FROM smart_booking_openings')&&sql.includes('FOR UPDATE'))return rows();
  return rows();},release(){}};
 const result=await createSmartBookingOffers({connect:async()=>c}).tick();
 assert.deepEqual(result,{kind:'raced'});
 const locked=calls.find(x=>x.sql.includes('FROM smart_booking_openings')&&x.sql.includes('FOR UPDATE'));
 assert.ok(locked);assert.match(locked.sql,/clock_timestamp\(\)>=next_check_at/);
 assert.ok(!calls.some(x=>x.sql.includes('INSERT INTO smart_booking_offers')));
 assert.equal(calls.at(-1).sql,'COMMIT');
});
test('v54 worker: due read and locked recheck are separate after advisory lock',async()=>{
 const calls=[];const c={async query(sql,args=[]){calls.push({sql,args});
  if(sql.includes('FROM smart_booking_openings')&&sql.includes('next_check_at<=clock_timestamp()'))return rows({id:8,barber_id:7});
  if(sql.includes('FROM smart_booking_openings')&&sql.includes('FOR UPDATE'))return rows();
  return rows();},release(){}};
 await createSmartBookingOffers({connect:async()=>c}).tick();
 const due=calls.findIndex(x=>x.sql.includes('next_check_at<=clock_timestamp()'));
 const advisory=calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 const locked=calls.findIndex(x=>x.sql.includes('clock_timestamp()>=next_check_at'));
 assert.ok(due>=0&&advisory>due&&locked>advisory);
});
test('v54 staging: explicit opt-in required, production forbidden',()=>{
 const {validateV54}=require('../scripts/v54-staging');
 assert.throws(()=>validateV54({NODE_ENV:'test'}),/v54: explicit/);
 assert.throws(()=>validateV54({NODE_ENV:'production',USTARA_V54_STAGING:'I_AUTHORIZE_LOCAL_STAGING'}),/v53|v54|opt-in/);
});
