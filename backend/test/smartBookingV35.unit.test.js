'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createManualQueueClaims}=require('../services/manualQueueClaims');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const rows=items=>({rows:items,rowCount:items.length});
const customer={role:'customer',accountId:5,profileId:13};
const now=()=>new Date();
const start=()=>new Date(Date.now()+3600_000);
const qr='a'.repeat(48),requestId='b'.repeat(32);

function makeDb(responder){
 const calls=[];
 const client={async query(sql,args=[]){calls.push({sql,args});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql) || sql.startsWith('SET LOCAL'))return rows([]);
  return responder(sql,args);
 },release(){}};
 return {db:{connect:async()=>client,query:client.query.bind(client)},calls};
}

test('v35 manual mine verifies active customer account and uses database clock for offers',async()=>{
 const f=makeDb((sql)=>{
  if(sql.includes('FROM customers c JOIN users u'))return rows([{id:13}]);
  if(sql.includes('FROM walkin_manual_claims m JOIN walkin_queue q'))return rows([
   {id:11,barber_id:7,status:'waiting',queue_position:2,offer_id:41,offer_status:'accepted',
    expires_at:now(),start_at:start(),confirmation_deadline:start(),pending_valid:false,accepted_valid:true},
   {id:12,barber_id:7,status:'waiting',queue_position:3,offer_id:42,offer_status:'pending',
    expires_at:now(),start_at:start(),pending_valid:false,accepted_valid:false},
  ]);
  return rows([]);
 });
 const result=await createManualQueueClaims(f.db).mine({actor:customer});
 assert.equal(result.entries.length,2);
 assert.equal(result.entries[0].smart_offer.status,'accepted');
 assert.equal(result.entries[1].smart_offer,null);
 const identity=f.calls.findIndex(x=>x.sql.includes('FROM customers c JOIN users u'));
 const listing=f.calls.findIndex(x=>x.sql.includes('FROM walkin_manual_claims m JOIN walkin_queue q'));
 assert.ok(identity>=0&&listing>identity);
 assert.match(f.calls[identity].sql,/FOR UPDATE OF c,u/);
 assert.match(f.calls[listing].sql,/f\.expires_at>clock_timestamp\(\)/);
 assert.match(f.calls[listing].sql,/f\.decided_at\+interval '2 minutes'>clock_timestamp\(\)/);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});

test('v35 stale/deactivated customer session gets 401 and cannot enumerate manual tickets',async()=>{
 const f=makeDb(sql=>sql.includes('FROM customers c JOIN users u')?rows([]):rows([{id:99}]));
 await assert.rejects(createManualQueueClaims(f.db).mine({actor:customer}),
  {status:401,code:'invalid_session'});
 assert.equal(f.calls.some(x=>x.sql.includes('FROM walkin_manual_claims m JOIN walkin_queue q')),false);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});

test('v35 barber opening list checks exact account owner within transaction',async()=>{
 const f=makeDb(sql=>{
  if(sql.includes('FROM barbers b JOIN users u'))return rows([{id:7}]);
  if(sql.includes('FROM smart_booking_openings o')&&sql.includes('LEFT JOIN LATERAL'))return rows([{id:3,state:'open'}]);
  return rows([]);
 });
 const out=await createSmartBookingOffers(f.db).listForBarber(7,9);
 assert.deepEqual(out,[{id:3,state:'open'}]);
 const auth=f.calls.findIndex(x=>x.sql.includes('FROM barbers b JOIN users u'));
 const listing=f.calls.findIndex(x=>x.sql.includes('FROM smart_booking_openings o')&&x.sql.includes('LEFT JOIN LATERAL'));
 assert.ok(auth>=0&&listing>auth);
 assert.deepEqual(f.calls[auth].args,[7,9]);
 assert.match(f.calls[auth].sql,/b\.user_id=\$2/);
 assert.match(f.calls[auth].sql,/FOR SHARE OF b,u/);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});

