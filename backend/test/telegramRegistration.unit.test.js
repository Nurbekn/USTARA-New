const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryPool } = require('./helpers/registrationPool');
const { createRegistrationService } = require('../services/registrationService');
const { createTelegramRegistration } = require('../services/telegramRegistration');
const env={NODE_ENV:'test',TELEGRAM_BOT_TOKEN:'123:'+'x'.repeat(30),TELEGRAM_BOT_USERNAME:'ustara_test_bot',OTP_HMAC_KEY:'a'.repeat(64),JWT_SECRET:'unit-secret'};
const phone='+998901234567';
function fixture(){
 const pool=createMemoryPool(),deliveries=[];
 const sms={deferredRegistration:true,ready(){},exposeCode:()=>false,async send(body){deliveries.push(body);}};
 const service=createRegistrationService({pool,env,sms});
 const start=()=>service.start({phone,password:'TelegramFlow123',role:'customer'});
 const bind=()=>{const r=pool.state.telegramRequests[0];r.chat_id='42';return {registrationId:r.registration_id,tokenHash:r.token_hash,phone,chatId:42};};
 return {pool,service,start,bind,deliveries};
}
test('Continue prepares a phone request without contact, OTP send or send-budget consumption',async()=>{
 const f=fixture(),r=await f.start();assert.equal(r.status,201);assert.equal(r.body.deliveryPending,true);assert.equal(r.body.otpExpiresAt,null);
 assert.equal(r.body.botUrl,'https://t.me/ustara_test_bot');
 assert.match(f.pool.state.telegramRequests[0].token_hash,/^[0-9a-f]{64}$/);
 assert.ok(!JSON.stringify(r.body).includes(f.pool.state.telegramRequests[0].token_hash));
 assert.equal(f.deliveries.length,0);assert.equal(f.pool.state.limits[0].send_count,0);assert.equal(f.pool.state.history.length,0);
});
test('waiting cooldown starts at signup, while OTP expiry starts at delivery; repeated contact does not resend',async()=>{
 const f=fixture(),r=await f.start();const input={sessionToken:r.body.sessionToken};f.pool.advance(4*60000);
 assert.equal((await f.service.verify({...input,otp:'123456'})).body.code,'otp_not_sent');assert.equal(f.pool.state.pending[0].otp_failed_attempts,0);
 assert.equal((await f.service.status(input)).body.deliveryPending,true);
 const args=f.bind();assert.equal((await f.service.deliverTelegram(args)).status,200);assert.equal(f.deliveries.length,1);
 const state=(await f.service.status(input)).body;assert.equal(state.deliveryPending,false);assert.equal(+new Date(state.otpExpiresAt)-+new Date(f.pool.state.pending[0].otp_sent_at),60000);
 assert.equal((await f.service.deliverTelegram(args)).body.code,'already_sent');assert.equal(f.deliveries.length,1);
 assert.equal((await f.service.verify({...input,otp:f.deliveries[0].code})).status,200);
 assert.equal((await f.service.complete({...input,firstName:'Ali',lastName:'Vali'})).status,201);
 assert.equal(f.pool.state.telegramRequests.length,0);
});
test('wrong phone, wrong chat and rotated generation cannot deliver; resend preserves cooldown and attempt counts',async()=>{
 const f=fixture(),r=await f.start(),input={sessionToken:r.body.sessionToken},args=f.bind();
 await assert.rejects(f.service.deliverTelegram({...args,phone:'+998901234568'}),{code:'invalid_session'});
 await assert.rejects(f.service.deliverTelegram({...args,chatId:43}),{code:'telegram_request_expired'});
 assert.equal((await f.service.resend(input)).status,429);
 f.pool.advance(60000);
 await f.service.resend(input);await assert.rejects(f.service.deliverTelegram(args),{code:'telegram_request_expired'});
 await f.service.deliverTelegram(f.bind());assert.equal((await f.service.resend(input)).status,429);
 const wrong=f.deliveries[0].code==='000000'?'111111':'000000';await f.service.verify({...input,otp:wrong});
 f.pool.advance(60000);assert.equal((await f.service.resend(input)).body.deliveryPending,true);assert.equal(f.pool.state.pending[0].otp_failed_attempts,1);
 await f.service.deliverTelegram(f.bind());assert.equal(f.pool.state.limits[0].send_count,2);assert.equal(f.deliveries.length,2);
});

