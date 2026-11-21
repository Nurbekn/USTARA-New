'use strict';
// Opt-in integration test: creates disposable queue users on a dedicated test DB.
// Never installs schema or touches production. No auto-execution by unit scripts.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {testTarget,assertTestConnection}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test'
  && process.env.USTARA_V96_QUEUE_DB_TESTS==='I_AUTHORIZE_TEST_DATA'
  && Boolean(process.env.USTARA_TEST_DATABASE_URL);
const TEST_ROLE='ustara_account_test';
const response=()=>({statusCode:200,body:null,headers:{},status(n){this.statusCode=n;return this},json(b){this.body=b;return this},set(k,v){this.headers[k]=v;return this}});
test('v96 staging PostgreSQL: observed head / finish state across concurrent connections',{
  skip:!enabled,timeout:90000,
},async t=>{
  const {Pool}=require('pg');
  const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA v96 queue race',[TEST_ROLE]);
  const database=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,ssl:false,
    application_name:'ustara_v96_queue_test',max:4,connectionTimeoutMillis:5000,
    options:'-c search_path=public -c timezone=UTC',statement_timeout:15000});
  let barberId,userId,phone;
  t.after(async()=>{
    try{if(barberId){const c=await database.connect();try{
      await assertTestConnection(c,target,TEST_ROLE);await c.query('BEGIN');
      await c.query('DELETE FROM walkin_queue WHERE barber_id=$1',[barberId]);
      await c.query('DELETE FROM barber_working_hours WHERE barber_id=$1',[barberId]);
      await c.query('DELETE FROM barbers WHERE id=$1 AND user_id=$2',[barberId,userId]);
      await c.query('DELETE FROM users WHERE id=$1 AND phone=$2',[userId,phone]);
      await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}}
    finally{await database.end();}
  });
  const check=await database.connect();try{
    await assertTestConnection(check,target,TEST_ROLE);
    const version=await check.query("SELECT 1 FROM ustara_schema_migrations WHERE version='20261215_walkin_arrived'");
    assert.equal(version.rowCount,1,'Review and apply queue migrations in disposable test DB first');
  }finally{check.release();}
  phone='+998'+String(crypto.randomInt(100000000,999999999));
  const setup=await database.connect();try{
    await setup.query('BEGIN');
    userId=(await setup.query("INSERT INTO users(phone,password,role) VALUES($1,'v96-test-only','barber') RETURNING id",[phone])).rows[0].id;
    barberId=(await setup.query(`INSERT INTO barbers(user_id,first_name,last_name,specialty,verification_status)
      VALUES($1,'Queue','Precondition','barber','approved') RETURNING id`,[userId])).rows[0].id;
    const dow=(await setup.query("SELECT extract(dow FROM (clock_timestamp() AT TIME ZONE 'Asia/Tashkent'))::int AS d")).rows[0].d;
    await setup.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,$2,'00:00','23:59')",[barberId,dow]);
    await setup.query('COMMIT');
  }catch(e){await setup.query('ROLLBACK').catch(()=>{});throw e;}finally{setup.release();}
  const dbPath=require.resolve('../db'),old=require.cache[dbPath];
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
  let createHandlers;try{({createHandlers}=require('../controllers/walkinQueueController'));}
  finally{if(old)require.cache[dbPath]=old;else delete require.cache[dbPath];}
  const api=createHandlers(database),staff={role:'barber',id:userId,profileId:barberId};
  async function send(method,body={},params={}){
    const res=response();await api[method]({user:staff,body,params},res);return res;
  }
  const a=await send('join',{request_id:crypto.randomBytes(16).toString('hex'),label:'Mijoz A'});
  const b=await send('join',{request_id:crypto.randomBytes(16).toString('hex'),label:'Mijoz B'});
  assert.deepEqual([a.statusCode,b.statusCode],[201,201]);
  const aId=Number(a.body.entry.id),bId=Number(b.body.entry.id);
  // A second device changes the head after the first device observed it.
  const reorder=await send('reorder',{direction:'up',reason:'Test uchun navbat tartibini almashtirish',expected_order:[aId,bId]},{id:bId});
  assert.equal(reorder.statusCode,200);
  const stale=await send('callNext',{expected_next_id:aId});
  assert.equal(stale.statusCode,409);
  const [first,duplicate]=await Promise.all([
    send('callNext',{expected_next_id:bId}),send('callNext',{expected_next_id:bId}),
  ]);
  assert.deepEqual([first.statusCode,duplicate.statusCode],[200,200]);
  assert.equal(first.body.entry.id,b.body.entry.id);
  assert.equal([first.body.replayed,duplicate.body.replayed].filter(Boolean).length,1);
  const wrongCalled=await send('callNext',{expected_next_id:aId});assert.equal(wrongCalled.statusCode,409);
  const [arrival,rearrival]=await Promise.all([
    send('markArrived',{expected_status:'called'},{id:bId}),
    send('markArrived',{expected_status:'called'},{id:bId}),
  ]);
  assert.deepEqual([arrival.statusCode,rearrival.statusCode],[200,200]);
  assert.equal([arrival.body.replayed,rearrival.body.replayed].filter(Boolean).length,1);
  assert.equal(arrival.body.entry.status,'arrived');
  assert.ok(arrival.body.entry.arrived_at);
  const prematureAfterArrival=await send('callNext',{expected_next_id:aId});
  assert.equal(prematureAfterArrival.statusCode,409);
  assert.equal(prematureAfterArrival.body.code,'customer_arrived');
  const invalidMissAfterArrival=await send('finish',{status:'missed',expected_status:'arrived'},{id:bId});
  assert.equal(invalidMissAfterArrival.statusCode,409);
  const [start,restart]=await Promise.all([
    send('startService',{expected_status:'arrived'},{id:bId}),
    send('startService',{expected_status:'arrived'},{id:bId}),
  ]);
  assert.deepEqual([start.statusCode,restart.statusCode],[200,200]);
  assert.equal([start.body.replayed,restart.body.replayed].filter(Boolean).length,1);
  assert.equal(start.body.entry.status,'in_service');
  assert.ok(start.body.entry.started_at);
  const premature=await send('callNext',{expected_next_id:aId});
  assert.equal(premature.statusCode,409);
  assert.equal(premature.body.code,'service_in_progress');
  const invalidMiss=await send('finish',{status:'missed',expected_status:'in_service'},{id:bId});
  assert.equal(invalidMiss.statusCode,409);
  const staleFinish=await send('finish',{status:'served',expected_status:'called'},{id:bId});
  assert.equal(staleFinish.statusCode,409);
  const finish=await send('finish',{status:'served',expected_status:'in_service'},{id:bId});
  assert.equal(finish.statusCode,200);
  const replay=await send('finish',{status:'served',expected_status:'in_service'},{id:bId});
  assert.equal(replay.statusCode,200);assert.equal(replay.body.replayed,true);
  const next=await send('callNext',{expected_next_id:aId});assert.equal(next.statusCode,200);
  const missed=await send('finish',{status:'missed',expected_status:'called'},{id:aId});assert.equal(missed.statusCode,200);
  const audit=await database.query('SELECT action,count(*)::int AS n FROM walkin_queue_events WHERE entry_id IN ($1,$2) GROUP BY action',[aId,bId]);
  assert.deepEqual(Object.fromEntries(audit.rows.map(r=>[r.action,r.n])),{joined:2,called:2,arrived:1,started:1,served:1,missed:1});
  // v97: Two staff devices race to mark arrival versus marking a called
  // guest as left. Exactly one transition may win; loser sees stale state.
  const third=await send('join',{request_id:crypto.randomBytes(16).toString('hex'),label:'Mijoz C'});
  assert.equal(third.statusCode,201);
  const thirdId=Number(third.body.entry.id);
  assert.equal((await send('callNext',{expected_next_id:thirdId})).statusCode,200);
  const [raceArrive,raceLeave]=await Promise.all([
    send('markArrived',{expected_status:'called'},{id:thirdId}),
    send('finish',{status:'left',expected_status:'called'},{id:thirdId}),
  ]);
  assert.deepEqual([raceArrive.statusCode,raceLeave.statusCode].sort(),[200,409]);
  const thirdRow=(await database.query('SELECT status,arrived_at,finished_at FROM walkin_queue WHERE id=$1',[thirdId])).rows[0];
  if(thirdRow.status==='arrived'){
    assert.equal(raceArrive.statusCode,200);
    assert.ok(thirdRow.arrived_at);
    const afterArrival=await send('finish',{status:'left',expected_status:'arrived'},{id:thirdId});
    assert.equal(afterArrival.statusCode,200);
  }else{
    assert.equal(thirdRow.status,'left');
    assert.equal(raceLeave.statusCode,200);
    assert.equal(thirdRow.arrived_at,null);
  }
  const auditThird=await database.query('SELECT action,count(*)::int AS n FROM walkin_queue_events WHERE entry_id=$1 GROUP BY action',[thirdId]);
  const counts=Object.fromEntries(auditThird.rows.map(row=>[row.action,row.n]));
  assert.equal(counts.joined,1);assert.equal(counts.called,1);assert.equal(counts.left,1);
  assert.equal(counts.arrived||0,thirdRow.status==='arrived'?1:0);
  // v98: a still-waiting ticket left in the database from a previous day
  // must not reappear as a *current* queue entry after the day boundary.
  // All writes below are to this test's disposable barber and test database.
  const oldKey=crypto.randomBytes(16).toString('hex');
  const aged=await send('join',{request_id:oldKey,label:'Old guest'});
  assert.equal(aged.statusCode,201);
  const agedId=Number(aged.body.entry.id);
  const forced=await database.query(`UPDATE walkin_queue SET
    queue_date=(statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date - 1
    WHERE id=$1 AND barber_id=$2 AND status='waiting' RETURNING id`,[agedId,barberId]);
  assert.equal(forced.rowCount,1);
  const currentList=await send('list');
  assert.equal(currentList.statusCode,200);
  assert.ok(!currentList.body.active.some(item=>Number(item.id)===agedId));
  const oldRetry=await send('join',{request_id:oldKey,label:'Old guest'});
  assert.equal(oldRetry.statusCode,410);
  assert.equal(oldRetry.body.code,'queue_request_expired');
  const oldFinish=await send('finish',{status:'left',expected_status:'waiting'},{id:agedId});
  assert.equal(oldFinish.statusCode,409);
  const persisted=(await database.query('SELECT status,queue_date FROM walkin_queue WHERE id=$1',[agedId])).rows[0];
  assert.equal(persisted.status,'waiting');
});
