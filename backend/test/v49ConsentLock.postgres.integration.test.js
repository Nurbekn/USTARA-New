'use strict';
// v49: two-session real PostgreSQL lock verification, on an ephemeral schema
// created exclusively for this run. Never reads/writes user or app tables.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {testTarget,assertTestConnection,assertOwnedTestSchema,quoteSchema}=require('./helpers/testDatabaseTarget');
const USER='ustara_account_test';
const enabled=process.env.NODE_ENV==='test' &&
 process.env.USTARA_V49_CLAIM_LOCK_TEST==='I_AUTHORIZE_EPHEMERAL_SCHEMA' &&
 Boolean(process.env.USTARA_TEST_DATABASE_URL);
test('v49 real PG: pinned manual consent blocks concurrent revoke until decision commits',
 {skip:!enabled,timeout:40000},async()=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA v49 consent lock',[USER]);
 const {Pool}=require('pg');
 const pool=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,ssl:false,max:2,
  connectionTimeoutMillis:5000,statement_timeout:9000,application_name:'ustara_v49_consent_lock',
  options:'-c search_path=public'});
 const schema=`test_v49_consent_${crypto.randomBytes(5).toString('hex')}`;
 const q=quoteSchema(schema);
 let a,b,created=false,schemaOid;
 try{
  a=await pool.connect();b=await pool.connect();
  await assertTestConnection(a,target,USER);await assertTestConnection(b,target,USER);
  await a.query(`CREATE SCHEMA ${q}`);created=true;
  await a.query(`CREATE TABLE ${q}.queue (id integer PRIMARY KEY)`);
  await a.query(`CREATE TABLE ${q}.claims (entry_id integer PRIMARY KEY REFERENCES ${q}.queue(id), customer_id integer,consent_at timestamptz)`);
  await a.query(`INSERT INTO ${q}.queue(id) VALUES(1)`);
  await a.query(`INSERT INTO ${q}.claims(entry_id,customer_id,consent_at) VALUES(1,1,clock_timestamp())`);
  await a.query('BEGIN');
  const consent=`SELECT q.id FROM ${q}.queue q JOIN ${q}.claims m ON m.entry_id=q.id
     WHERE q.id=1 AND m.customer_id=1 AND m.consent_at IS NOT NULL FOR SHARE OF q,m`;
  assert.equal((await a.query(consent)).rowCount,1);
  await b.query('BEGIN');await b.query("SET LOCAL lock_timeout='200ms'");
  await assert.rejects(b.query(`UPDATE ${q}.claims SET consent_at=NULL WHERE entry_id=1`),e=>e.code==='55P03');
  await b.query('ROLLBACK');
  // After the decision transaction commits, opt-out is able to proceed.
  await a.query('COMMIT');
  await b.query('BEGIN');
  assert.equal((await b.query(`UPDATE ${q}.claims SET consent_at=NULL WHERE entry_id=1`)).rowCount,1);
  await b.query('COMMIT');
  await a.query('BEGIN');
  assert.equal((await a.query(consent)).rowCount,0,'revoked consent cannot authorize a later decision');
  await a.query('ROLLBACK');
 }finally{
  if(b){await b.query('ROLLBACK').catch(()=>{});b.release();}
  if(a){
   await a.query('ROLLBACK').catch(()=>{});
   try{if(created){
    await assertTestConnection(a,target,USER);
    await a.query(`SET search_path TO ${q}, pg_catalog`);
    schemaOid=await assertOwnedTestSchema(a,target,schema,USER);
    await assertOwnedTestSchema(a,target,schema,USER,schemaOid);
    await a.query(`DROP SCHEMA ${q} CASCADE`);
   }}finally{a.release();}
  }
  await pool.end();
 }
});
