const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createTelegramContacts } = require('../services/telegramOtp');
const { createOtpRateLimit } = require('../services/otpRateLimit');
const { createOtpIpLimit } = require('../middleware/otpRateLimit');
const { createWebhookController } = require('../telegram/webhook');
const { createUpdateHandler } = require('../telegram/handler');
const { createTelegramApi } = require('../telegram/api');
const env = { TELEGRAM_UPDATE_MODE: 'webhook', TELEGRAM_WEBHOOK_SECRET: 'unit_secret_'.repeat(4),
  TELEGRAM_BOT_TOKEN: '123:' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_test_bot', OTP_HMAC_KEY: 'k'.repeat(64) };
function response() {
  return { headers: {}, set(k, v) { this.headers[k] = v; }, sendStatus(n) { this.statusCode = n; return this; },
    status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
}
test('plain start and legacy reg_ links only request contact, never claim a session',async()=>{
 const replies=[];
 const handler=createUpdateHandler({username:env.TELEGRAM_BOT_USERNAME,contacts:{},
   api:async(_method,body)=>replies.push(body),registration:{claim(){assert.fail('Legacy claim must not run');}}});
 for(const text of ['/start','/start reg_'+'a'.repeat(43)]) {
   await handler({message:{chat:{id:42,type:'private'},from:{id:42},text}});
 }
 assert.equal(replies.length,2);
 // /start now opens the main menu, while /start reg_* must request contact.
 assert.ok(Array.isArray(replies[0].reply_markup.keyboard));
 assert.ok(replies[1].reply_markup.keyboard[0][0].request_contact);
});
test('existing account cannot be enrolled by contact alone',async()=>{
  let wrote=false;
  const client={release(){},async query(sql){
    if(sql.startsWith('SELECT id FROM users')) return {rows:[{id:7}]};
    if(sql.startsWith('INSERT')) wrote=true;
    return {rows:[]};
  }};
  const contacts=createTelegramContacts({pool:{connect:async()=>client},botId:123});
  await assert.rejects(contacts.bind({chat:{id:42,type:'private'},from:{id:42},contact:{user_id:42,phone_number:'998901234567'}}),{code:'telegram_link_conflict'});
  assert.equal(wrote,false);
});
test('rate limiter hashes identities and uses a single bounded UPSERT; simulated parallel budget is shared',async()=>{
  let count=0;
  const consume=createOtpRateLimit({env,pool:{async query(sql,args){
    assert.match(sql,/ON CONFLICT\(scope,key_hash\) DO UPDATE/);
    assert.match(sql,/LEAST/);assert.match(args[1],/^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(args).includes('198.51.100.7'));
    return {rows:[{request_count:++count}]};
  }}});
  const results=await Promise.all(Array.from({length:12},()=>consume('ip:start','198.51.100.7',3,600)));
  assert.equal(results.filter(Boolean).length,3);
});
test('IP limit rejects excess calls, fails closed and ignores forwarded headers',async()=>{
  let count=0;
  const middleware=createOtpIpLimit({env,pool:{async query(){return {rows:[{request_count:++count}]};}}});
  const req={method:'POST',path:'/registration/start',ip:'127.0.0.1',headers:{'x-forwarded-for':'another-client'}};
  let accepted=0;
  for(let i=0;i<21;i++) {const res=response();await middleware(req,res,()=>accepted++);if(i===20){assert.equal(res.statusCode,429);assert.equal(res.headers['Retry-After'],'600');}}
  assert.equal(accepted,20);
  const failing=createOtpIpLimit({env,pool:{async query(){throw Error('private');}}}),res=response();
  await failing(req,res,()=>assert.fail());assert.equal(res.statusCode,503);assert.ok(!JSON.stringify(res.body).includes('private'));
});
function webhookFixture(options={}) {
  const receipts=new Set();let calls=0,connections=0,released=0;
  const client=Object.assign(new EventEmitter(),{release(destroy){assert.equal(destroy,true);released++;},async query(sql,args){
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)) return {rows:[],command:sql};
    if(sql.includes('pg_try_advisory_lock')) return {rows:[{acquired:options.lock!==false}]};
    if(sql.startsWith('SELECT update_id')) return {rows:receipts.has(args[1])?[{update_id:args[1]}]:[]};
    if(sql.startsWith('INSERT INTO telegram_webhook_receipts')) {receipts.add(args[1]);return {rows:[]};}
    throw Error('Unexpected SQL');
  }});
  const controller=createWebhookController({env,pool:{async connect(){connections++;return client;}},handlerFactory:()=>async()=>{calls++;if(options.fail)throw Error('private-token');}});
  const request=(secret=env.TELEGRAM_WEBHOOK_SECRET,id=1)=>({get:()=>secret,body:{update_id:id,message:{}}});
  return {controller,request,receipts,get calls(){return calls;},get connections(){return connections;},get released(){return released;}};
}
test('IP limiter schema va storage xatolarini secretlarsiz kategoriyalaydi',async()=>{
  for(const [code,reason] of [['42P01','schema_missing'],['42501','storage_permission'],['unknown-secret','storage_unavailable']]){
    const logs=[],res=response();
    const middleware=createOtpIpLimit({env,pool:{async query(){throw Object.assign(Error('private-phone-token'),{code,detail:'private-hmac'});}},
      logger:{error:(...args)=>logs.push(args)}});
    await middleware({method:'POST',path:'/registration/start',ip:'198.51.100.1',body:{phone:'private-phone'}},res,()=>assert.fail());
    assert.equal(res.statusCode,503);
    assert.deepEqual(logs,[['otp_rate_limit_unavailable',{stage:'otp_ip_limit',reason}]]);
    assert.doesNotMatch(JSON.stringify(logs),/private|secret|198\.51/);
  }
});
test('IP limiter HMAC readiness xatosini storage xatosidan ajratadi; logger xatosi himoyani buzmaydi',async()=>{
  const logs=[],res=response();let queries=0;
  const middleware=createOtpIpLimit({env:{},pool:{async query(){queries++;}},logger:{error:(...args)=>logs.push(args)}});
  await middleware({method:'POST',path:'/registration/start',ip:'unit'},res,()=>assert.fail());
  assert.equal(queries,0);assert.equal(res.statusCode,503);
  assert.equal(logs[0][1].reason,'otp_configuration');
  const failing=createOtpIpLimit({env:{},pool:{},logger:{error(){throw Error('logger fault');}}}),other=response();
  await failing({method:'POST',path:'/registration/start',ip:'unit'},other,()=>assert.fail());
  assert.equal(other.statusCode,503);
});
test('webhook verifies secret and body before connecting; repeated authenticated updates are acknowledged once',async()=>{
  const f=webhookFixture();
  for(const secret of [undefined,'wrong']) {const res=response();await f.controller(f.request(secret===undefined?'':secret),res);assert.equal(res.statusCode,403);}
  const bad=response();await f.controller(f.request(env.TELEGRAM_WEBHOOK_SECRET,-1),bad);assert.equal(bad.statusCode,400);assert.equal(f.connections,0);
  for(let i=0;i<2;i++){const res=response();await f.controller(f.request(),res);assert.equal(res.statusCode,200);}
  assert.equal(f.calls,1);assert.equal(f.released,2);
  const outOfOrder=response();await f.controller(f.request(env.TELEGRAM_WEBHOOK_SECRET,0),outOfOrder);
  assert.equal(outOfOrder.statusCode,200);assert.equal(f.calls,2);
});
test('webhook failures remain retryable and do not acknowledge failed updates or concurrent polling',async()=>{
  for(const options of [{fail:true},{lock:false}]){
    const f=webhookFixture(options),res=response();await f.controller(f.request(),res);
    assert.equal(res.statusCode,503);assert.equal(f.receipts.size,0);assert.equal(f.released,1);
  }
});
test('Telegram account limit runs before contact handling and suppresses excess responses',async()=>{
  let contacts=0,replies=0;
  const handler=createUpdateHandler({username:env.TELEGRAM_BOT_USERNAME,api:async()=>replies++,rateLimit:async()=>false,
    registration:{contact:async()=>contacts++},contacts:{}});
  await handler({message:{chat:{id:42,type:'private'},from:{id:42},contact:{user_id:42}}});
  assert.equal(contacts,0);assert.equal(replies,0);
});
test('Telegram transport timeout discards raw fetch URL and secrets',async()=>{
  const api=createTelegramApi(env.TELEGRAM_BOT_TOKEN,async(_url,options)=>{
    assert.ok(options.signal instanceof AbortSignal);
    throw Object.assign(Error('private URL and OTP'),{name:'TimeoutError'});
  });
  await assert.rejects(api('sendMessage',{chat_id:'42',text:'000123'},AbortSignal.timeout(1)),error=>{
    assert.equal(error.code,'transport');assert.equal(error.cause,undefined);assert.equal(error.message,'Telegram API unavailable');return true;
  });
});

test('production reset known/unknown/provider-error javoblari bir xil minimal vaqtgacha kutadi',async()=>{
  const {createPasswordResetController}=require('../controllers/passwordResetController');
  for(const duration of [5,8000]){
    let reads=0,waited;
    const controller=createPasswordResetController({start:async()=>({status:200,body:{code:'reset_requested'}})},
      {env:{NODE_ENV:'production'},now:()=>reads++?duration:0,sleep:async ms=>{waited=ms;}});
    const res=response();await controller.start({body:{}},res);
    assert.equal(duration+waited,9000);assert.equal(res.statusCode,200);
  }
  let waited;
  const controller=createPasswordResetController({start:async()=>{throw Error('secret');}},
    {env:{NODE_ENV:'production'},now:()=>0,sleep:async ms=>{waited=ms;}});
  const res=response();await controller.start({body:{}},res);assert.equal(waited,9000);assert.equal(res.statusCode,503);
});
