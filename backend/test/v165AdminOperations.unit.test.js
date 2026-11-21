'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHandlers}=require('../controllers/adminOpsReadOnlyV165');
const {parseRollout,enabledForAdmin}=require('../services/opsReadOnlyFlagsV165');
function res(){return {statusCode:200,headers:{},body:null,set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
const healthy=()=>({summary:{queue:{pending:{total:1,due:0,overdue_pending:0,stale_lease:0}},smart_booking:{}},attention:[],action:'Manual review'});
async function call(kind,{role='admin',id=12,rollout='100',audit=healthy}={}){
 const database={query:async()=>{throw Error('unexpected SQL access');}};
 const handlers=createHandlers(database,{getEnv:()=>({USTARA_ADMIN_READONLY_ROLLOUT:rollout}),auditOutbox:audit,
  clock:()=>new Date('2026-11-21T12:00:00.000Z')});
 const reply=res();await handlers[kind]({user:role?{role,id}:null},reply);return reply;
}
test('v165 #73 rollout percentages are strict and stable across servers',()=>{
 assert.equal(parseRollout(undefined),100);
 for(const val of ['-1','101','1.0','25%',' 100','001','NaN','abc'])assert.equal(parseRollout(val),0);
 assert.equal(enabledForAdmin(1,{USTARA_ADMIN_READONLY_ROLLOUT:'0'}),false);
 assert.equal(enabledForAdmin(1,{USTARA_ADMIN_READONLY_ROLLOUT:'100'}),true);
 assert.equal(enabledForAdmin(-1,{USTARA_ADMIN_READONLY_ROLLOUT:'100'}),false);
 for(const id of [1,2,5,95])assert.equal(enabledForAdmin(id,{USTARA_ADMIN_READONLY_ROLLOUT:'25',USTARA_ADMIN_ROLLOUT_SEED:'abc'}),enabledForAdmin(id,{USTARA_ADMIN_READONLY_ROLLOUT:'25',USTARA_ADMIN_ROLLOUT_SEED:'abc'}));
});
test('v165 #67 #68 only active Admin can read; non-admin receives 403, disabled 404',async()=>{
 for(const kind of ['system','telegramOutbox']){
  for(const role of ['customer','barber',null]){
   const r=await call(kind,{role});assert.equal(r.statusCode,403);assert.equal(r.headers['Cache-Control'],'no-store');
  }
  const disabled=await call(kind,{rollout:'0'});assert.equal(disabled.statusCode,404);
 }
});
test('v165 #67 Telegram read is sanitized, bounded status only, no sending or mutation',async()=>{
 const a=await call('telegramOutbox');assert.equal(a.statusCode,200);
 assert.deepEqual(a.body.telegramDelivery.summary,healthy().summary);
 assert.equal(a.body.automaticResend,false);
 assert.equal(a.body.status,'ok');
 assert.equal(a.body.checkedAt,'2026-11-21T12:00:00.000Z');
 assert.equal(a.headers['Cache-Control'],'no-store');
 const src=fs.readFileSync(require.resolve('../controllers/adminOpsReadOnlyV165'),'utf8');
 assert.doesNotMatch(src,/\.query\(\s*['"`]\s*(?:UPDATE|DELETE|INSERT)/i);
});
test('v165 #68 #70 System shows DB proof and operator alerts without operational controls',async()=>{
 const audit=async()=>({...healthy(),attention:[{channel:'smart_booking',status:'uncertain',count:2,overdue_pending:0,stale_lease:0}]});
 const a=await call('system',{audit});assert.equal(a.statusCode,200);
 assert.equal(a.body.status,'attention');assert.equal(a.body.monitoring.alertCount,1);
 assert.equal(a.body.database.status,'reachable');
 assert.equal(a.body.automatedRollback,false);
 assert.equal(a.body.automaticResend,false);
 assert.ok(!JSON.stringify(a.body).match(/bot_token|chat_id|password|webhook_url/i));
});
test('v165 missing migration / DB timeout fails closed to unknown, not green and never leaks exception',async()=>{
 for(const kind of ['system','telegramOutbox']){
  const r=await call(kind,{audit:async()=>{throw new Error('secret credential or telegram token');}});
  assert.equal(r.statusCode,503);assert.equal(r.body.status,'unknown');
  assert.equal(r.headers['Cache-Control'],'no-store');
  assert.ok(!JSON.stringify(r.body).includes('secret'));
 }
});
test('v165 aggregate SQL is bounded and read only on the actual default audit path',async()=>{
 const calls=[];
 const db={query:async config=>{calls.push(config);return {rows:[]};}};
 const handler=createHandlers(db,{getEnv:()=>({USTARA_ADMIN_READONLY_ROLLOUT:'100'})});
 const reply=res();await handler.system({user:{role:'admin',id:19}},reply);
 assert.equal(reply.statusCode,200);
 assert.equal(reply.body.database.status,'reachable');
 assert.equal(calls.length,1);
 assert.equal(calls[0].query_timeout,5000);
 assert.equal(calls[0].statement_timeout,5000);
 assert.match(calls[0].text,/SELECT.*queue/s);
 assert.doesNotMatch(calls[0].text,/(?:UPDATE|DELETE|INSERT)\s+[a-z_]+/i);
});
test('v165 routing requires auth, Admin role and handler own guard',()=>{
 const source=fs.readFileSync(require.resolve('../routes/admin'), 'utf8');
 assert.match(source,/router\.get\('\/telegram\/outbox',authMiddleware,ops\.adminOnly,opsReadOnlyV165\.telegramOutbox\)/);
 assert.match(source,/router\.get\('\/system\/readiness',authMiddleware,ops\.adminOnly,opsReadOnlyV165\.system\)/);
});
