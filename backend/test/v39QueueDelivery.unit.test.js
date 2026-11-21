'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createQueueTelegramDispatcher}=require('../services/queueTelegramNotifications');
const {TelegramApiError}=require('../telegram/api');
const {readBootstrapPlan}=require('../scripts/bootstrap-plan');
const rows=items=>({rows:items,rowCount:items.length});
function fixture({active=true,attempts=1,send=async()=>({message_id:88,chat:{id:123466}}),job=true}={}){
 const calls=[],messages=[];
 const pool={async query(sql,args=[]){calls.push({sql,args});
  if(sql.includes('RETURNING o.id,o.entry_id,o.chat_id,o.attempts'))
   return rows(job?[{id:9,entry_id:42,chat_id:'123466',attempts}]:[]);
  if(sql.includes('SELECT 1 FROM walkin_queue_notification_outbox o'))return rows(active?[{ok:1}]:[]);
  return rows([]);
 }};
 const worker=createQueueTelegramDispatcher({pool,api:async(...args)=>{messages.push(args);return send(...args);}});
 return {worker,calls,messages};
}
function updateState(f){return f.calls.find(x=>x.sql.includes('SET status=$3,')&&x.sql.includes('next_attempt_at='));}
test('v39: unknown 5xx, timeout and transport errors are quarantined, not automatically retried',async()=>{
 for(const err of [new TelegramApiError(500),new TelegramApiError('transport'),new Error('timeout')]){
  const f=fixture({send:async()=>{throw err;}});assert.equal(await f.worker.step(),true);
  assert.equal(updateState(f).args[2],'uncertain');
  assert.ok(!f.calls.some(x=>x.sql.includes("status='sent',sent_at=")));
 }
});
test('v39: malformed response or wrong Telegram chat cannot be acknowledged as sent',async()=>{
 for(const payload of [null,{}, {message_id:99},{message_id:99,chat:{id:999}},
  {message_id:0,chat:{id:123466}}]){
  const f=fixture({send:async()=>payload});await f.worker.step();
  assert.equal(updateState(f).args[2],'uncertain');
  assert.equal(f.calls.some(x=>x.sql.includes("status='sent',sent_at=")),false);
 }
});
test('v39: verified Telegram message ACK is fenced by job id, UUID lease owner and processing state',async()=>{
 const f=fixture();assert.equal(await f.worker.step(),true);
 const sent=f.calls.find(x=>x.sql.includes("status='sent',sent_at="));
 assert.ok(sent);assert.equal(sent.args[0],9);assert.match(sent.args[1],/^[0-9a-f-]{36}$/);
 assert.equal(sent.args[2],88);assert.match(sent.sql,/lease_owner=\$2::uuid AND status='processing'/);
 assert.equal(f.messages[0][1].protect_content,true);
 assert.doesNotMatch(f.messages[0][1].text,/token|visitor name|password/i);
});
test('v39: only known Telegram 429 rejection retries, with attempt budget and bounded backoff',async()=>{
 const f=fixture({attempts:3,send:async()=>{throw new TelegramApiError(429,35);}});
 await f.worker.step();assert.equal(updateState(f).args[2],'pending');assert.equal(updateState(f).args[3],35);
 const final=fixture({attempts:6,send:async()=>{throw new TelegramApiError(429,50);}});
 await final.worker.step();assert.equal(updateState(final).args[2],'failed');
 const blocked=fixture({send:async()=>{throw new TelegramApiError(403);}});
 await blocked.worker.step();assert.equal(updateState(blocked).args[2],'failed');
});
test('v39: crashed processing lease becomes uncertain and is never selected for automatic replay',async()=>{
 const f=fixture({job:false});assert.equal(await f.worker.step(),false);
 assert.match(f.calls[0].sql,/status='uncertain'/);
 assert.match(f.calls[0].sql,/status='processing' AND \(lease_until IS NULL OR lease_until<clock_timestamp\(\)\)/);
 const claim=f.calls.find(x=>x.sql.includes('FOR UPDATE OF o SKIP LOCKED'));
 assert.ok(claim);assert.match(claim.sql,/WHERE o.status='pending'/);
 assert.doesNotMatch(claim.sql,/OR \(o.status='processing'/);
});
test('v39: stale tickets, withdrawn consent, and exhausted pending jobs are cleaned before selection',async()=>{
 const f=fixture({active:false});await f.worker.step();
 const repair=f.calls.find(x=>x.sql.includes("status='pending' AND attempts>=6"));
 const stale=f.calls.find(x=>x.sql.includes('AND NOT EXISTS ('));
 const select=f.calls.find(x=>x.sql.includes('FOR UPDATE OF o SKIP LOCKED'));
 assert.ok(repair&&stale&&select);
 assert.match(stale.sql,/q.status='called'/);
 assert.match(stale.sql,/walkin_queue_telegram_subscriptions s/);
 assert.ok(f.calls.indexOf(repair)<f.calls.indexOf(select));
 assert.ok(f.calls.indexOf(stale)<f.calls.indexOf(select));
 assert.equal(f.messages.length,0);
 assert.ok(f.calls.some(x=>x.sql.includes('lease_owner=$4::uuid AND o.status=\'processing\'')));
});
test('v39: forward migration expands exact status whitelist with no automatic data rewrite',()=>{
 const root=path.resolve(__dirname,'../database');
 const sql=fs.readFileSync(path.join(root,'migrations/20261213_queue_delivery_uncertain.sql'),'utf8');
 const verify=fs.readFileSync(path.join(root,'bootstrap/verify.sql'),'utf8');
 const plan=readBootstrapPlan();
 assert.equal(plan.filter(x=>x.file.startsWith('migrations/')).length,63);
 // Pin the relative history, not fixed end offsets: newer additive migrations are allowed.
 const history=[
  'migrations/20261213_queue_delivery_uncertain.sql',
  'migrations/20261214_walkin_service_started.sql',
  'migrations/20261215_walkin_arrived.sql',
  'migrations/20261216_safe_day_close.sql',
  'migrations/20261217_profile_issue_reports.sql',
 ];
 const names=plan.map(step=>step.file);
 const first=names.indexOf(history[0]);
 assert.ok(first>=0, 'v39 migration present');
 assert.deepEqual(names.slice(first,first+history.length),history);
 assert.equal(plan.at(-1).file,'bootstrap/verify.sql');
 assert.match(sql,/DROP CONSTRAINT walkin_queue_notification_outbox_status_check/);
 assert.match(sql,/status IN \('pending','processing','sent','failed','cancelled','uncertain'\)/);
 assert.match(verify,/queue Telegram uncertain-delivery constraint missing/);
 assert.doesNotMatch(sql,/\bDELETE FROM\b|\bUPDATE (?:walkin_queue|bookings|walkin_queue_notification_outbox)\b/i);
});
