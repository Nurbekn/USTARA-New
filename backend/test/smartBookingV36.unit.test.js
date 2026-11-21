'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createManualQueueClaims}=require('../services/manualQueueClaims');
const {createSmartBookingConfirmation}=require('../services/smartBookingConfirmation');
const {createOfferCallbackHandler}=require('../telegram/offerCallbacks');
const rows=r=>({rows:r,rowCount:r.length});
const barber={role:'barber',profileId:7,accountId:9};
const customer={role:'customer',profileId:13,accountId:15};
const qr='a'.repeat(48),receipt='b'.repeat(32);
function mockDb({inactive=false,invalidQr=false,invalidClaim=false,offerValid=true}={}){
 const calls=[];
 const c={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('FROM barbers b JOIN users u'))return rows(inactive?[]:[{id:7}]);
  if(sql.includes('FROM customers c JOIN users u'))return rows(inactive?[]:[{id:13}]);
  if(sql.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens t'))return rows(invalidQr?[]:[{entry_id:11,barber_id:7}]);
  if(sql.includes('FROM smart_booking_offers f')&&sql.includes('JOIN walkin_manual_claims m'))return rows(invalidClaim?[]:[{entry_id:11,barber_id:7}]);
  if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))return rows([{barber_id:7,duration_minutes:30,start_at:new Date(Date.now()+3600000),decided_at:new Date(Date.now()-1000),valid:offerValid}]);
  if(sql.includes('FROM services s'))return rows([{id:8,name:'Test Service',price:'12000',duration_minutes:30}]);
  if(sql.includes('SELECT q.id FROM walkin_queue q WHERE q.id='))return rows([{id:11}]);
  if(sql.includes('SELECT customer_id,(claim_hash IS NOT NULL'))return rows([{customer_id:null,throttled:false}]);
  if(sql.includes('INSERT INTO walkin_manual_claims'))return rows([{claim_expires_at:new Date(Date.now()+900000)}]);
  return rows([]);
 },release(){}};
 return {calls,db:{connect:async()=>c}};
}

test('v36 barber identity and account lock precede advisory lock during manual-code issue',async()=>{
 const f=mockDb();const result=await createManualQueueClaims(f.db).issue({actor:barber,entry_id:11});
 assert.equal(result.entry_id,11);
 const identity=f.calls.findIndex(x=>x.sql.includes('FROM barbers b JOIN users u'));
 const advisory=f.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 assert.ok(identity>=0&&advisory>identity);
 assert.match(f.calls[identity].sql,/FOR SHARE OF b,u/);
 assert.deepEqual(f.calls[identity].args,[7,9]);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('v36 inactive barber cannot acquire a manual-code advisory lock',async()=>{
 const f=mockDb({inactive:true});
 await assert.rejects(createManualQueueClaims(f.db).issue({actor:barber,entry_id:11}),{status:403});
 assert.equal(f.calls.some(x=>x.sql.includes('pg_advisory_xact_lock')),false);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('v36 manual service choices require locked identity and locked original consent',async()=>{
 const f=mockDb();const result=await createSmartBookingConfirmation(f.db).services({offer_id:31,actor:customer,manual:true,multi_service:true});
 assert.equal(result.duration_minutes,30);
 assert.equal(result.services.length,1);
 const identity=f.calls.findIndex(x=>x.sql.includes('FROM customers c JOIN users u'));
 const claim=f.calls.findIndex(x=>x.sql.includes('JOIN walkin_manual_claims m'));
 assert.ok(identity>=0&&claim>identity);
 assert.match(f.calls[identity].sql,/FOR SHARE OF c,u/);
 assert.match(f.calls[claim].sql,/FOR SHARE OF q,m/);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('v36 inactive customer session cannot enumerate manual service prices',async()=>{
 const f=mockDb({inactive:true});
 await assert.rejects(createSmartBookingConfirmation(f.db).services({offer_id:31,actor:customer,manual:true}),{status:401});
 assert.equal(f.calls.some(x=>x.sql.includes('FROM services s')),false);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('v36 revoked manual ticket cannot enumerate private service choices',async()=>{
 const f=mockDb({invalidClaim:true});
 await assert.rejects(createSmartBookingConfirmation(f.db).services({offer_id:31,actor:customer,manual:true}),{status:404});
 assert.equal(f.calls.some(x=>x.sql.includes('FROM services s')),false);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('v36 QR service lookup holds approved QR row lock until COMMIT',async()=>{
 const f=mockDb();const result=await createSmartBookingConfirmation(f.db).services({offer_id:31,token:qr,request_id:receipt});
 assert.equal(result.services[0].id,8);
 assert.ok(f.calls.some(x=>x.sql.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens t')&&x.sql.includes('FOR SHARE OF r')));
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('v36 QR revocation prevents service detail lookup and rolls back',async()=>{
 const f=mockDb({invalidQr:true});
 await assert.rejects(createSmartBookingConfirmation(f.db).services({offer_id:31,token:qr,request_id:receipt}),{status:404});
 assert.equal(f.calls.some(x=>x.sql.includes('FROM services s')),false);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('v36 expired offer cannot enumerate service choices despite a valid ticket',async()=>{
 const f=mockDb({offerValid:false});
 await assert.rejects(createSmartBookingConfirmation(f.db).services({offer_id:31,token:qr,request_id:receipt}),{status:410});
 assert.equal(f.calls.some(x=>x.sql.includes('FROM services s')),false);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
const goodCallback={id:'cb-1',data:'so:a:4',from:{id:250,is_bot:false},message:{chat:{id:250,type:'private'},from:{id:123,is_bot:true},message_id:77}};
test('v36 stale Telegram callback gets rejected without editing reply markup or promising a booking',async()=>{
 const seen=[],handler=createOfferCallbackHandler({offers:{decideByTelegram:async()=>({httpStatus:410})},botId:123,
  api:async(method,body)=>{seen.push({method,body});}});
 await handler(goodCallback);
 assert.equal(seen.filter(x=>x.method==='answerCallbackQuery').length,1);
 assert.equal(seen.some(x=>x.method==='editMessageReplyMarkup'),false);
 assert.ok(!JSON.stringify(seen).includes('Bron yaratildi'));
});
test('v36 Telegram callbacks with another bot or public chat never reach offers DB',async()=>{
 const seen=[];let decisionCount=0;
 const handler=createOfferCallbackHandler({offers:{decideByTelegram:async()=>{decisionCount++;}},botId:123,
  api:async(method,body)=>{seen.push({method,body});}});
 await handler({...goodCallback,message:{...goodCallback.message,from:{id:456,is_bot:true}}});
 await handler({...goodCallback,message:{...goodCallback.message,chat:{id:250,type:'group'}}});
 assert.equal(decisionCount,0);
 assert.equal(seen.length,2);
 assert.ok(seen.every(x=>x.method==='answerCallbackQuery'));
});
