'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers,publicOrigin}=require('../controllers/walkinQrController');
const {createQueueTelegramService}=require('../services/queueTelegramNotifications');
const token='a'.repeat(48),receipt='b'.repeat(32),actor={role:'barber',id:91,profileId:7};
const rows=(...items)=>({rows:items,rowCount:items.length});
function harness({freshToken=true,finalized=true,statusRow=null}={}){
 const calls=[];
 const client={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('FROM walkin_qr_tokens')&&sql.includes('FOR UPDATE'))return rows({id:9,barber_id:7,used_at:null,token_live:true});
  if(sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return rows({token_live:freshToken});
  if(sql.includes('WHERE qr_token_id=$1'))return rows();
  if(sql.includes('SELECT b.id FROM barbers'))return rows({id:7});
  if(sql.includes('AS open_now'))return rows({open_now:true});
  if(sql.includes('count(*)::int AS total'))return rows({total:0});
  if(sql.includes('INSERT INTO walkin_qr_requests'))return rows({id:11});
  if(sql.includes('FROM walkin_qr_requests WHERE id=$1')&&sql.includes('FOR UPDATE'))
   return rows({id:11,barber_id:7,request_key:receipt,display_label:'Mehmon',status:'pending',pending_live:true});
  if(sql.includes('INSERT INTO walkin_queue('))return rows({id:112});
  if(sql.includes('UPDATE walkin_qr_requests SET status='))return finalized?rows({id:11}):rows();
  return rows();
 },release(){calls.push({sql:'RELEASE'});}};
 const db={connect:async()=>client,query:async(sql,args=[])=>{calls.push({sql,args});return statusRow?rows(statusRow):rows();}};
 const h=createHandlers(db);
 async function run(name,body,params={}){
  const output={status:200};
  const res={set(){return this;},status(code){output.status=code;return this;},json(data){output.body=data;return this;}};
  await h[name]({body,params,user:actor,headers:{}},res);
  return output;
 }
 return {run,calls};
}
test('v51/1 QR token expiring during barber advisory-lock wait cannot join',async()=>{
 const h=harness({freshToken:false});
 const res=await h.run('requestJoin',{token,request_id:receipt,label:'Mehmon'});
 assert.equal(res.status,410);
 const lock=h.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 const fresh=h.calls.findIndex(x=>x.sql.includes('FROM walkin_qr_tokens WHERE id=$1'));
 assert.ok(fresh>lock);
 assert.equal(h.calls.some(x=>x.sql.includes('INSERT INTO walkin_qr_requests')),false);
 assert.ok(h.calls.some(x=>x.sql==='ROLLBACK'));
});
test('v51/2 decision expiry at final write rolls back queue/audit inserts',async()=>{
 const h=harness({finalized:false});
 const res=await h.run('decide',{decision:'approve'},{id:'11'});
 assert.equal(res.status,410);
 assert.equal(res.body.code,'request_expired');
 assert.ok(h.calls.some(x=>x.sql.includes('INSERT INTO walkin_queue(')));
 const guard=h.calls.find(x=>x.sql.includes('UPDATE walkin_qr_requests SET status='));
 assert.match(guard.sql,/created_at>clock_timestamp\(\)-interval '30 minutes'/);
 assert.match(guard.sql,/RETURNING id/);
 assert.equal(h.calls.some(x=>x.sql==='COMMIT'),false);
 assert.ok(h.calls.some(x=>x.sql==='ROLLBACK'));
});
test('v51/3 yesterday waiting ticket does not expose current waiting or Telegram status',async()=>{
 const h=harness({statusRow:{status:'approved',queue_status:'waiting',queue_today:false,
  position:3,telegram_linked:true,offers_enabled:true,offer_id:7,offer_upcoming:true,
  offer_live:true,offer_status:'pending'}});
 const result=await h.run('requestStatus',{token,request_id:receipt});
 assert.equal(result.status,200);
 assert.deepEqual(result.body,{status:'approved',queue_status:null,position:null,
  estimated_wait:null,telegram_linked:false,offers_enabled:false,smart_offer:null});
});
test('v51/4 offer opt-in is idempotent: repeated true retains prior consent epoch',async()=>{
 const calls=[],epoch='2026-11-19T07:00:00Z';let current=epoch;
 const client={async query(sql,args=[]){calls.push({sql,args});
  if(sql.includes('FROM walkin_qr_requests r')&&sql.includes('JOIN walkin_qr_tokens t'))return rows({id:12,barber_id:7});
  if(sql.includes('SELECT status,queue_date FROM walkin_queue'))return rows({status:'waiting'});
  if(sql.includes('FOR SHARE OF r'))return rows({id:12});
  if(sql.includes('UPDATE walkin_queue_telegram_subscriptions')){
   // Preserve previous epoch on repeated enable; revoke resets it.
   assert.match(sql,/COALESCE\(offers_consent_at,clock_timestamp\(\)\)/);
   current=args[1]?(current||'2026-11-19T08:00:00Z'):null;
   return rows({entry_id:12});
  }
  return rows();
 },release(){}};
 const service=createQueueTelegramService({pool:{connect:async()=>client}});
 await service.offerConsent(token,receipt,true);
 assert.equal(current,epoch);
 await service.offerConsent(token,receipt,true);
 assert.equal(current,epoch);
 await service.offerConsent(token,receipt,false);
 assert.equal(current,null);
 await service.offerConsent(token,receipt,true);
 assert.notEqual(current,epoch);
});
test('v51/5 configured CORS allowlist prevents QR links to foreign HTTPS hosts in staging',()=>{
 const previousAllow=process.env.CORS_ALLOWED_ORIGINS,previousMode=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='test';process.env.CORS_ALLOWED_ORIGINS='https://ustara.uz,https://app.ustara.uz';
  assert.equal(publicOrigin({headers:{origin:'https://ustara.uz'}},'https://ustara.uz'),'https://ustara.uz');
  assert.throws(()=>publicOrigin({headers:{origin:'https://evil.example'}},'https://evil.example'),{code:'origin_not_allowed'});
  process.env.NODE_ENV='production';process.env.CORS_ALLOWED_ORIGINS='';
  assert.throws(()=>publicOrigin({headers:{origin:'https://ustara.uz'}},'https://ustara.uz'),{code:'origin_not_allowed'});
 }finally{
  if(previousAllow===undefined)delete process.env.CORS_ALLOWED_ORIGINS;else process.env.CORS_ALLOWED_ORIGINS=previousAllow;
  if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;
 }
});
