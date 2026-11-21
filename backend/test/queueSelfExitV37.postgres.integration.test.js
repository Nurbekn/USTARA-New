'use strict';
// Opt-in real PostgreSQL check. Never touches application/public tables.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {testTarget,assertTestConnection,assertOwnedTestSchema,quoteSchema}=require('./helpers/testDatabaseTarget');
const USER='ustara_account_test';
const enabled=process.env.NODE_ENV==='test' &&
 process.env.USTARA_V37_QUEUE_EXIT_AUDIT==='I_AUTHORIZE_EPHEMERAL_SCHEMA' &&
 Boolean(process.env.USTARA_TEST_DATABASE_URL);

test('v37 real PG: self-exit audit migration keeps staff events, accepts only correctly attributed guest/customer exits',
 {skip:!enabled,timeout:45000},async()=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA v37 audit migration',[USER]);
 const {Pool}=require('pg');
 const pool=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,ssl:false,max:1,
  connectionTimeoutMillis:5000,statement_timeout:12000,application_name:'ustara_v37_ephemeral_audit'});
 const schema=`test_v37_exit_${crypto.randomBytes(5).toString('hex')}`;
 const quoted=quoteSchema(schema);let c,created=false,oid;
 try{
  c=await pool.connect();await assertTestConnection(c,target,USER);
  await c.query(`CREATE SCHEMA ${quoted}`);created=true;
  await c.query(`SET search_path TO ${quoted}, pg_catalog`);
  oid=(await assertOwnedTestSchema(c,target,schema,USER)).toString();
  await c.query(`CREATE TABLE ${quoted}.ustara_schema_migrations(version text PRIMARY KEY)`);
  await c.query(`INSERT INTO ${quoted}.ustara_schema_migrations(version) VALUES('20261211_smart_booking_active_entry')`);
  await c.query(`CREATE TABLE ${quoted}.walkin_queue_events (
   id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,entry_id bigint NOT NULL,
   actor_user_id integer NOT NULL,action varchar(12) NOT NULL)`);
  await c.query(`INSERT INTO ${quoted}.walkin_queue_events(entry_id,actor_user_id,action)
    VALUES(11,12,'called')`);
  const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/20261212_queue_self_exit_audit.sql'),'utf8');
  await c.query(sql);
  await assertOwnedTestSchema(c,target,schema,USER,oid);
  const legacy=await c.query(`SELECT actor_source,actor_user_id FROM ${quoted}.walkin_queue_events WHERE entry_id=11`);
  assert.deepEqual(legacy.rows[0],{actor_source:'staff',actor_user_id:12});
  await c.query(`INSERT INTO ${quoted}.walkin_queue_events(entry_id,actor_user_id,action,actor_source)
    VALUES(12,NULL,'left','qr_guest'),(13,16,'left','customer')`);
  await assert.rejects(c.query(`INSERT INTO ${quoted}.walkin_queue_events(entry_id,actor_user_id,action,actor_source)
    VALUES(14,NULL,'called','qr_guest')`),e=>e.code==='23514');
  await assert.rejects(c.query(`INSERT INTO ${quoted}.walkin_queue_events(entry_id,actor_user_id,action,actor_source)
    VALUES(15,NULL,'left','staff')`),e=>e.code==='23514');
  await assert.rejects(c.query(sql),e=>/already applied/.test(e.message));
  await c.query('ROLLBACK'); // an intentional failed migration can leave an aborted transaction
  assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${quoted}.ustara_schema_migrations
    WHERE version='20261212_queue_self_exit_audit'`)).rows[0].n,1);
 }finally{
  if(c){
   await c.query('ROLLBACK').catch(()=>{});
   try{
    if(created){
     await assertTestConnection(c,target,USER);
     await c.query(`SET search_path TO ${quoted}, pg_catalog`);
     await assertOwnedTestSchema(c,target,schema,USER,oid);
     await c.query(`DROP SCHEMA ${quoted} CASCADE`);
    }
   }finally{c.release();}
  }
  await pool.end();
 }
});
