'use strict';
// Real two-connection PostgreSQL boundary test. Never touches app/public tables.
// Needs opt-in and a non-superuser-owned ephemeral schema in ustara_test_db.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {testTarget,assertTestConnection,assertOwnedTestSchema,quoteSchema}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test'
 && process.env.USTARA_V54_DB_FENCE==='I_AUTHORIZE_EPHEMERAL_SCHEMA'
 && Boolean(process.env.USTARA_TEST_DATABASE_URL);
const USER='ustara_account_test';
const QR='a'.repeat(48),REQUEST='b'.repeat(32);

test('v54 PostgreSQL: QR closes before final write; two workers race on next_check_at',
 {skip:!enabled,timeout:50000},async()=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA v54 boundaries',[USER]);
 const {Pool}=require('pg');
 const dbPath=require.resolve('../db');
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
 const {createHandlers,tokenHash}=require('../controllers/walkinQrController');
 const {createSmartBookingOffers}=require('../services/smartBookingOffers');
 const pool=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,ssl:false,max:2,
  connectionTimeoutMillis:5000,statement_timeout:12000,application_name:'ustara_v54_boundary_ephemeral'});
 const schema=`test_v54_guard_${crypto.randomBytes(5).toString('hex')}`;
 const q=quoteSchema(schema);
 let admin,created=false,oid,held=false;
 const db={connect:async()=>{
   const c=await pool.connect();
   await c.query(`SET search_path TO ${q},pg_catalog`);
   return {query:(sql,args)=>c.query(sql,args),release:broken=>c.release(broken)};
 }};
 const call=async(handler,req,handlerDb)=>{
  const out={statusCode:200,status(n){this.statusCode=n;return this;},set(){return this;},json(body){this.body=body;return this;}};
  await createHandlers(handlerDb)[handler](req,out);
  return out;
 };
 try{
  admin=await pool.connect();
  await assertTestConnection(admin,target,USER);
  await admin.query(`CREATE SCHEMA ${q}`);created=true;
  await admin.query(`SET search_path TO ${q},pg_catalog`);
  oid=await assertOwnedTestSchema(admin,target,schema,USER);
  await admin.query(`CREATE TABLE ${q}.users (id bigint PRIMARY KEY,role text,deactivated_at timestamptz)`);
  await admin.query(`CREATE TABLE ${q}.barbers (id bigint PRIMARY KEY,user_id bigint,verification_status text)`);
  await admin.query(`CREATE TABLE ${q}.day_open (barber_id bigint PRIMARY KEY,open_now boolean NOT NULL)`);
  await admin.query(`CREATE FUNCTION ${q}.ustara_effective_day_schedule(p_barber_id bigint,p_date date)
    RETURNS TABLE(start_time time,end_time time) LANGUAGE sql STABLE AS $$
     SELECT time '00:00:00',time '23:59:59'
       FROM ${q}.day_open WHERE barber_id=p_barber_id AND open_now=TRUE
    $$`);
  await admin.query(`CREATE TABLE ${q}.walkin_qr_tokens (
    id bigint PRIMARY KEY,barber_id bigint,token_hash text UNIQUE,used_at timestamptz,
    expires_at timestamptz NOT NULL,created_at timestamptz DEFAULT clock_timestamp())`);
  await admin.query(`CREATE TABLE ${q}.walkin_qr_requests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,qr_token_id bigint,barber_id bigint,
    request_hash text,request_key text,display_label text,status text DEFAULT 'pending',
    created_at timestamptz DEFAULT clock_timestamp())`);
  await admin.query(`CREATE TABLE ${q}.walkin_qr_request_events (request_id bigint,actor_user_id bigint,action text)`);
  await admin.query(`CREATE TABLE ${q}.smart_booking_openings (
    id bigint PRIMARY KEY,barber_id bigint,state text,next_check_at timestamptz,
    start_at timestamptz,duration_minutes int)`);
  await admin.query(`INSERT INTO ${q}.users(id,role) VALUES(91,'barber')`);
  await admin.query(`INSERT INTO ${q}.barbers(id,user_id,verification_status) VALUES(7,91,'approved')`);
  await admin.query(`INSERT INTO ${q}.day_open(barber_id,open_now) VALUES(7,TRUE)`);
  await admin.query(`INSERT INTO ${q}.walkin_qr_tokens(id,barber_id,token_hash,expires_at)
    VALUES(1,7,$1,clock_timestamp()+interval '10 minutes')`,[tokenHash(QR)]);
  // Force shop closure inside QR's own transaction, AFTER the request insert
  // but BEFORE the final token consumption. Rollback must restore day_open.
  const gateDb={connect:async()=>{
   const c=await pool.connect();await c.query(`SET search_path TO ${q},pg_catalog`);
   return {query:async(sql,args)=>{
    if(sql.includes('UPDATE walkin_qr_tokens SET used_at='))
     await c.query(`UPDATE ${q}.day_open SET open_now=FALSE WHERE barber_id=7`);
    return c.query(sql,args);
   },release:broken=>c.release(broken)};
  }};
  const qr=await call('requestJoin',{body:{token:QR,request_id:REQUEST,label:'Mehmon'}},gateDb);
  assert.equal(qr.statusCode,409);assert.equal(qr.body.code,'barber_closed');
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ${q}.walkin_qr_requests`)).rows[0].n,0);
  assert.equal((await admin.query(`SELECT used_at FROM ${q}.walkin_qr_tokens WHERE id=1`)).rows[0].used_at,null);
  assert.equal((await admin.query(`SELECT open_now FROM ${q}.day_open WHERE barber_id=7`)).rows[0].open_now,true);
  // Real concurrency: the first connection holds the barber advisory lock.
  // The second worker reads a due row, then blocks at the lock. The first
  // connection advances next_check_at before releasing the lock.
  await admin.query(`INSERT INTO ${q}.smart_booking_openings
    (id,barber_id,state,next_check_at,start_at,duration_minutes)
    VALUES(8,7,'open',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',30)`);
  await admin.query('BEGIN');held=true;
  await admin.query('SELECT pg_advisory_xact_lock(7)');
  let reached;
  const advisoryReached=new Promise(resolve=>{reached=resolve;});
  const workerDb={connect:async()=>{
   const c=await pool.connect();await c.query(`SET search_path TO ${q},pg_catalog`);
   return {query:(sql,args)=>{
    if(sql.includes('pg_advisory_xact_lock'))reached();
    return c.query(sql,args);
   },release:broken=>c.release(broken)};
  }};
  const workerPromise=createSmartBookingOffers(workerDb).tick();
  await advisoryReached;
  await admin.query(`UPDATE ${q}.smart_booking_openings
    SET next_check_at=clock_timestamp()+interval '10 minutes' WHERE id=8`);
  await admin.query('COMMIT');held=false;
  const result=await workerPromise;
  assert.deepEqual(result,{kind:'raced'});
  assert.equal((await admin.query(`SELECT (next_check_at>clock_timestamp()) AS not_due
    FROM ${q}.smart_booking_openings WHERE id=8`)).rows[0].not_due,true);
 }finally{
  if(admin){
   if(held)await admin.query('ROLLBACK').catch(()=>{});
   try{if(created){
    await assertTestConnection(admin,target,USER);
    await admin.query(`SET search_path TO ${q},pg_catalog`);
    await assertOwnedTestSchema(admin,target,schema,USER,oid);
    await admin.query(`DROP SCHEMA ${q} CASCADE`);
   }}finally{admin.release();}
  }
  await pool.end();
 }
});
