// Explicitly opted-in disposable PostgreSQL cluster; never reads db.js or .env.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createOtpPostgresHarness } = require('./helpers/otpPostgres');
const { createRegistrationService } = require('../services/registrationService');
const { createTelegramContacts, createTelegramOtpAdapter } = require('../services/telegramOtp');
const { createTelegramRegistration } = require('../services/telegramRegistration');
const { createUpdateHandler } = require('../telegram/handler');

test('OTP cooldown: disposable PostgreSQL, contact ownership, transactions and regressions', {
  skip: process.env.USTARA_DISPOSABLE_OTP_TESTS !== 'I_AUTHORIZE_TEMP_DATABASE',
}, async t => {
  const h = await createOtpPostgresHarness();
  t.after(() => h.close());
  console.log('Ajratilgan test artefaktlari:', h.root);
  await h.admin.query('CREATE EXTENSION btree_gist WITH SCHEMA public');
  for (const name of ['20261115_slots_02_booking_no_overlap.sql', '20261116_account_profile_deletion_integrity.sql',
    '20261122_telegram_phone_requests.sql', '20261123_security_login_policy.sql']) {
    await h.admin.query(fs.readFileSync(path.join(__dirname, '../database/migrations', name), 'utf8'));
  }
  const legacyPhone='+998900000098';
  await h.admin.query('INSERT INTO registration_phone_limits(phone) VALUES($1)',[legacyPhone]);
  const legacy=(await h.admin.query(`INSERT INTO pending_registrations
    (phone,role,password_hash,otp_hmac_hash,otp_hmac_key_id,otp_issuance_nonce,otp_sent_at,otp_expires_at,session_token_hash,session_expires_at,created_at,updated_at)
    SELECT $1,'customer',$2,$3,'legacy-test',$4,t,t+INTERVAL '3 minutes',$5,t+INTERVAL '30 minutes',t,t
    FROM (SELECT date_trunc('milliseconds',clock_timestamp()) t) fixture RETURNING *`,
    [legacyPhone,await require('../utils/passwordPolicy').hashPassword('LegacyTest123'),'1'.repeat(64),'2'.repeat(64),'3'.repeat(64)])).rows[0];
  const legacyHistory=(await h.admin.query(`INSERT INTO registration_otp_history
    (phone,registration_id,issuance_nonce,otp_hmac_hash,otp_hmac_key_id,sent_at,expires_at)
    VALUES($1,$2,$3,$4,'legacy-test',$5,$6) RETURNING *`,[legacyPhone,legacy.id,'2'.repeat(64),'1'.repeat(64),legacy.otp_sent_at,legacy.otp_expires_at])).rows[0];
  await h.admin.query(fs.readFileSync(path.join(__dirname, '../database/migrations/20261123_registration_resend_cooldown.sql'), 'utf8'));
  const {resend_available_at,...preserved}=(await h.admin.query('SELECT * FROM pending_registrations WHERE id=$1',[legacy.id])).rows[0];
  assert.equal(resend_available_at,null);assert.deepEqual(preserved,legacy);
  assert.deepEqual((await h.admin.query('SELECT * FROM registration_otp_history WHERE id=$1',[legacyHistory.id])).rows[0],legacyHistory);
  h.record('legacy_rows_preserved','PASS');
  // Repeat only the new migration to verify its applied-schema guard.
  await h.admin.query(fs.readFileSync(path.join(__dirname, '../database/migrations/20261123_registration_resend_cooldown.sql'), 'utf8'));
  const env = { NODE_ENV:'test', TELEGRAM_BOT_TOKEN:'123456:'+'x'.repeat(30), TELEGRAM_BOT_USERNAME:'ustara_booking_bot',
    OTP_HMAC_KEY:crypto.randomBytes(48).toString('hex'), JWT_SECRET:process.env.JWT_SECRET };
  const deliveries = [];
  let failDelivery = false;
  const sms = createTelegramOtpAdapter({pool:h.pool, env, logger:{error(){}}, api:async (_method, body) => {
    if (failDelivery) throw Error('Test provider unavailable');
    deliveries.push({code:/kodi: (\d{5})/.exec(body.text)[1], chat:String(body.chat_id)});
    return {message_id:deliveries.length, chat:{id:body.chat_id}};
  }});
  const service = createRegistrationService({pool:h.pool,env,sms});
  const contacts = createTelegramContacts({pool:h.pool,botId:123456});
  const flow = createTelegramRegistration({pool:h.pool,env,contacts,deliver:service.deliverTelegram});
  const start = (phone, role='customer') => service.start({phone,role,password:'CooldownTest123',...(role==='barber'?{specialty:'barber'}:{})});
  const contact = (phone, id=700001) => ({chat:{id,type:'private'},from:{id},contact:{user_id:id,phone_number:phone}});
  const session = result => ({sessionToken:result.body.sessionToken});
  const row = async phone => (await h.admin.query('SELECT * FROM pending_registrations WHERE phone=$1',[phone])).rows[0];
  async function age(phone) {
    await h.admin.query("UPDATE pending_registrations SET resend_available_at=clock_timestamp()-INTERVAL '1 second' WHERE phone=$1",[phone]);
    await h.admin.query("UPDATE registration_phone_limits SET last_sent_at=clock_timestamp()-INTERVAL '61 seconds' WHERE phone=$1 AND last_sent_at IS NOT NULL",[phone]);
  }
  await t.test('signup starts cooldown without sending; status and /start never reset it',async()=>{
    const phone='+998900000001', result=await start(phone), input=session(result);
    assert.equal(result.body.resendAfter,60);assert.equal(result.body.deliveryPending,true);
    assert.equal(result.body.botUrl,'https://t.me/ustara_booking_bot');assert.equal(deliveries.length,0);
    const before=await row(phone);
    assert.equal(+before.resend_available_at-+before.created_at,60000);
    const status=await service.status(input);assert.ok(status.body.resendAfter>0);
    assert.equal((await service.resend(input)).status,429);
    const messages=[];
    const handler=createUpdateHandler({contacts,registration:flow,username:env.TELEGRAM_BOT_USERNAME,api:async(_method,body)=>messages.push(body)});
    await handler({message:{chat:{id:700001,type:'private'},from:{id:700001},text:'/start'}});
    assert.equal(messages[0].reply_markup.keyboard[0][0].request_contact,true);
    assert.equal(deliveries.length,0);assert.equal(+(await row(phone)).resend_available_at,+before.resend_available_at);
    await assert.rejects(flow.contact({...contact(phone),contact:{user_id:700002,phone_number:phone}}),{code:'telegram_invalid_contact'});
    assert.equal(await flow.contact(contact('+998900000099')),null);
    assert.equal(deliveries.length,0);
    await h.admin.query("UPDATE pending_registrations SET resend_available_at=resend_available_at-INTERVAL '20 seconds' WHERE phone=$1",[phone]);
    const deadline=+(await row(phone)).resend_available_at;
    const results=await Promise.all([flow.contact(contact(phone)),flow.contact(contact(phone))]);
    assert.deepEqual(results.map(r=>r.body.code).sort(),['already_sent','otp_sent']);
    assert.equal(deliveries.length,1);
    assert.equal(+(await row(phone)).resend_available_at,deadline);
    assert.ok((await service.status(input)).body.resendAfter<=40);
    const stored=await row(phone);assert.notEqual(stored.otp_hmac_hash,deliveries[0].code);
    assert.equal((await service.verify({...input,otp:'bad'})).body.code,'invalid_otp');
    assert.equal((await service.verify({...input,otp:deliveries[0].code})).status,200);
    assert.equal((await service.complete({...input,firstName:'Sinov',lastName:'Mijoz'})).status,201);
    const app=require('express')();
    app.use(require('express').json());
    app.post('/login',require('../services/loginAuthentication').createRoleLogin(null,h.pool));
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    try {
      const login=await fetch(`http://127.0.0.1:${server.address().port}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password:'CooldownTest123'})});
      assert.equal(login.status,200);
    } finally { await new Promise(resolve=>server.close(resolve)); }
    h.record('signup_contact_verify_login','PASS');
  });
  await t.test('parallel resends accept once; old OTP/generation revoked; failed provider rolls back',async()=>{
    const phone='+998900000002',result=await start(phone,'barber'),input=session(result);
    await flow.contact(contact(phone,700002));
    const oldCode=deliveries.at(-1).code;
    const previous=(await h.admin.query('SELECT * FROM telegram_registration_requests WHERE registration_id=$1',[(await row(phone)).id])).rows[0];
    await age(phone);
    const resultSet=await Promise.all([service.resend(input),service.resend(input),service.resend(input)]);
    assert.deepEqual(resultSet.map(r=>r.status).sort(),[200,429,429]);
    assert.equal((await service.verify({...input,otp:oldCode})).body.code,'otp_not_sent');
    await assert.rejects(service.deliverTelegram({registrationId:previous.registration_id,tokenHash:previous.token_hash,phone,chatId:700002}),{code:'telegram_request_expired'});
    const deadline=+(await row(phone)).resend_available_at;
    failDelivery=true;
    await assert.rejects(flow.contact(contact(phone,700002)),{code:'telegram_otp_unavailable'});
    assert.equal(+(await row(phone)).resend_available_at,deadline);
    assert.equal((await h.admin.query('SELECT send_count FROM registration_phone_limits WHERE phone=$1',[phone])).rows[0].send_count,1);
    failDelivery=false;
    await flow.contact(contact(phone,700002));
    const current=deliveries.at(-1).code;
    assert.notEqual(current,oldCode);
    assert.equal((await service.verify({...input,otp:oldCode})).body.code,'invalid_otp');
    assert.equal((await service.verify({...input,otp:current})).status,200);
    assert.equal((await service.complete({...input,firstName:'Sinov',lastName:'Usta'})).status,201);
    h.record('parallel_resend_rollback_barber','PASS');
  });
  await t.test('parallel signup preserves a single phone/session without unique conflict',async()=>{
    const phone='+998900000003';
    const results=await Promise.all([start(phone),start(phone),start(phone)]);
    assert.ok(results.every(r=>r.status===201));
    const current=await row(phone);
    assert.equal((await h.admin.query('SELECT count(*)::int n FROM pending_registrations WHERE phone=$1',[phone])).rows[0].n,1);
    const {sessionHash}=require('../utils/registration');
    for(const result of results) {
      if(sessionHash(result.body.sessionToken)===current.session_token_hash) assert.equal((await service.status(session(result))).status,200);
      else await assert.rejects(service.status(session(result)),{code:'invalid_session'});
    }
    h.record('parallel_phone_unique','PASS');
  });
  await t.test('Telegram booking accept/reject/notification regression on the same disposable PostgreSQL',async()=>{
    await h.admin.query('CREATE ROLE ustara_account_test LOGIN NOSUPERUSER');
    await h.admin.query('GRANT USAGE ON SCHEMA public TO ustara_account_test');
    await h.admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ustara_account_test');
    await h.admin.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ustara_account_test');
    const url=`postgresql://ustara_account_test@localhost:${h.report.port}/ustara_test_db?host=${encodeURIComponent(h.report.socket)}`;
    const output=path.join(h.root,'telegram-bookings.log');
    const code=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['test/telegram-bookings.postgres.integration.test.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'test',USTARA_TELEGRAM_AUTH_TESTS:'I_AUTHORIZE_TEST_DATA',USTARA_TEST_DATABASE_URL:url},stdio:['ignore',fs.openSync(output,'w'),fs.openSync(output,'a')]});
      child.on('error',reject);child.on('exit',resolve);
    });
    assert.equal(code,0,'Telegram booking regression: '+output);
    h.record('telegram_booking_regression','PASS');
  });
});
