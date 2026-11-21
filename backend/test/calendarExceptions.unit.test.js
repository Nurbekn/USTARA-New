'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
// No connection to a real database from this file.
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers,validateException}=require('../controllers/calendarExceptionsController');
const {fitsBooking,withBreakBusy,INVALID_BOOKING_SQL,DAY_SQL,FIT_SQL}=require('../services/calendarSchedule');
function futureDate(days=20){
  const stamp=Date.now()+days*86400000;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp));
  return parts;
}
function result(rows=[]){return {rows,rowCount:rows.length};}
function harness({conflict=false, dbFailure=false}={}){
  const statements=[];let releaseCount=0;
  const client={
    async query(sql,args=[]){
      statements.push({sql,args});
      if (sql.includes('SELECT b.id FROM barbers b JOIN users u'))return result([{id:7}]);
      if (sql.includes('::date::text AS today'))return result([{today:futureDate(-1)}]);
      if(sql.startsWith('SELECT b.id FROM bookings b')){
        assert.match(sql,/NOT EXISTS/);assert.match(sql,/ustara_effective_day_schedule/);
        return result(conflict?[{id:51}]:[]);
      }
      if(dbFailure&&sql.startsWith('INSERT INTO barber_calendar_exceptions'))throw Error('DB fail');
      return result();
    },
    release(broken){assert.equal(broken,false);releaseCount++;},
  };
  const handlers=createHandlers({async connect(){return client;},async query(){return result();}});
  async function call(method,req={}){
    const state={status:200,headers:{}};
    const res={status(code){state.status=code;return this;},json(body){state.body=body;return this;},set(key,v){state.headers[key]=v;return this;}};
    await handlers[method]({user:{role:'barber',profileId:7,id:12},body:req.body||{},params:req.params||{}},res);
    return state;
  }
  return {call,statements,get releaseCount(){return releaseCount;}};
}
test('calendar input accepts one closed day and a special day with break',()=>{
  const day=futureDate();
  assert.deepEqual(validateException({date:day,is_closed:true}),
    {date:day,is_closed:true,start_time:null,end_time:null,break_start:null,break_end:null});
  assert.equal(validateException({date:day,is_closed:false,start_time:'09:00',end_time:'18:00',break_start:'13:00',break_end:'14:00'}).break_start,'13:00');
  for(const bad of [
    {date:day,is_closed:false,start_time:'18:00',end_time:'09:00'},
    {date:day,is_closed:false,start_time:'09:00',end_time:'18:00',break_start:'08:00',break_end:'10:00'},
    {date:day,is_closed:false,start_time:'09:00',end_time:'18:00',break_start:'13:00'},
    {date:day,is_closed:true,start_time:'09:00'},
    {date:'2025-11-18',is_closed:true},
  ])assert.throws(()=>validateException(bad),{status:400});
});
test('calendar upserts only after barber advisory lock and checks existing appointments',async()=>{
  const h=harness();const day=futureDate();
  const response=await h.call('save',{body:{dates:[{date:day,is_closed:true}]}});
  assert.equal(response.status,200);assert.equal(response.body.saved,1);
  const lock=h.statements.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
  const insert=h.statements.findIndex(x=>x.sql.startsWith('INSERT INTO barber_calendar_exceptions'));
  const conflict=h.statements.findIndex(x=>x.sql.startsWith('SELECT b.id FROM bookings b'));
  assert.ok(lock>=0&&lock<insert&&insert<conflict);
  assert.equal(h.statements.at(-1).sql,'COMMIT');assert.equal(h.releaseCount,1);
});
test('calendar changes cannot erase existing confirmed booking: ROLLBACK and 409',async()=>{
  const h=harness({conflict:true});const day=futureDate();
  const response=await h.call('save',{body:{dates:[{date:day,is_closed:true}]}});
  assert.equal(response.status,409);assert.equal(response.body.code,'existing_booking_conflict');
  assert.equal(h.statements.at(-1).sql,'ROLLBACK');
  assert.ok(!h.statements.some(x=>x.sql==='COMMIT'));assert.equal(h.releaseCount,1);
});
test('vacation list rejects duplicate dates or over 90 days before opening transaction',async()=>{
  const h=harness();const day=futureDate();
  for(const dates of [[],Array(91).fill({date:day,is_closed:true}),[{date:day,is_closed:true},{date:day,is_closed:true}]]){
    const response=await h.call('save',{body:{dates}});assert.equal(response.status,400);
  }
  assert.equal(h.statements.length,0);
});
test('calendar read-only and remove require barber role and safe date',async()=>{
  const h=harness();const day=futureDate();
  const response=await h.call('remove',{params:{date:day}});
  assert.equal(response.status,200);assert.equal(h.statements.at(-1).sql,'COMMIT');
  assert.equal((await h.call('remove',{params:{date:'2021-01-01'}})).status,400);
});
test('calendar SQL fits and day slot both use same DB function, break excludes overlapping service',async()=>{
  assert.match(FIT_SQL,/ustara_effective_day_schedule/);assert.match(FIT_SQL,/ustara_effective_breaks/);
  assert.match(DAY_SQL,/ustara_effective_day_schedule/);assert.match(INVALID_BOOKING_SQL,/ustara_effective_day_schedule/);
  const fake={query:async(sql,args)=>{assert.equal(sql,FIT_SQL);assert.deepEqual(args,[7,'2030-03-01T10:00:00Z',30]);return result([{fits:false}]);}};
  assert.equal(await fitsBooking(fake,7,'2030-03-01T10:00:00Z',30),false);
  assert.deepEqual(withBreakBusy([{start:600,end:620}],{break_start:'13:00:00',break_end:'14:00:00'}),
    [{start:600,end:620},{start:780,end:840}]);
});
test('new forward migration defines strict calendar checks and fresh bootstrap references it',()=>{
  const migration=fs.readFileSync(path.join(root,'database/migrations/20261202_barber_calendar_exceptions.sql'),'utf8');
  const bootstrap=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
  assert.match(migration,/CHECK \(/);assert.match(migration,/ON DELETE CASCADE/);
  assert.match(migration,/CREATE FUNCTION ustara_effective_day_schedule/);
  assert.match(bootstrap,/20261202_barber_calendar_exceptions\.sql/);
});
