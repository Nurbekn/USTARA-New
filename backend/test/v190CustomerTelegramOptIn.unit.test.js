'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {createCustomerTelegramLink,CustomerTelegramError}=require('../services/customerTelegramLinkV190');
const {createHandlers}=require('../controllers/customerTelegramV190');
const {createUpdateHandler}=require('../telegram/handler');
const env={TELEGRAM_BOT_USERNAME:'ustara_test_bot'};
const actor={role:'customer',id:11,profileId:21,sessionVersion:3};
function fixture(opts={}){
 const data={linked:false,chat:null,tokenHash:null,version:3,valid:true,prefs:false,duplicateChat:false,expired:false,suspended:false,...opts};
 const calls=[];let botCount=0;
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql==='COMMIT')return {command:data.commitCommand||'COMMIT'};
  if(sql.includes('JOIN customers p') && sql.includes('FOR SHARE'))return {rowCount:data.suspended?0:1,rows:data.suspended?[]:[{id:11}]};
  if(sql.includes('account_session_versions'))return {rowCount:1,rows:[{version:data.version}]};
  if(sql.includes('customer_telegram_links WHERE user_id=$1') && sql.includes('SELECT 1'))return {rowCount:data.linked?1:0,rows:data.linked?[{user_id:11}]:[]};
  if(sql.includes('INSERT INTO customer_telegram_link_tokens')){
   data.tokenHash=args[1];data.valid=true;return {rowCount:1,rows:[]};
  }
  if(sql.includes('SELECT linked_at,notification_opt_in_at'))return {rowCount:data.linked?1:0,rows:data.linked?[{linked_at:'2026-11-21T00:00:00Z',notification_opt_in_at:data.prefs?'2026-11-21T00:00:00Z':null}]:[]};
  if(sql.includes('DELETE FROM customer_telegram_link_tokens')){data.tokenHash=null;return {rowCount:1,rows:[]};}
  if(sql.includes('DELETE FROM customer_telegram_links')){data.linked=false;data.prefs=false;return {rowCount:1,rows:[]};}
  if(sql.includes('UPDATE customer_telegram_links SET')){
   if(!data.linked)return {rowCount:0,rows:[]};
   data.prefs=args[1];return {rowCount:1,rows:[{notification_opt_in_at:data.prefs?'date':null}]};
  }
  if(sql.includes('SELECT user_id FROM customer_telegram_link_tokens'))return {rowCount:data.valid&&!data.expired&&args[0]===data.tokenHash?1:0,rows:[{user_id:11}]};
  if(sql.includes('SELECT session_version FROM customer_telegram_link_tokens'))return {rowCount:data.valid&&!data.expired?1:0,rows:[{session_version:3}]};
  if(sql.includes('AS taken'))return {rowCount:1,rows:[{taken:data.duplicateChat}]};
  if(sql.includes('INSERT INTO customer_telegram_links')){if(data.linked)return {rowCount:0,rows:[]};data.linked=true;data.chat=args[1];return {rowCount:1,rows:[{user_id:11}]};}
  return {rowCount:0,rows:[]};
 };
 const client={query,release() {botCount++;}};
 return {pool:{connect:async()=>client,query},data,calls,get releases(){return botCount;},service:createCustomerTelegramLink({pool:{connect:async()=>client,query},env})};
}
function tokenFrom(link){const parsed=new URL(link);assert.equal(parsed.hostname,'t.me');const token=parsed.searchParams.get('start');assert.match(token,/^cust_[0-9a-f]{48}$/);return token;}
test('v190 explicit customer consent: fresh token is 192-bit and only SHA hash stored',async()=>{
 const f=fixture();const value=await f.service.start(actor);const token=tokenFrom(value.deepLink);
 assert.equal(value.expiresInSeconds,300);assert.equal(token.length,53);
 assert.equal(f.data.tokenHash,crypto.createHash('sha256').update(token.slice(5)).digest('hex'));
 assert.doesNotMatch(JSON.stringify(f.calls),new RegExp(token.slice(5)));
 assert.ok(f.calls.some(c=>c.sql==='COMMIT'));
});
test('v190 rejects all non-customer actors and revoked session versions',async()=>{
 for(const who of [{...actor,role:'barber'},{...actor,role:'admin'},{...actor,profileId:0}]){
  const f=fixture();await assert.rejects(f.service.start(who),{status:403});
 }
 const old=fixture({version:4});await assert.rejects(old.service.start(actor),{status:401});
 const suspended=fixture({suspended:true});await assert.rejects(suspended.service.start(actor),{status:401});
});
test('v190 webhook transaction SAVEPOINT success is not mistaken for a failed COMMIT',async()=>{
 const nested=fixture({commitCommand:'RELEASE'});
 const link=await nested.service.start(actor);
 assert.equal(tokenFrom(link.deepLink).length,53);
 const broken=fixture({commitCommand:'ROLLBACK'});
 await assert.rejects(broken.service.start(actor),/Unconfirmed transaction/);
});
test('v190 one-time private bot link does not enable notifications or send messages',async()=>{
 const f=fixture();const token=tokenFrom((await f.service.start(actor)).deepLink);
 assert.deepEqual(await f.service.consume(token,333),{linked:true,notificationsEnabled:false});
 assert.equal(f.data.chat,'333');assert.equal(f.data.prefs,false);assert.equal(f.data.tokenHash,null);
 assert.equal((await f.service.status(actor)).notificationsEnabled,false);
 await assert.rejects(f.service.consume(token,333),{code:'expired_link'});
 assert.ok(!f.calls.some(c=>/sendMessage|INSERT INTO bookings|UPDATE bookings/.test(c.sql)));
});
test('v190 link is refused on cross-account Telegram chat or expired token',async()=>{
 const clash=fixture({duplicateChat:true});const t1=tokenFrom((await clash.service.start(actor)).deepLink);
 await assert.rejects(clash.service.consume(t1,999),{code:'chat_already_used'});assert.equal(clash.data.linked,false);
 const exp=fixture();const t2=tokenFrom((await exp.service.start(actor)).deepLink);exp.data.expired=true;
 await assert.rejects(exp.service.consume(t2,999),{code:'expired_link'});
});
test('v190 stale session revocation invalidates a previously issued link',async()=>{
 const f=fixture();const token=tokenFrom((await f.service.start(actor)).deepLink);f.data.version=4;
 await assert.rejects(f.service.consume(token,555),{code:'expired_link'});assert.equal(f.data.linked,false);
});
test('v190 invalid tokens and unsafe Telegram identities are refused',async()=>{
 const f=fixture();for(const param of ['cust_'+ 'x'.repeat(48),'cust_'+ 'a'.repeat(49),'barber_'+'a'.repeat(48)]){
  await assert.rejects(f.service.consume(param,7),{code:'invalid_link'});
 }
 await assert.rejects(f.service.consume('cust_'+'a'.repeat(48),-99),{code:'invalid_link'});
});
test('v190 permissions need explicit opt-in, revocation and unlink revoke it',async()=>{
 const f=fixture({linked:true});
 for(const bad of [null,[],{}, {notificationsEnabled:'true'}, {notificationsEnabled:true,chatId:'fake'}]){
  await assert.rejects(f.service.preferences(actor,bad),{code:'invalid_preference'});
 }
 assert.deepEqual(await f.service.preferences(actor,{notificationsEnabled:true}),{linked:true,notificationsEnabled:true});
 assert.deepEqual(await f.service.preferences(actor,{notificationsEnabled:false}),{linked:true,notificationsEnabled:false});
 await f.service.preferences(actor,{notificationsEnabled:true});await f.service.unlink(actor);
 assert.equal(f.data.prefs,false);assert.equal(f.data.linked,false);
 await assert.rejects(f.service.preferences(actor,{notificationsEnabled:true}),{code:'not_linked'});
});
test('v190 bot dispatch accepts /start cust_ only in a private identity-matched chat',async()=>{
 const f=fixture();const token=tokenFrom((await f.service.start(actor)).deepLink);const sent=[];
 const handler=createUpdateHandler({customerTelegram:f.service,service:{consume(){throw Error('barber link must not run');}},
  username:env.TELEGRAM_BOT_USERNAME,api:async(_,body)=>sent.push(body)});
 await handler({message:{text:'/start '+token,chat:{type:'group',id:-4},from:{id:4,is_bot:false}}});
 await handler({message:{text:'/start '+token,chat:{type:'private',id:333},from:{id:44,is_bot:false}}});
 assert.equal(sent.length,0);assert.equal(f.data.linked,false);
 await handler({message:{text:'/start '+token,chat:{type:'private',id:333},from:{id:333,is_bot:false}}});
 assert.equal(f.data.linked,true);assert.match(sent[0].text,/rozilikni saytdan/);assert.equal(sent[0].protect_content,true);
});
test('v190 HTTP controller refuses incorrect roles and does not expose chat identity',async()=>{
 const f=fixture();const handlers=createHandlers(f.service);
 const res=()=>({statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.statusCode=v;return this;},json(v){this.data=v;return this;}});
 const bad=res();await handlers.status({user:{role:'barber'}},bad);
 assert.equal(bad.statusCode,403);assert.equal(f.calls.length,0);
 const good=res();await handlers.status({user:actor},good);
 assert.equal(good.data.linked,false);assert.equal(good.headers['Cache-Control'],'no-store');
 assert.ok(!('chatId' in good.data));
});
test('v190 wiring, migration, no auto-send or OTP consent inheritance',()=>{
 const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 for(const path of ['telegram/webhook.js','telegram/worker.js'])assert.match(read(path),/customerTelegram:\s*createCustomerTelegramLink/);
 assert.match(read('routes/customers.js'),/\/telegram\/preferences/);
 assert.match(read('database/bootstrap.sql'),/20270102_customer_telegram_opt_in/);
 assert.match(read('database/bootstrap/verify.sql'),/customer_telegram_link_tokens/);
 const sql=read('database/migrations/20270102_customer_telegram_opt_in.sql');
 assert.match(sql,/notification_opt_in_at/);assert.match(sql,/token_hash TEXT NOT NULL UNIQUE/);
 assert.doesNotMatch(sql,/INSERT INTO customer_telegram_links\s+SELECT|INSERT INTO customer_telegram_links.*telegram_otp_contacts/);
 assert.match(read('../frontend/src/pages/user/Profile.jsx'),/CustomerTelegramV190/);
});
