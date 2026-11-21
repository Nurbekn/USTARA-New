'use strict';
// Explicit opt-in ONLY. Uses an isolated, approved local test database.
// No migrations, schema resets, DROP or application secrets are loaded.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {testTarget,assertTestConnection}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test'
  && process.env.USTARA_WALKIN_QUEUE_TESTS==='I_AUTHORIZE_TEST_DATA'
  && Boolean(process.env.USTARA_TEST_DATABASE_URL);
const TEST_ROLE='ustara_account_test';
const answer=()=>({statusCode:200,body:null,headers:{},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;},set(k,v){this.headers[k]=v;return this;}});
const nonce=()=>crypto.randomBytes(16).toString('hex');

test('v21 isolated PostgreSQL: FIFO queue replay, parallel call and audit',{
  skip:!enabled,timeout:90000,
},async t=>{
  const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA walk-in queue',[TEST_ROLE]);
  const database=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,
    ssl:false,application_name:'ustara_walkin_test',max:4,connectionTimeoutMillis:5000,
    options:'-c search_path=public -c timezone=UTC',statement_timeout:15000});
  let id, userId, phone;
  t.after(async()=>{
    try{
      if(id){
        const client=await database.connect();
        try{
          await assertTestConnection(client,target,TEST_ROLE);
          await client.query('BEGIN');
          await client.query('DELETE FROM walkin_queue WHERE barber_id=$1',[id]); // events cascade
          await client.query('DELETE FROM barber_working_hours WHERE barber_id=$1',[id]);
          await client.query('DELETE FROM barbers WHERE id=$1 AND user_id=$2',[id,userId]);
          await client.query('DELETE FROM users WHERE id=$1 AND phone=$2',[userId,phone]);
          await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
        finally{client.release();}
      }
    }finally{await database.end();}
  });
  const guard=await database.connect();
  try{
    await assertTestConnection(guard,target,TEST_ROLE);
    const check=await guard.query(`SELECT
       EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261204_walkin_queue_core') AS migrated,
       to_regclass('public.walkin_queue') IS NOT NULL AS queue_present,
       to_regclass('public.walkin_queue_events') IS NOT NULL AS audit_present`);
    assert.deepEqual(check.rows[0],{migrated:true,queue_present:true,audit_present:true},
      'Run reviewed v21 migration only on this explicit test database first');
  }finally{guard.release();}
  phone='+998'+String(crypto.randomInt(100000000,999999999));
  const client=await database.connect();
  try{
    await client.query('BEGIN');
    const u=await client.query("INSERT INTO users(phone,password,role) VALUES($1,$2,'barber') RETURNING id",[phone,'v21-disposable-test']);
    userId=u.rows[0].id;
    const b=await client.query(`INSERT INTO barbers(user_id,first_name,last_name,specialty,verification_status)
      VALUES($1,'Queue','Fixture','barber','approved') RETURNING id`,[userId]);
    id=b.rows[0].id;
    const day=await client.query("SELECT extract(dow FROM (clock_timestamp() AT TIME ZONE 'Asia/Tashkent'))::int AS day");
    await client.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,$2,'00:00','23:59')",[id,day.rows[0].day]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
  finally{client.release();}
  const dbPath=require.resolve('../db'),former=require.cache[dbPath];
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
  let handlers;
  try{({createHandlers:handlers}=require('../controllers/walkinQueueController'));}
  finally{if(former)require.cache[dbPath]=former;else delete require.cache[dbPath];}
  handlers=handlers(database);
  const actor={role:'barber',profileId:id,id:userId};
  async function send(method,body={},params={}){
    const res=answer();await handlers[method]({user:actor,body,params},res);return res;
  }
  const key1=nonce(),key2=nonce();
  const first=await send('join',{request_id:key1,label:'Mehmon A'});
  const retry=await send('join',{request_id:key1,label:'Mehmon A'});
  const second=await send('join',{request_id:key2,label:'Mehmon B'});
  assert.equal(first.statusCode,201);assert.equal(retry.body.replayed,true);
  assert.equal(retry.body.entry.id,first.body.entry.id);assert.equal(second.statusCode,201);
  const mixed=await send('join',{request_id:key1,label:'Wrong'});
  assert.equal(mixed.statusCode,409);
  const [callA,callB]=await Promise.all([send('callNext'),send('callNext')]);
  assert.equal(callA.statusCode,200);assert.equal(callB.statusCode,200);
  assert.equal(callA.body.entry.id,first.body.entry.id);
  assert.equal(callB.body.entry.id,first.body.entry.id);
  assert.equal([callA.body.replayed,callB.body.replayed].filter(Boolean).length,1);
  const invalid=await send('finish',{status:'served'},{id:second.body.entry.id});
  assert.equal(invalid.statusCode,409);
  const finish=await send('finish',{status:'served'},{id:first.body.entry.id});
  assert.equal(finish.statusCode,200);
  const next=await send('callNext');assert.equal(next.body.entry.id,second.body.entry.id);
  const missed=await send('finish',{status:'missed'},{id:second.body.entry.id});
  assert.equal(missed.statusCode,200);
  const empty=await send('callNext');assert.equal(empty.statusCode,404);
  const dbRows=await database.query(`SELECT action,count(*)::int AS total FROM walkin_queue_events
    WHERE entry_id IN ($1,$2) GROUP BY action`,[first.body.entry.id,second.body.entry.id]);
  assert.deepEqual(Object.fromEntries(dbRows.rows.map(r=>[r.action,r.total])),{joined:2,called:2,served:1,missed:1});
});
