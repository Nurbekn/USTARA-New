const { test } = require('node:test');
const assert = require('node:assert/strict');
const { telegramOtpConfig, createTelegramContacts, createTelegramOtpAdapter } = require('../services/telegramOtp');
const { createOtpDelivery } = require('../services/otpDelivery');
const { createUpdateHandler } = require('../telegram/handler');
const { TelegramApiError } = require('../telegram/api');
const env = { TELEGRAM_BOT_TOKEN: '123:'+'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_test_bot' };
const phone = '+998901234567';
const self = () => ({ chat: { type: 'private', id: 42 }, from: { id: 42, is_bot: false }, contact: { user_id: 42, phone_number: '998901234567' } });
function fixture() {
  const rows = new Map(), calls = [], deliveries = [], logs = [];
  let now = Date.now(); let snapshot;
  const client = { async query(sql, args=[]) {
    calls.push({ sql, args });
    if (sql === 'BEGIN') { snapshot = structuredClone(rows); return { rows: [] }; }
    if (sql === 'ROLLBACK') { rows.clear(); for (const [key,row] of snapshot) rows.set(key,row); return { rows: [] }; }
    if (sql === 'COMMIT' || sql.startsWith('SET ') || sql.startsWith('SELECT pg_advisory')) return { rows: [] };
    if (sql.startsWith('SELECT id FROM users')) return { rows: [] };
    if (sql.startsWith('INSERT INTO telegram_otp_contacts')) {
      const previous=rows.get(args[0]+':'+args[1]);
      if ([...rows.values()].some(r=>r.bot_id===args[0]&&r.chat_id===args[2]&&r.phone!==args[1])) throw Object.assign(Error('unique'),{code:'23505'});
      if(previous && (previous.chat_id!==args[2] || previous.user_id)) return {rows:[]};
      rows.set(args[0]+':'+args[1],{ bot_id:args[0],phone:args[1],chat_id:args[2],verified_at:now });return { rows: [{phone:args[1]}] };
    }
    if (sql.startsWith('SELECT chat_id FROM telegram_otp_contacts')) {
      const row=rows.get(args[0]+':'+args[1]);
      const valid=sql.includes('user_id=$3') ? row?.user_id===args[2] : row&&!row.user_id&&row.verified_at>now-30*60000;
      return { rows:valid?[row]:[] };
    }
    throw Error('Unexpected SQL');
  }, release() {} };
  const pool={query:client.query,async connect(){return client;}};
  const contacts=createTelegramContacts({ pool,botId:123 });
  const adapter=createTelegramOtpAdapter({ pool,env,api:async(...args)=>{deliveries.push(args);return {message_id:1,chat:{id:args[1].chat_id}};},logger:{error:(...args)=>logs.push(args)} });
  return {pool,contacts,adapter,calls,deliveries,logs,rows,advance:(ms)=>{now+=ms;}};
}
test('Telegram is the default and old Eskiz configuration never selects SMS',()=>{
  for(const config of [{}, {OTP_SMS_ADAPTER:'eskiz'}, {OTP_DELIVERY_ADAPTER:'eskiz'}]){
    const adapter=createOtpDelivery({ pool:{},env:{NODE_ENV:'production',...config} });
    assert.throws(()=>adapter.ready(),{code:'telegram_otp_unavailable'});
  }
  assert.equal(telegramOtpConfig(env).botUrl,'https://t.me/ustara_test_bot');
  assert.throws(()=>telegramOtpConfig({...env,TELEGRAM_BOT_USERNAME:'https://bad.invalid'}),{code:'telegram_otp_unavailable'});
});
test('self contact is required; group, forged, forwarded and bot contacts never touch DB',async()=>{
  const f=fixture();
  for(const message of [
    {...self(),chat:{id:42,type:'group'}}, {...self(),from:{id:43}},
    {...self(),contact:{user_id:43,phone_number:'998901234567'}},
    {...self(),contact:{phone_number:'998901234567'}}, {...self(),forward_origin:{}},
    {...self(),from:{id:42,is_bot:true}}, {...self(),contact:{user_id:42,phone_number:'invalid'}},
  ]) assert.equal(await f.contacts.bind(message),false);
  assert.equal(f.calls.length,0);
});
test('OTP reaches only verified phone/chat; it is not exposed or stored in contacts',async()=>{
  const f=fixture();assert.equal(await f.contacts.bind(self()),true);
  await f.adapter.send({phone,code:'00123'});
  assert.equal(f.deliveries.length,1);
  const [method,body]=f.deliveries[0];assert.equal(method,'sendMessage');assert.equal(body.chat_id,'42');
  assert.match(body.text,/00123/);assert.equal(body.protect_content,true);
  assert.equal(f.adapter.exposeCode(),false);assert.deepEqual(f.logs,[]);
  assert.ok(!JSON.stringify([...f.rows.values()]).includes('00123'));
});
test('missing, expired and different-bot contacts cannot receive OTP',async()=>{
  const f=fixture();await assert.rejects(f.adapter.send({phone,code:'12345'}),{code:'telegram_contact_required'});
  await f.contacts.bind(self());f.advance(30*60000);
  await assert.rejects(f.adapter.send({phone,code:'12345'}),{code:'telegram_contact_required'});
  assert.equal(f.deliveries.length,0);
  const other=createTelegramOtpAdapter({pool:f.pool,env:{...env,TELEGRAM_BOT_TOKEN:'124:'+'x'.repeat(30)}});
  await assert.rejects(other.send({phone,code:'12345'}),{code:'telegram_contact_required'});
});
test('contact changes cannot move a Telegram identity to another phone or replace its owner',async()=>{
  const f=fixture();await f.contacts.bind(self());
  await assert.rejects(f.contacts.bind({...self(),contact:{user_id:42,phone_number:'998901234568'}}),{code:'telegram_link_conflict'});
  await assert.rejects(f.contacts.bind({...self(),chat:{id:43,type:'private'},from:{id:43},contact:{user_id:43,phone_number:phone}}),{code:'telegram_link_conflict'});
  assert.equal(f.rows.size,1);
  assert.equal(f.rows.get('123:'+phone).chat_id,'42');
});
test('delivery failure is sanitized and never silently falls back to SMS',async()=>{
  const f=fixture();await f.contacts.bind(self());const logs=[];
  const adapter=createTelegramOtpAdapter({pool:f.pool,env,api:async()=>{throw new TelegramApiError(403);},logger:{error:(...args)=>logs.push(args)}});
  await assert.rejects(adapter.send({phone,code:'12345'}),{code:'telegram_otp_unavailable',status:503});
  assert.deepEqual(logs,[['telegram_otp_delivery_failed',{reason:'bot_blocked'}]]);
  assert.doesNotMatch(JSON.stringify(logs),/123456|998901234567|xxx/);
});
test('transaction client can send OTP without obtaining a second DB connection',async()=>{
  const f=fixture();await f.contacts.bind(self());
  const adapter=createTelegramOtpAdapter({pool:{query(){throw Error('Second connection forbidden');}},env,api:async(_method,body)=>({message_id:1,chat:{id:body.chat_id}})});
  await adapter.send({phone,code:'12345',client:f.pool});
});
test('bot cannot enroll a contact without a website challenge',async()=>{
  const f=fixture(),replies=[];
  const handler=createUpdateHandler({service:{consume(){throw Error('OTP start is not a barber link');}},contacts:f.contacts,
    username:env.TELEGRAM_BOT_USERNAME,api:async(method,body)=>replies.push({method,body})});
  await handler({message:{...self(),contact:undefined,text:'/start otp'}});
  assert.match(replies[0].body.text,/kontaktingizni ulashing/);
  await handler({message:self()});assert.equal(replies[1].body.reply_markup.remove_keyboard,true);
  assert.equal(f.rows.size,0);
});

