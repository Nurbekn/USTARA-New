'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { validateWebhookConfig, configureWebhook } = require('../scripts/configure-telegram-webhook.cjs');
const env = {
  NODE_ENV: 'production', TELEGRAM_UPDATE_MODE: 'webhook',
  TELEGRAM_BOT_TOKEN: '12345:' + 'x'.repeat(30),
  TELEGRAM_BOT_USERNAME: 'ustara_test_bot',
  TELEGRAM_WEBHOOK_SECRET: 's'.repeat(42),
};
const dest = 'https://ustara-demo.onrender.com/api/auth/telegram/webhook';

test('v222 operator webhook validation rejects invalid URLs and incomplete mode/secrets', () => {
  assert.equal(validateWebhookConfig(env, dest), dest);
  for (const bad of ['http://ustara-demo.onrender.com/api/auth/telegram/webhook',
    'https://localhost/api/auth/telegram/webhook',
    'https://127.0.0.1/api/auth/telegram/webhook',
    'https://ustara-demo.onrender.com/other',
    'https://ustara-demo.onrender.com/api/auth/telegram/webhook?secret=oops',
    'https://user:password@ustara-demo.onrender.com/api/auth/telegram/webhook',
    'https://ustara-demo.onrender.com:8443/api/auth/telegram/webhook']) {
    assert.throws(() => validateWebhookConfig(env, bad));
  }
  assert.throws(() => validateWebhookConfig({...env,TELEGRAM_WEBHOOK_SECRET:'short'},dest));
  assert.throws(() => validateWebhookConfig({...env,TELEGRAM_UPDATE_MODE:'polling'},dest));
  assert.throws(() => validateWebhookConfig({...env,NODE_ENV:'development'},dest));
  assert.throws(() => validateWebhookConfig({...env,TELEGRAM_BOT_TOKEN:''},dest));
});

test('v222 webhook setup sends only deliberate update types without dropping pending updates', async () => {
  let invoked = 0;
  const success = await configureWebhook({env, webhookUrl:dest, fetchImpl: async (url, opts) => {
    invoked++;
    assert.equal(url, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`);
    assert.equal(opts.method,'POST');
    assert.equal(opts.redirect,'error');
    const data=JSON.parse(opts.body);
    assert.deepEqual(data,{url:dest,secret_token:env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates:['message','callback_query'],max_connections:1,drop_pending_updates:false});
    return {ok:true,async json(){return {ok:true,result:true};}};
  }});
  assert.equal(success,true);assert.equal(invoked,1);
  await assert.rejects(configureWebhook({env,webhookUrl:dest,fetchImpl:async()=>{
    throw Error('BOT_SECRET_URL ' + env.TELEGRAM_BOT_TOKEN);
  }}), error => !error.message.includes(env.TELEGRAM_BOT_TOKEN));
  await assert.rejects(configureWebhook({env,webhookUrl:dest,fetchImpl:async()=>({ok:true,
    async json(){return {ok:false,description:'secret '+env.TELEGRAM_WEBHOOK_SECRET};}})}),
    error => !error.message.includes(env.TELEGRAM_WEBHOOK_SECRET));
});

test('v222 Telegram polling worker actually constructs customer link service (without pg/network)', async () => {
  const workerFile = path.join(__dirname,'../telegram/worker.js');
  const source = fs.readFileSync(workerFile,'utf8');
  const customerLink = {kind:'customer-link-runtime'};
  let actualHandlerConfig = null;
  const mock = new Map();
  mock.set('pg',{Pool:class {}});
  const factory = name => { mock.set(name, Object.fromEntries([['createPhoneChangeService',() => ({})],
    ['createRegistrationService',() => ({deliverTelegram:async()=>{}})],
    ['createTelegramRegistration',() => ({})],
    ['createTelegramContacts',() => ({})],
    ['createOtpRateLimit',() => ({})],
    ['createBookingStatusService',() => ({})],
    ['createSmartBookingOffers',() => ({})],
    ['createQueueTelegramService',() => ({})],
    ['createTelegramLinkService',() => ({})],
    ['createCustomerTelegramLink',() => customerLink]].filter(([k])=>k.startsWith('create'))));};
  for(const name of ['../services/phoneChangeService','../services/registrationService',
    '../services/telegramRegistration','../services/telegramOtp','../services/otpRateLimit',
    '../services/bookingStatusService','../services/smartBookingOffers',
    '../services/queueTelegramNotifications','../services/telegramLinkService',
    '../services/customerTelegramLinkV190']) factory(name);
  mock.set('../database/poolConfig',{createPoolConfig:()=>({})});
  mock.set('./api',{createTelegramApi:()=>{},TelegramApiError:class extends Error {}});
  mock.set('./pollingRetry',{pauseAfterTelegramError:async()=>{},pollingRetryDelaySeconds:()=>1});
  mock.set('./handler',{createUpdateHandler:config=>{actualHandlerConfig=config;return async()=>{};}});
  mock.set('../services/telegramLinkService',{...mock.get('../services/telegramLinkService'),botConfig:()=>({})});
  mock.set('../services/phoneChangeService',{createPhoneChangeService:()=>({flushNotices:async()=>{}})});
  const moduleObj={exports:{}};
  vm.runInNewContext(source, {
    require: name => name.startsWith('node:') ? require(name) : (mock.has(name) ? mock.get(name) : (() => {throw Error('Unexpected import '+name);})()),
    module:moduleObj,process:{env:{}},console,AbortController,AbortSignal,setTimeout,clearTimeout,
  }, {filename:workerFile});
  let released=false;
  const client=Object.assign(new EventEmitter(),{
    async query(sql){
      if(sql.includes('pg_try_advisory_lock'))return {rows:[{acquired:true}]};
      if(sql.startsWith('SELECT next_update_id'))return {rows:[{next_update_id:0}]};
      return {rows:[]};
    },release(destroy){assert.equal(destroy,true);released=true;},
  });
  const controller=new AbortController();controller.abort();
  const worked=await moduleObj.exports.runWorker({pool:{connect:async()=>client},
    env:{...env,TELEGRAM_UPDATE_MODE:'polling'},signal:controller.signal,api:async method=>{
      if(method==='getMe')return {id:12345,is_bot:true,username:env.TELEGRAM_BOT_USERNAME};
      if(method==='getWebhookInfo')return {url:''};
      assert.fail('No updates should be fetched after abort');
    }});
  assert.equal(worked,true);assert.equal(released,true);
  assert.equal(actualHandlerConfig.customerTelegram,customerLink);
});
