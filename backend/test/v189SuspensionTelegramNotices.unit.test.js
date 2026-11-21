'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {noticeIntent,createHandlers}=require('../controllers/adminSuspensionTelegramNoticesV189');
const {createDispatcher,noticeText}=require('../services/suspensionTelegramDispatcherV189');
function response(){return {statusCode:200,headers:{},payload:null,set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(p){this.payload=p;return this;}};}
function operatorDb({admin=true,revision=2,caseStatus='reviewed',role='customer',linked=true,accountSuspended=true,barberSuspended=false,future=true,booking='confirmed',duplicate=false,failOn=''}={}){
 const calls=[];let released=false;
 const query=async(sql,args=[])=>{
  calls.push({sql,args});if(failOn&&sql.includes(failOn))throw Error('sensitive db error');
  if(sql.includes('FROM admin_accounts'))return {rowCount:admin?1:0,rows:admin?[{id:1}]:[]};
  if(sql.includes('FROM admin_suspension_booking_cases c'))return {rowCount:1,rows:[{id:7,revision,status:caseStatus,suspended_role:role,admin_suspended_at:accountSuspended?'now':null,barber_suspended_at:barberSuspended?'now':null,barber_deactivated_at:null,barber_linked:linked,booking_future:future,booking_status:booking}]};
  if(sql.includes('INSERT INTO admin_suspension_telegram_notices'))return {rowCount:duplicate?0:1,rows:duplicate?[]:[{id:3,status:'queued'}]};
  return {rowCount:1,rows:[]};
 };
 return {query,connect:async()=>({query,release(){released=true;}}),calls,get released(){return released;}};
}
async function request(db,body={expectedRevision:2},user={id:1,role:'admin'},caseId='7'){
 const res=response();await createHandlers(db).request({user,body,params:{id:caseId}},res);return res;
}
function workerDb({queued=true,eligible=true,linked=true,failOn=''}={}){
 const calls=[];let released=false;
 const query=async(sql,args=[])=>{
  calls.push({sql,args});if(failOn&&sql.includes(failOn))throw Error('DB unavailable');
  if(sql.includes("WHERE status='queued' ORDER BY id"))return {rowCount:queued?1:0,rows:queued?[{id:31,case_id:7}]:[]};
  if(sql.includes('FROM admin_suspension_booking_cases c'))return {rowCount:eligible?1:0,rows:eligible?[{case_status:'reviewed',booking_id:14,booking_status:'confirmed',booking_future:true,suspended_role:'customer',admin_suspended_at:'2026-11-20',barber_suspended_at:null,barber_deactivated_at:null,chat_id:linked?'777':null}]:[]};
  return {rowCount:1,rows:[]};
 };
 return {query,connect:async()=>({query,release(){released=true;}}),calls,get released(){return released;}};
}
test('v189: strict expected revision and route identifier validation',async()=>{
 for(const b of [null,[],{expectedRevision:'2'},{expectedRevision:-1},{expectedRevision:2,action:'send'},{expectedRevision:1.1}])assert.equal(noticeIntent(b),null);
 assert.deepEqual(noticeIntent({expectedRevision:2}),{expectedRevision:2});
 for(const id of ['0','abc','-1','7/8'])assert.equal((await request(operatorDb(),{expectedRevision:2},{id:1,role:'admin'},id)).statusCode,400);
});
test('v189: rejects non-Admin before any SQL and inactive Admin before inserts',async()=>{
 const db=operatorDb();let res=await request(db,{expectedRevision:2},{id:5,role:'barber'});
 assert.equal(res.statusCode,403);assert.equal(db.calls.length,0);
 const inactive=operatorDb({admin:false});res=await request(inactive);assert.equal(res.statusCode,403);
 assert.ok(!inactive.calls.some(c=>c.sql.includes('INSERT INTO admin_suspension_telegram_notices')));
});
test('v189: only reviewed/attempted and current case revision accepted',async()=>{
 for(const options of [{caseStatus:'pending'},{caseStatus:'closed'},{revision:3}]){
  const db=operatorDb(options);const res=await request(db);assert.equal(res.statusCode,409);
  assert.ok(!db.calls.some(c=>c.sql.includes('INSERT INTO admin_suspension_telegram_notices')));
 }
});
test('v189: no customer delivery; must be linked, active barber and live suspended customer case',async()=>{
 for(const options of [{role:'barber'},{linked:false},{barberSuspended:true},{accountSuspended:false},{future:false},{booking:'cancelled'}]){
  const db=operatorDb(options);const res=await request(db);
  assert.equal(res.statusCode,409,JSON.stringify(options));
  assert.equal(res.payload.code,'telegram_contact_unavailable');
 }
});
test('v189: Admin request creates one durable queued record, never sends or mutates bookings',async()=>{
 const db=operatorDb();const res=await request(db);
 assert.equal(res.statusCode,202);assert.equal(res.headers['Cache-Control'],'no-store');
 assert.deepEqual(res.payload,{caseId:'7',noticeStatus:'queued',notificationsSent:false,bookingsChanged:false});
 assert.deepEqual(db.calls.find(c=>c.sql.includes('INSERT INTO admin_suspension_telegram_notices')).args,['7',1]);
 assert.equal(db.calls.at(-1).sql,'COMMIT');assert.equal(db.released,true);
 assert.doesNotMatch(db.calls.map(c=>c.sql).join(' '),/UPDATE bookings|DELETE FROM bookings|sendMessage|telegram_otp_contacts/);
});
test('v189: uniqueness violation is not a duplicate send; unknown COMMIT fails closed',async()=>{
 const duplicate=operatorDb({duplicate:true});assert.equal((await request(duplicate)).payload.code,'notice_already_requested');
 const uncertain=operatorDb({failOn:'COMMIT'});const r=await request(uncertain);
 assert.equal(r.statusCode,503);assert.equal(r.payload.code,'notice_state_unknown');
 assert.doesNotMatch(JSON.stringify(r.payload),/sensitive db error/);
});
test('v189: worker has no work, does not call Telegram',async()=>{
 const db=workerDb({queued:false});let called=false;
 assert.equal(await createDispatcher({pool:db,api:()=>{called=true;}}).step(),false);
 assert.equal(called,false);
});
test('v189: revoked, closed or unlinked case is cancelled without sending',async()=>{
 for(const options of [{eligible:false},{linked:false}]){
  const db=workerDb(options);let called=false;
  assert.equal(await createDispatcher({pool:db,api:()=>{called=true;}}).step(),true);
  assert.equal(called,false);
  assert.ok(db.calls.some(c=>c.sql.includes("SET status='cancelled'")));
 }
});
test('v189: accepted means Telegram API acknowledgement, not received or read',async()=>{
 const db=workerDb();const payloads=[];
 const send=async(method,body)=>{payloads.push({method,body});return {message_id:47,chat:{id:777}};};
 assert.equal(await createDispatcher({pool:db,api:send}).step(),true);
 assert.equal(payloads.length,1);assert.equal(payloads[0].method,'sendMessage');
 assert.equal(payloads[0].body.chat_id,'777');assert.equal(payloads[0].body.protect_content,true);
 assert.equal(payloads[0].body.text,noticeText(14));
 assert.doesNotMatch(payloads[0].body.text,/phone|password|suspended|token|customer|reason/i);
 const ack=db.calls.find(c=>c.sql.includes('SET status=$3'));
 assert.equal(ack.args[2],'accepted');assert.equal(ack.args[3],47);
 assert.ok(db.calls.some(c=>c.sql.includes("status='sending'")));
});
test('v189: network timeout and malformed Telegram ack become uncertain without resend',async()=>{
 for(const api of [async()=>{throw Error('token 123');},async()=>({message_id:47,chat:{id:888}})]){
  const db=workerDb();let count=0;
  assert.equal(await createDispatcher({pool:db,api:async(...args)=>{count++;return api(...args);}}).step(),true);
  assert.equal(count,1);
  const ack=db.calls.find(c=>c.sql.includes('SET status=$3'));
  assert.equal(ack.args[2],'uncertain');assert.equal(ack.args[3],null);
  assert.ok(db.calls.some(c=>c.sql.includes("status='sending' AND claimed_at<")));
 }
});
test('v189: failed acknowledgement write cannot trigger another send',async()=>{
 const db=workerDb({failOn:'SET status=$3'});let calls=0;
 await createDispatcher({pool:db,api:async()=>{calls++;return {message_id:23,chat:{id:777}};}}).step();
 assert.equal(calls,1);assert.ok(db.calls.some(c=>c.sql.includes("status='sending' AND claimed_at<")));
});
test('v189: source wiring, standalone worker, migration and no auto-send from suspend transaction',()=>{
 const root=path.resolve(__dirname,'..');
 const src=p=>fs.readFileSync(path.join(root,p),'utf8');
 assert.match(src('routes/admin.js'),/suspension-cases\/:id\/telegram-notice/);
 assert.match(src('database/bootstrap.sql'),/20270101_admin_suspension_telegram_notices/);
 assert.match(src('database/bootstrap/verify.sql'),/admin_suspension_telegram_notices/);
 assert.match(src('database/migrations/20270101_admin_suspension_telegram_notices.sql'),/UNIQUE REFERENCES|case_id BIGINT NOT NULL UNIQUE/);
 assert.match(src('telegram/suspensionNotificationWorkerV189.js'),/ENABLE_SUSPENSION_NOTICE_WORKER/);
 assert.doesNotMatch(src('controllers/adminAccountSuspensionV187.js'),/sendMessage|suspension_telegram_notices/);
});
