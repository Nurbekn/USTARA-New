'use strict';
// Explicit opt-in on an isolated test database only. Never loads migrations or production credentials.
const {test}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const {Pool}=require('pg');
const {testTarget,assertTestConnection}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test'&&process.env.USTARA_QUEUE_REORDER_DB_TESTS==='I_AUTHORIZE_TEST_DATA'
 && Boolean(process.env.USTARA_TEST_DATABASE_URL);
const TEST_ROLE='ustara_account_test';
const response=()=>({statusCode:200,body:null,headers:{},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;},set(k,v){this.headers[k]=v;return this;}});
test('v23 isolated PostgreSQL: reorder with audit, stale order rejection, and next called order',
 {skip:!enabled,timeout:90000},async t=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA queue reorder',[TEST_ROLE]);
 const db=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,ssl:false,
  application_name:'ustara_queue_reorder_test',max:4,connectionTimeoutMillis:5000,
  options:'-c search_path=public -c timezone=UTC',statement_timeout:15000});
 let barberId,userId,phone;
 t.after(async()=>{
  try{if(barberId){const c=await db.connect();try{
    await assertTestConnection(c,target,TEST_ROLE);await c.query('BEGIN');
    await c.query('DELETE FROM walkin_queue WHERE barber_id=$1',[barberId]);
    await c.query('DELETE FROM barber_working_hours WHERE barber_id=$1',[barberId]);
    await c.query('DELETE FROM barbers WHERE id=$1 AND user_id=$2',[barberId,userId]);
    await c.query('DELETE FROM users WHERE id=$1 AND phone=$2',[userId,phone]);
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}}
  finally{await db.end();}
 });
 const check=await db.connect();try{
  await assertTestConnection(check,target,TEST_ROLE);
  const version=await check.query("SELECT 1 FROM ustara_schema_migrations WHERE version='20261206_queue_order_qr_settings'");
  assert.equal(version.rowCount,1,'Apply reviewed migration v23 to disposable DB first');
 }finally{check.release();}
 phone='+998'+String(crypto.randomInt(100000000,999999999));
 const c=await db.connect();try{
  await c.query('BEGIN');
  userId=(await c.query("INSERT INTO users(phone,password,role) VALUES($1,'v23-test-only','barber') RETURNING id",[phone])).rows[0].id;
  barberId=(await c.query(`INSERT INTO barbers(user_id,first_name,last_name,specialty,verification_status)
    VALUES($1,'Queue','Override','barber','approved') RETURNING id`,[userId])).rows[0].id;
  const day=(await c.query("SELECT extract(dow FROM (clock_timestamp() AT TIME ZONE 'Asia/Tashkent'))::int AS d")).rows[0].d;
  await c.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,$2,'00:00','23:59')",[barberId,day]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 const dbPath=require.resolve('../db'),old=require.cache[dbPath];
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
 let createHandlers;try{({createHandlers}=require('../controllers/walkinQueueController'));}
 finally{if(old)require.cache[dbPath]=old;else delete require.cache[dbPath];}
 const api=createHandlers(db),staff={role:'barber',id:userId,profileId:barberId};
 async function send(name,body={},params={}){const r=response();await api[name]({user:staff,body,params},r);return r;}
 const add=async label=>send('join',{request_id:crypto.randomBytes(16).toString('hex'),label});
 const a=await add('Mijoz A'),b=await add('Mijoz B'),c3=await add('Mijoz C');
 assert.deepEqual([a.statusCode,b.statusCode,c3.statusCode],[201,201,201]);
 const ids=[a.body.entry.id,b.body.entry.id,c3.body.entry.id].map(Number);
 const stale=await send('reorder',{direction:'up',reason:'Mijozning asosli iltimosi',expected_order:[ids[0],ids[2],ids[1]]},{id:ids[1]});
 assert.equal(stale.statusCode,409);
 const move=await send('reorder',{direction:'up',reason:'Mijozning asosli iltimosi',expected_order:ids},{id:ids[1]});
 assert.equal(move.statusCode,200);
 const listing=await send('list');assert.deepEqual(listing.body.active.filter(x=>x.status==='waiting').map(x=>Number(x.id)),[ids[1],ids[0],ids[2]]);
 const audit=await db.query('SELECT old_position,new_position,reason FROM walkin_queue_reorder_events WHERE barber_id=$1',[barberId]);
 assert.equal(audit.rowCount,1);assert.equal(audit.rows[0].old_position,2);assert.equal(audit.rows[0].new_position,1);
 const called=await send('callNext');assert.equal(Number(called.body.entry.id),ids[1]);
});
