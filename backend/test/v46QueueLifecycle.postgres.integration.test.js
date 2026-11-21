'use strict';
// Optional real PostgreSQL check, isolated inside an owned ephemeral schema.
// Requires explicit opt-in to a loopback ustara_test_db as a restricted role.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {cancelUnconfirmedQueueOffers}=require('../services/queueOfferLifecycle');
const {testTarget,assertTestConnection,assertOwnedTestSchema,quoteSchema}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test' &&
 process.env.USTARA_V46_QUEUE_LIFECYCLE==='I_AUTHORIZE_EPHEMERAL_SCHEMA' &&
 Boolean(process.env.USTARA_TEST_DATABASE_URL);
const ROLE='ustara_account_test';
test('v46 real PG: call/finish cleanup touches unconfirmed offers only and can roll back',
 {skip:!enabled,timeout:40000},async()=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA v46 queue test',[ROLE]);
 const {Pool}=require('pg');
 const pool=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,ssl:false,max:1,
  connectionTimeoutMillis:5000,statement_timeout:12000,application_name:'ustara_v46_ephemeral_queue'});
 const schema=`test_v46_queue_${crypto.randomBytes(5).toString('hex')}`;
 const q=quoteSchema(schema);let c,created=false,oid;
 try{
  c=await pool.connect();await assertTestConnection(c,target,ROLE);
  await c.query(`CREATE SCHEMA ${q}`);created=true;
  await c.query(`SET search_path TO ${q}, pg_catalog`);
  oid=(await assertOwnedTestSchema(c,target,schema,ROLE)).toString();
  await c.query(`CREATE TABLE ${q}.smart_booking_offers (
    id bigint PRIMARY KEY,entry_id bigint,status text,decided_at timestamptz,opening_id bigint)`);
  await c.query(`CREATE TABLE ${q}.smart_booking_confirmations (offer_id bigint PRIMARY KEY)`);
  await c.query(`CREATE TABLE ${q}.smart_booking_openings (
    id bigint PRIMARY KEY,state text,next_check_at timestamptz,updated_at timestamptz)`);
  await c.query(`CREATE TABLE ${q}.smart_booking_telegram_outbox (
    offer_id bigint,status text,lease_owner uuid,lease_until timestamptz)`);
  await c.query(`INSERT INTO ${q}.smart_booking_openings(id,state) VALUES
   (10,'offered'),(11,'accepted'),(12,'accepted')`);
  await c.query(`INSERT INTO ${q}.smart_booking_offers(id,entry_id,status,opening_id) VALUES
   (101,51,'pending',10),(102,51,'accepted',11),(103,51,'accepted',12),(104,99,'pending',10)`);
  await c.query(`INSERT INTO ${q}.smart_booking_confirmations(offer_id) VALUES(103)`);
  await c.query(`INSERT INTO ${q}.smart_booking_telegram_outbox(offer_id,status)
    VALUES(101,'pending'),(102,'pending'),(103,'sent')`);
  await c.query('BEGIN');
  assert.deepEqual(await cancelUnconfirmedQueueOffers(c,51),{cancelled_offers:2});
  assert.equal((await c.query(`SELECT count(*)::int n FROM ${q}.smart_booking_offers
    WHERE entry_id=51 AND status='cancelled'`)).rows[0].n,2);
  await c.query('ROLLBACK');
  assert.equal((await c.query(`SELECT status FROM ${q}.smart_booking_offers WHERE id=101`)).rows[0].status,'pending');
  await c.query('BEGIN');
  assert.deepEqual(await cancelUnconfirmedQueueOffers(c,51),{cancelled_offers:2});
  await c.query('COMMIT');
  assert.deepEqual((await c.query(`SELECT id,status FROM ${q}.smart_booking_offers
   WHERE entry_id=51 ORDER BY id`)).rows.map(r=>[Number(r.id),r.status]),
   [[101,'cancelled'],[102,'cancelled'],[103,'accepted']]);
  assert.deepEqual((await c.query(`SELECT id,state FROM ${q}.smart_booking_openings ORDER BY id`))
   .rows.map(r=>[Number(r.id),r.state]),[[10,'open'],[11,'open'],[12,'accepted']]);
  assert.deepEqual((await c.query(`SELECT offer_id,status FROM ${q}.smart_booking_telegram_outbox ORDER BY offer_id`))
   .rows.map(r=>[Number(r.offer_id),r.status]),[[101,'cancelled'],[102,'cancelled'],[103,'sent']]);
 }finally{
  if(c){
   await c.query('ROLLBACK').catch(()=>{});
   try{if(created){await assertTestConnection(c,target,ROLE);
    await c.query(`SET search_path TO ${q}, pg_catalog`);
    await assertOwnedTestSchema(c,target,schema,ROLE,oid);
    await c.query(`DROP SCHEMA ${q} CASCADE`);
   }}finally{c.release();}
  }
  await pool.end();
 }
});
