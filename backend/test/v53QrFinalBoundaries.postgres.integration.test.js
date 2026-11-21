'use strict';
// Real PostgreSQL (not a mock), isolated to a one-time owned test schema.
// All mutations are inside the safe local test DB; never run on app tables.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {testTarget,assertTestConnection,assertOwnedTestSchema,quoteSchema}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test'
 && process.env.USTARA_V53_DB_BOUNDARY==='I_AUTHORIZE_EPHEMERAL_SCHEMA'
 && Boolean(process.env.USTARA_TEST_DATABASE_URL);
const TEST_USER='ustara_account_test';
const token='a'.repeat(48),requestId='b'.repeat(32);

test('v53 real PostgreSQL: expired QR consume and closed-shop approval both roll back',
 {skip:!enabled,timeout:45000},async()=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA v53 QR deadline',[TEST_USER]);
 const {Pool}=require('pg');
 // Avoid loading the normal app pool even in an integration test.
 const dbPath=require.resolve('../db');
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
 const {createHandlers,tokenHash,requestHash}=require('../controllers/walkinQrController');
 const pool=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,ssl:false,max:2,
  connectionTimeoutMillis:5000,statement_timeout:10000,application_name:'ustara_v53_qr_ephemeral'});
 const schema=`test_v53_qr_${crypto.randomBytes(5).toString('hex')}`;
 const q=quoteSchema(schema);
 let admin,created=false,oid;
 async function call(handler,req,db){
  const out={status:200};
  await createHandlers(db)[handler](req,{
   status(n){out.status=n;return this;},set(){return this;},
   json(body){out.body=body;return this;}
  });
  return out;
 }
 try{
  admin=await pool.connect();await assertTestConnection(admin,target,TEST_USER);
  await admin.query(`CREATE SCHEMA ${q}`);created=true;
  await admin.query(`SET search_path TO ${q},pg_catalog`);
  oid=await assertOwnedTestSchema(admin,target,schema,TEST_USER);
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
   expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
  await admin.query(`CREATE TABLE ${q}.walkin_qr_requests (
   id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,qr_token_id bigint,barber_id bigint,
   request_hash text,request_key text,display_label text,status text DEFAULT 'pending',
   queue_entry_id bigint,decided_by_user_id bigint,decided_at timestamptz,
   created_at timestamptz DEFAULT clock_timestamp())`);
  await admin.query(`CREATE TABLE ${q}.walkin_qr_request_events (request_id bigint,actor_user_id bigint,action text)`);
  await admin.query(`CREATE TABLE ${q}.walkin_queue (
   id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,barber_id bigint,request_key text,
   display_label text,status text DEFAULT 'waiting',queue_position bigint,
   queue_date date DEFAULT (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date)`);
  await admin.query(`CREATE TABLE ${q}.walkin_queue_events (entry_id bigint,actor_user_id bigint,action text)`);
  await admin.query(`INSERT INTO ${q}.users(id,role) VALUES(91,'barber')`);
  await admin.query(`INSERT INTO ${q}.barbers(id,user_id,verification_status) VALUES(7,91,'approved')`);
  await admin.query(`INSERT INTO ${q}.day_open(barber_id,open_now) VALUES(7,TRUE)`);
  // Deterministic boundary simulation: expire the token inside the same
  // transaction immediately before final consumption. Never sleep/race time.
  await admin.query(`INSERT INTO ${q}.walkin_qr_tokens(id,barber_id,token_hash,expires_at)
    VALUES (1,7,$1,clock_timestamp()+interval '10 minutes')`,[tokenHash(token)]);
  const db={connect:async()=>{
   const c=await pool.connect();
   await c.query(`SET search_path TO ${q},pg_catalog`);
   return {query:async(sql,args)=>{
     if(sql.includes('UPDATE walkin_qr_tokens SET used_at='))
      await c.query(`UPDATE ${q}.walkin_qr_tokens
       SET expires_at=clock_timestamp()-interval '1 second' WHERE id=1`);
     if(sql.includes('UPDATE walkin_qr_requests SET status='))
      await c.query(`UPDATE ${q}.day_open SET open_now=FALSE WHERE barber_id=7`);
     return c.query(sql,args);
    },release:broken=>c.release(broken)};
  }};
  const result=await call('requestJoin',{body:{token,request_id:requestId,label:'Mehmon'}},db);
  assert.equal(result.status,410);
  assert.equal(result.body.code,'qr_expired');
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ${q}.walkin_qr_requests`)).rows[0].n,0);
  assert.equal((await admin.query(`SELECT used_at FROM ${q}.walkin_qr_tokens WHERE id=1`)).rows[0].used_at,null);
  // QR approval enters a queue, then schedule closes before the FINAL status
  // write. That write must reject and roll back the provisional queue row.
  const seeded=await admin.query(`INSERT INTO ${q}.walkin_qr_requests(qr_token_id,barber_id,request_hash,
    request_key,display_label,status) VALUES(1,7,$1,$2,'Mehmon','pending') RETURNING id`,
   [requestHash(requestId),requestId]);
  // Identity sequences are not rolled back: never assume the next ID is 1.
  const requestRowId=seeded.rows[0].id;
  const decided=await call('decide',{params:{id:String(requestRowId)},body:{decision:'approve'},
    user:{role:'barber',id:91,profileId:7}},db);
  assert.equal(decided.status,409);
  assert.equal(decided.body.code,'barber_closed');
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ${q}.walkin_queue`)).rows[0].n,0);
  assert.equal((await admin.query(`SELECT status FROM ${q}.walkin_qr_requests WHERE id=$1`,[requestRowId])).rows[0].status,'pending');
  assert.equal((await admin.query(`SELECT open_now FROM ${q}.day_open WHERE barber_id=7`)).rows[0].open_now,true);
 }finally{
  if(admin){
   await admin.query('ROLLBACK').catch(()=>{});
   try{if(created){
    await assertTestConnection(admin,target,TEST_USER);
    await admin.query(`SET search_path TO ${q},pg_catalog`);
    await assertOwnedTestSchema(admin,target,schema,TEST_USER,oid);
    await admin.query(`DROP SCHEMA ${q} CASCADE`);
   }}finally{admin.release();}
  }
  await pool.end();
 }
});