test('v35 barber cancellation blocks unlinked/inactive user before modifying opening',async()=>{
 const f=makeDb(sql=>sql.includes('FROM barbers b JOIN users u')?rows([]):rows([{id:3}]));
 await assert.rejects(createSmartBookingOffers(f.db).cancelBarber(3,7,9),
  {status:403,code:'barber_required'});
 assert.equal(f.calls.some(x=>x.sql.includes('pg_advisory_xact_lock')),false);
 assert.equal(f.calls.some(x=>x.sql.includes('UPDATE smart_booking_openings')),false);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});

test('v35 barber cancellation locks identity before barber and affects only owned opening',async()=>{
 const f=makeDb(sql=>{
  if(sql.includes('FROM barbers b JOIN users u'))return rows([{id:7}]);
  if(sql.includes('FROM smart_booking_openings WHERE id=$1'))return rows([{id:3,state:'offered'}]);
  return rows([]);
 });
 const ret=await createSmartBookingOffers(f.db).cancelBarber(3,7,9);
 assert.deepEqual(ret,{state:'cancelled',replayed:false});
 const identity=f.calls.findIndex(x=>x.sql.includes('FROM barbers b JOIN users u'));
 const lock=f.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 const update=f.calls.findIndex(x=>x.sql.includes('UPDATE smart_booking_openings'));
 assert.ok(identity>=0&&lock>identity&&update>lock);
 assert.deepEqual(f.calls.find(x=>x.sql.includes('FROM smart_booking_openings WHERE id=$1')).args,[3,7]);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});

function replayDb({ageMs=0,booked=false}={}){
 const f=makeDb(sql=>{
  if(sql.includes('FROM walkin_qr_requests r')&&sql.includes('JOIN walkin_qr_tokens t'))return rows([{entry_id:7,barber_id:3}]);
  if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))return rows([{
   id:11,entry_id:7,opening_id:2,barber_id:3,status:'accepted',state:'accepted',
   expires_at:now(),decided_at:new Date(Date.now()-ageMs),start_at:start(),
   queue_status:'waiting',queue_today:true,duration_minutes:30,
  }]);
  if(sql.includes('SELECT clock_timestamp() AS db_now'))return rows([{db_now:now()}]);
  if(sql.includes('FROM smart_booking_confirmations WHERE offer_id'))return rows(booked?[{ok:true}]:[]);
  return rows([]);
 });
 return f;
}

test('v35 accepted offer replay in 2-minute window remains idempotent',async()=>{
 const f=replayDb({ageMs:30_000});
 const res=await createSmartBookingOffers(f.db).decide({token:qr,request_id:requestId,offer_id:11,action:'accept'});
 assert.equal(res.replayed,true);
 assert.equal(res.offer.status,'accepted');
 assert.equal(f.calls.some(x=>x.sql.includes("SET status='expired'")),false);
});

test('v35 old accepted offer cannot be replayed as valid before worker expiry',async()=>{
 const f=replayDb({ageMs:180_000});
 const res=await createSmartBookingOffers(f.db).decide({token:qr,request_id:requestId,offer_id:11,action:'accept'});
 assert.equal(res.httpStatus,410);
 assert.equal(res.code,'confirmation_expired');
 assert.equal(res.offer.status,'expired');
 assert.ok(f.calls.some(x=>x.sql.includes("SET status='expired'")));
 assert.ok(f.calls.some(x=>x.sql.includes("SET state='open'")));
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});

test('v35 booked accepted offer remains replayable without expiring valid booking',async()=>{
 const f=replayDb({ageMs:180_000,booked:true});
 const res=await createSmartBookingOffers(f.db).decide({token:qr,request_id:requestId,offer_id:11,action:'accept'});
 assert.equal(res.replayed,true);
 assert.equal(res.offer.status,'accepted');
 assert.equal(f.calls.some(x=>x.sql.includes("SET status='expired'")),false);
});
