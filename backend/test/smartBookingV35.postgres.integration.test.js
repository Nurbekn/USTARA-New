'use strict';
// Real two-session ROW lock test, isolated to an explicitly authorized local
// test database and an ephemeral schema that this test owns. No app data used.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {testTarget,assertTestConnection,assertOwnedTestSchema,quoteSchema}=require('./helpers/testDatabaseTarget');
const USER='ustara_account_test';
const enabled=process.env.NODE_ENV==='test' &&
 process.env.USTARA_V35_ROW_LOCK_TEST==='I_AUTHORIZE_EPHEMERAL_SCHEMA' &&
 Boolean(process.env.USTARA_TEST_DATABASE_URL);

test('v35 real PostgreSQL: customer+user row locks serialize deactivation and stale authorization',
 {skip:!enabled,timeout:40000},async()=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA v35 row-lock test',[USER]);
 const {Pool}=require('pg'); // do not load optional dependency when disabled
 const pool=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,
  ssl:false,max:2,connectionTimeoutMillis:5000,statement_timeout:10000,
  application_name:'ustara_v35_ephemeral_row_lock'});
 let a,b,created=false,oid;
 const schema=`test_v35_race_${crypto.randomBytes(5).toString('hex')}`;
 const q=quoteSchema(schema);
 try{
  a=await pool.connect();b=await pool.connect();
  await assertTestConnection(a,target,USER);await assertTestConnection(b,target,USER);
  await a.query(`CREATE SCHEMA ${q}`);created=true;
  await a.query(`CREATE TABLE ${q}.users (id integer PRIMARY KEY,deactivated_at timestamptz)`);
  await a.query(`CREATE TABLE ${q}.customers (id integer PRIMARY KEY,user_id integer REFERENCES ${q}.users(id))`);
  await a.query(`INSERT INTO ${q}.users(id) VALUES(1)`);
  await a.query(`INSERT INTO ${q}.customers(id,user_id) VALUES(1,1)`);
  // Lock the SAME two rows as smartBookingConfirmation.confirm and
  // manualQueueClaims.assertCustomer, without touching real users.
  const identity=`SELECT c.id FROM ${q}.customers c JOIN ${q}.users u ON u.id=c.user_id
    WHERE c.id=1 AND c.user_id=1 AND u.deactivated_at IS NULL FOR UPDATE OF c,u`;
  await a.query('BEGIN');
  assert.equal((await a.query(identity)).rowCount,1);
  await b.query('BEGIN');
  await b.query("SET LOCAL lock_timeout='250ms'");
  await assert.rejects(b.query(`UPDATE ${q}.users SET deactivated_at=clock_timestamp() WHERE id=1`),
   e=>e.code==='55P03');
  await b.query('ROLLBACK');
  await a.query('COMMIT');
  await b.query('BEGIN');
  assert.equal((await b.query(`UPDATE ${q}.users SET deactivated_at=clock_timestamp() WHERE id=1`)).rowCount,1);
  await b.query('COMMIT');
  await a.query('BEGIN');
  assert.equal((await a.query(identity)).rowCount,0,'paused account must not pass stale identity check');
  await a.query('ROLLBACK');
 }finally{
  if(b){await b.query('ROLLBACK').catch(()=>{});b.release();}
  if(a){
   await a.query('ROLLBACK').catch(()=>{});
   try{
    if(created){
     await assertTestConnection(a,target,USER);
     await a.query(`SET search_path TO ${q}, pg_catalog`);
     oid=(await assertOwnedTestSchema(a,target,schema,USER)).toString();
     await assertOwnedTestSchema(a,target,schema,USER,oid);
     await a.query(`DROP SCHEMA ${q} CASCADE`);
    }
   }finally{a.release();}
  }
  await pool.end();
 }
});
