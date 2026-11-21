'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSmartBookingTelegram}=require('../services/smartBookingTelegram');
const {TelegramApiError}=require('../telegram/api');
const {createOfferCallbackHandler}=require('../telegram/offerCallbacks');
const rows=v=>({rows:v,rowCount:v.length});
function fake(available=true,eligible=true){
 const calls=[];let sent=null;
 const pool={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('RETURNING t.id,t.offer_id,t.chat_id,t.attempts'))
   return rows(available?[{id:1,offer_id:4,chat_id:'250',attempts:1}]:[]);
  if(sql.includes('SELECT f.expires_at,o.start_at'))return rows(eligible?[{
   expires_at:new Date(Date.now()+300000),start_at:new Date(Date.now()+3600000)}]:[]);
  return rows([]);
 }};
 const run=api=>createSmartBookingTelegram({pool,api});
 return {calls,run};
}
test('v27 only sends offers with separate consent, active QR and pending expiry',async()=>{
 const f=fake();let msg;
 const service=f.run(async(method,body)=>{assert.equal(method,'sendMessage');msg=body;return {message_id:77,chat:{id:body.chat_id}};});
 assert.equal(await service.step(),true);
 assert.equal(msg.chat_id,'250');assert.equal(msg.protect_content,true);
 assert.deepEqual(msg.reply_markup.inline_keyboard[0].map(x=>x.callback_data),['so:a:4','so:r:4']);
 assert.ok(!JSON.stringify(msg).includes('customer_id'));
 assert.match(msg.text,/QR navbat yoki «Oddiy navbatim»/);
 assert.match(msg.text,/2 daqiqada/);
 assert.ok(f.calls.some(x=>x.sql.includes('s.offers_consent_at IS NOT NULL')));
 assert.ok(f.calls.some(x=>x.sql.includes('FOR UPDATE OF t SKIP LOCKED')));
 assert.ok(f.calls.some(x=>x.sql.includes("status='sent'")&&x.args[2]===77));
});
test('v27 does not send to revoked/expired subscriptions and does not blind-retry uncertain sends',async()=>{
 const absent=fake(true,false);let dispatched=0;
 await absent.run(async()=>{dispatched++;}).step();assert.equal(dispatched,0);
 assert.ok(absent.calls.some(x=>x.sql.includes("status='cancelled'")));
 const uncertain=fake();await uncertain.run(async()=>{throw new TelegramApiError('transport');}).step();
 assert.ok(uncertain.calls.some(x=>x.args.includes('uncertain')));
 assert.ok(uncertain.calls.some(x=>x.sql.includes("status='uncertain'")&&x.sql.includes('lease_until<clock_timestamp()')));
});
test('v27 known rate limit retries; forbidden chat is terminal',async()=>{
 for(const [code,expected] of [[429,'pending'],[403,'failed']]){
  const f=fake();await f.run(async()=>{throw new TelegramApiError(code);}).step();
  assert.ok(f.calls.some(x=>x.args.includes(expected)));
 }
});
const goodQuery={id:'abc',data:'so:a:4',from:{id:250,is_bot:false},
 message:{chat:{id:250,type:'private'},from:{id:123,is_bot:true},message_id:77}};
test('v27 spoofed Telegram offer callback is blocked before database decision',async()=>{
 let calls=0;const replies=[];
 const handler=createOfferCallbackHandler({offers:{decideByTelegram:async()=>{calls++;return {replayed:false};}},
  api:async(m,b)=>{replies.push({m,b});},botId:123});
 await handler({...goodQuery,from:{id:999,is_bot:false}});
 assert.equal(calls,0);assert.equal(replies.at(-1).m,'answerCallbackQuery');
});
test('v27 Telegram acceptance never claims a booking was created',async()=>{
 const decisions=[],replies=[];
 const handler=createOfferCallbackHandler({offers:{decideByTelegram:async payload=>{decisions.push(payload);return {replayed:false};}},
  api:async(m,b)=>{replies.push({m,b});},botId:123});
 await handler(goodQuery);
 assert.deepEqual(decisions,[{offer_id:4,action:'accept',chat_id:250,message_id:77}]);
 assert.equal(replies.some(x=>x.m==='answerCallbackQuery' && /QR navbat yoki «Oddiy navbatim»/.test(x.b.text)),true);
 assert.ok(!replies.some(x=>x.m==='sendMessage'));
});