test('server cooldown survives status/contact, and only accepted resend resets it',async()=>{
 const f=fixture(),started=await f.start(),input={sessionToken:started.body.sessionToken};
 assert.equal(started.body.resendAfter,60);
 const original=+new Date(started.body.resendAvailableAt);
 f.pool.advance(20000);
 assert.equal((await f.service.status(input)).body.resendAfter,40);
 const rejected=await f.service.resend(input);
 assert.equal(rejected.status,429);assert.equal(rejected.body.retryAfter,40);
 assert.equal(+new Date(f.pool.state.pending[0].resend_available_at),original);
 await f.service.deliverTelegram(f.bind());
 const delivered=(await f.service.status(input)).body;
 assert.equal(delivered.resendAfter,40);assert.equal(+new Date(delivered.resendAvailableAt),original);
 f.pool.advance(60000);
 const next=await f.service.resend(input);
 assert.equal(next.status,200);assert.equal(next.body.resendAfter,60);
 assert.ok(+new Date(next.body.resendAvailableAt)>original);
 assert.ok(f.pool.state.history[0].invalidated_at);
 assert.equal((await f.service.resend(input)).status,429);
});
test('storage failure rolls back issuance, delivery state and send budget',async()=>{
 const f=fixture();await f.start();const args=f.bind();f.pool.fault='INSERT INTO registration_otp_history';
 await assert.rejects(f.service.deliverTelegram(args));assert.equal(f.pool.state.telegramRequests[0].delivered_at,null);assert.equal(f.pool.state.limits[0].send_count,0);assert.equal(f.deliveries.length,0);
});
test('bot checks self-contact and exact website phone before binding or delivering',async()=>{
 let binds=0,sends=0;
 const request={registration_id:'1',token_hash:'a'.repeat(64),phone};
 const flow=createTelegramRegistration({env,pool:{async query(){return {rows:[request]};}},contacts:{async bind(){binds++;return true;}},deliver:async args=>{sends++;assert.equal(args.phone,phone);return {status:200,body:{code:'otp_sent'}};}});
 const message={chat:{id:42,type:'private'},from:{id:42},contact:{user_id:42,phone_number:'998901234568'}};
 await assert.rejects(flow.contact(message),{code:'telegram_phone_mismatch'});assert.equal(binds,0);assert.equal(sends,0);
 await assert.rejects(flow.contact({...message,contact:{user_id:43,phone_number:phone}}),{code:'telegram_invalid_contact'});
 assert.equal((await flow.contact({...message,contact:{user_id:42,phone_number:phone}})).status,200);assert.equal(binds,1);assert.equal(sends,1);
});

test('active signup restarts immediately, revokes credentials and Telegram generation, and preserves security counters',async()=>{
 const f=fixture(),first=await f.start(),old=f.bind();
 await f.service.deliverTelegram(old);
 const firstCode=f.deliveries[0].code;
 await f.service.verify({sessionToken:first.body.sessionToken,otp:'wrong'});
 const second=await f.start();
 assert.equal(second.status,201);assert.equal(second.body.restarted,true);
 assert.notEqual(second.body.sessionToken,first.body.sessionToken);
 assert.equal(second.body.deliveryRetryAfter,60);
 assert.equal(f.pool.state.pending.length,1);assert.equal(f.pool.state.telegramRequests.length,1);
 assert.equal(f.pool.state.pending[0].otp_failed_attempts,1);
 assert.equal(f.pool.state.pending[0].phone_verified_at,null);
 assert.equal(f.pool.state.limits[0].send_count,1);
 assert.equal(f.pool.state.history[0].invalidation_reason,'registration_restarted');
 for(const action of ['status','resend','verify','complete']) await assert.rejects(f.service[action]({sessionToken:first.body.sessionToken,otp:firstCode,firstName:'Ali',lastName:'Vali'}),{code:'invalid_session'});
 await assert.rejects(f.service.deliverTelegram(old),{code:'invalid_session'});
 assert.equal((await f.service.verify({sessionToken:second.body.sessionToken,otp:firstCode})).body.code,'otp_not_sent');
 assert.equal((await f.service.complete({sessionToken:second.body.sessionToken,firstName:'Ali',lastName:'Vali'})).body.code,'verification_required');
 assert.equal((await f.service.deliverTelegram(f.bind())).status,429);
 assert.equal(f.deliveries.length,1);
 f.pool.advance(60000);await f.service.deliverTelegram(f.bind());
 assert.equal(f.deliveries.length,2);assert.equal(f.pool.state.limits[0].send_count,2);
});

test('a verified unfinished session can restart but never transfers verification to a new device',async()=>{
 const f=fixture(),first=await f.start();await f.service.deliverTelegram(f.bind());
 await f.service.verify({sessionToken:first.body.sessionToken,otp:f.deliveries[0].code});
 const second=await f.start();assert.equal(second.status,201);
 const pending=f.pool.state.pending[0];
 assert.equal(pending.phone_verified_at,null);assert.equal(pending.completion_expires_at,null);
 await assert.rejects(f.service.complete({sessionToken:first.body.sessionToken,firstName:'Ali',lastName:'Vali'}),{code:'invalid_session'});
 assert.equal((await f.service.complete({sessionToken:second.body.sessionToken,firstName:'Ali',lastName:'Vali'})).status,403);
});

test('failed replacement rolls back the old session and history atomically',async()=>{
 const f=fixture(),first=await f.start(),old=f.bind();await f.service.deliverTelegram(old);
 f.pool.fault='INSERT INTO telegram_registration_requests';await assert.rejects(f.start());
 assert.equal((await f.service.status({sessionToken:first.body.sessionToken})).body.deliveryPending,false);
 assert.equal(f.pool.state.history[0].invalidated_at,null);assert.equal(f.pool.state.limits[0].send_count,1);
 assert.equal((await f.service.verify({sessionToken:first.body.sessionToken,otp:f.deliveries[0].code})).status,200);
});
