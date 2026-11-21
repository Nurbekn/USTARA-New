'use strict';
// Opt-in only: never run against a live/production DB. Requires reviewed v22 migration.
const {test}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const {Pool}=require('pg');
const {testTarget,assertTestConnection}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test'
 && process.env.USTARA_WALKIN_QR_TESTS==='I_AUTHORIZE_TEST_DATA'
 && Boolean(process.env.USTARA_TEST_DATABASE_URL);
const TEST_ROLE='ustara_account_test';
const answer=()=>({statusCode:200,body:null,status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;},set(){return this;}});
test('v22 QR one-use: separate PostgreSQL connections, barber approval and private status',
 {skip:!enabled,timeout:90000},async t=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA walk-in QR',[TEST_ROLE]);
 const db=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,ssl:false,
  application_name:'ustara_walkin_qr_test',max:5,connectionTimeoutMillis:5000,
  options:'-c search_path=public -c timezone=UTC',statement_timeout:15000});
 let id,userId,phone;
 t.after(async()=>{
  try{if(id){const c=await db.connect();try{
    await assertTestConnection(c,target,TEST_ROLE);await c.query('BEGIN');
    await c.query('DELETE FROM walkin_qr_tokens WHERE barber_id=$1',[id]);
    await c.query('DELETE FROM walkin_queue WHERE barber_id=$1',[id]);
    await c.query('DELETE FROM barber_working_hours WHERE barber_id=$1',[id]);
    await c.query('DELETE FROM barbers WHERE id=$1 AND user_id=$2',[id,userId]);
    await c.query('DELETE FROM users WHERE id=$1 AND phone=$2',[userId,phone]);
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}}
  finally{await db.end();}
 });
 const guard=await db.connect();try{
  await assertTestConnection(guard,target,TEST_ROLE);
  const checks=await guard.query(`SELECT
    EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261205_walkin_qr_approval') AS migrated,
    to_regclass('public.walkin_qr_tokens') IS NOT NULL AS tokens,
    to_regclass('public.walkin_qr_requests') IS NOT NULL AS requests,
    to_regclass('public.walkin_qr_request_events') IS NOT NULL AS audit`);
  assert.deepEqual(checks.rows[0],{migrated:true,tokens:true,requests:true,audit:true},
   'Apply reviewed v22 migration only to the explicit disposable test DB first');
 }finally{guard.release();}
 phone='+998'+String(crypto.randomInt(100000000,999999999));
 const c=await db.connect();try{
  await c.query('BEGIN');
  userId=(await c.query("INSERT INTO users(phone,password,role) VALUES($1,'v22-test-only','barber') RETURNING id",[phone])).rows[0].id;
  id=(await c.query("INSERT INTO barbers(user_id,first_name,last_name,specialty,verification_status) VALUES($1,'QR','Fixture','barber','approved') RETURNING id",[userId])).rows[0].id;
  const day=(await c.query("SELECT extract(dow FROM (clock_timestamp() AT TIME ZONE 'Asia/Tashkent'))::int AS d")).rows[0].d;
  await c.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,$2,'00:00','23:59')",[id,day]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 const old=require.cache[require.resolve('../db')];const dbPath=require.resolve('../db');
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
 let createHandlers;try{({createHandlers}=require('../controllers/walkinQrController'));}
 finally{if(old)require.cache[dbPath]=old;else delete require.cache[dbPath];}
 const api=createHandlers(db),staff={role:'barber',profileId:id,id:userId};
 async function call(name,body={},params={},user=staff){
  const res=answer();await api[name]({user,body,params,headers:{origin:'http://localhost:5173'}},res);return res;
 }
 const qr=await call('tokenCreate',{origin:'http://localhost:5173'});
 assert.equal(qr.statusCode,201);const token=qr.body.url.split('/').at(-1);
 const key=crypto.randomBytes(16).toString('hex');
 const [a,b]=await Promise.all([
  call('requestJoin',{token,request_id:key,label:'Walk-in visitor'}, {},null),
  call('requestJoin',{token,request_id:key,label:'Walk-in visitor'}, {},null),
 ]);
 assert.deepEqual([a.statusCode,b.statusCode].sort(),[200,202]);
 const oldToken=await call('requestJoin',{token,request_id:crypto.randomBytes(16).toString('hex')},{},null);
 assert.equal(oldToken.statusCode,409);
 const pending=await call('pendingList');assert.equal(pending.body.pending.length,1);
 const rId=pending.body.pending[0].id;
 const outsider=await call('decide',{decision:'approve'},{id:rId},{role:'customer',id:123,profileId:123});
 assert.equal(outsider.statusCode,403);
 const [first,second]=await Promise.all([
  call('decide',{decision:'approve'},{id:rId}),
  call('decide',{decision:'approve'},{id:rId}),
 ]);
 assert.equal(first.statusCode,200);assert.equal(second.statusCode,200);
 assert.equal(first.body.queue_entry_id,second.body.queue_entry_id);
 assert.equal([first.body.replayed,second.body.replayed].filter(Boolean).length,1);
 const status=await call('requestStatus',{token,request_id:key},{},null);
 assert.equal(status.body.status,'approved');
 assert.equal(status.body.queue_status,'waiting');
 assert.equal(status.body.position,1);
 assert.equal(status.body.estimated_wait.approximate,true);
 assert.equal(status.body.display_label,undefined);
 // Use the same real queue service to verify a private QR guest sees live call/finish.
 const oldQueue=require.cache[dbPath];
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
 let queueFactory;try{({createHandlers:queueFactory}=require('../controllers/walkinQueueController'));}
 finally{if(oldQueue)require.cache[dbPath]=oldQueue;else delete require.cache[dbPath];}
 const queue=queueFactory(db);
 const qRes=answer();await queue.callNext({user:staff,body:{}},qRes);
 assert.equal(qRes.statusCode,200);
 const called=await call('requestStatus',{token,request_id:key},{},null);
 assert.equal(called.body.queue_status,'called');
 assert.equal(called.body.position,null);
 const finishRes=answer();await queue.finish({user:staff,params:{id:first.body.queue_entry_id},body:{status:'served'}},finishRes);
 assert.equal(finishRes.statusCode,200);
 const served=await call('requestStatus',{token,request_id:key},{},null);
 assert.equal(served.body.queue_status,'served');
 assert.equal(served.body.estimated_wait,null);
 const publicDb=require.cache[dbPath];
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
 let publicFactory;try{({createPublicSummary:publicFactory}=require('../controllers/queuePublicController'));}
 finally{if(publicDb)require.cache[dbPath]=publicDb;else delete require.cache[dbPath];}
 const summary=answer();await publicFactory(db)({params:{barberId:id}},summary);
 assert.equal(summary.statusCode,200);
 assert.equal(summary.body.waiting_count,0);
 assert.equal(summary.body.display_label,undefined);

 const count=await db.query('SELECT count(*)::int AS total FROM walkin_queue WHERE barber_id=$1',[id]);
 assert.equal(count.rows[0].total,1);
 const audits=await db.query("SELECT action FROM walkin_qr_request_events WHERE request_id=$1 ORDER BY id",[rId]);
 assert.deepEqual(audits.rows.map(x=>x.action),['requested','approved']);
});