test('reset delivers only to the durable matching account, including after contact TTL',async()=>{
  const f=fixture();await f.contacts.bind(self());
  await assert.rejects(f.adapter.send({phone,code:'12345',purpose:'password-reset',userId:7}),{code:'telegram_contact_required'});
  f.rows.get('123:'+phone).user_id=7;f.advance(24*60*60000);
  await f.adapter.send({phone,code:'00123',purpose:'password-reset',userId:7});
  await assert.rejects(f.adapter.send({phone,code:'12345',purpose:'password-reset',userId:8}),{code:'telegram_contact_required'});
  assert.equal(f.deliveries.length,1);
});

test('Telegram identity accepts exact BIGINT strings and rejects rounded numeric IDs',async()=>{
  const {privateSender}=require('../services/telegramOtp');
  const id='9007199254740993';
  assert.equal(privateSender({chat:{type:'private',id},from:{id}}),true);
  assert.equal(privateSender({chat:{type:'private',id:Number(id)},from:{id:Number(id)}}),false);
  assert.equal(privateSender({chat:{type:'private',id},from:{id:'9007199254740994'}}),false);
});

test('existing local integration harness can wrap the test delivery factory',()=>{
  const module = require('../services/registrationSms');
  const original = module.createTestSmsAdapter;
  let called = false;
  try {
    module.createTestSmsAdapter = settings => { called = true; return original(settings); };
    const adapter = createOtpDelivery({ pool: {}, env: { NODE_ENV: 'test', OTP_DELIVERY_ADAPTER: 'test' } });
    adapter.ready();
    assert.equal(called, true);
  } finally { module.createTestSmsAdapter = original; }
});
