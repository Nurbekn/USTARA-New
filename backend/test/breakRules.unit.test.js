'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers,validateIntervals}=require('../controllers/breakRulesController');
const {FIT_SQL,DAY_SQL,INVALID_BOOKING_SQL,withBreakBusy}=require('../services/calendarSchedule');
function futureDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+30*86400000));}
const rows=(data=[])=>({rows:data,rowCount:data.length});
function harness({conflict=false}={}){
  const statements=[];let released=0;
  const client={async query(sql,args=[]){statements.push({sql,args});
    if(sql.includes('SELECT b.id FROM barbers b JOIN users u'))return rows([{id:7}]);
    if(sql.includes('::date::text AS today'))return rows([{today:'2026-01-01'}]);
    if(sql.startsWith('SELECT b.id FROM bookings b'))return rows(conflict?[{id:88}]:[]);
    return rows();
  },release(){released++;}};
  const db={connect:async()=>client,query:async()=>rows()};
  const handlers=createHandlers(db);
  async function call(name,body={},role='barber'){
    const state={status:200};const res={status(code){state.status=code;return this;},json(v){state.body=v;return this;},set(){return this;}};
    await handlers[name]({user:{role,profileId:7,id:12},body},res);
    return state;
  }
  return {call,statements,get released(){return released;}};
}
test('accept multiple separate breaks, reject overlaps/invalid 5 minute steps',()=>{
  assert.deepEqual(validateIntervals([{start:'14:00',end:'15:00'},{start:'12:00',end:'13:00'}]),
    [{start:'12:00',end:'13:00'},{start:'14:00',end:'15:00'}]);
  for(const bad of [
    [{start:'12:00',end:'13:00'},{start:'12:30',end:'14:00'}],
    [{start:'12:01',end:'12:30'}],[{start:'14:00',end:'13:00'}],
    Array(9).fill({start:'12:00',end:'13:00'})
  ])assert.throws(()=>validateIntervals(bad),{status:400});
});
test('weekly update under lock checks all future active bookings before commit',async()=>{
  const h=harness();const r=await h.call('weekly',{day_of_week:1,breaks:[{start:'12:00',end:'12:30'},{start:'14:00',end:'14:15'}]});
  assert.equal(r.status,200);assert.equal(r.body.saved,2);
  const sql=h.statements.map(x=>x.sql);
  assert.ok(sql.findIndex(x=>x.includes('pg_advisory_xact_lock'))<sql.findIndex(x=>x.startsWith('DELETE FROM barber_weekly_breaks')));
  assert.equal(h.statements.filter(x=>x.sql.startsWith('INSERT INTO barber_weekly_breaks')).length,2);
  assert.deepEqual(h.statements.find(x=>x.sql.startsWith('SELECT b.id FROM bookings b')).args,[7,null]);
  assert.equal(sql.at(-1),'COMMIT');assert.equal(h.released,1);
});
test('weekly update rejects existing appointments and rolls back all edits',async()=>{
  const h=harness({conflict:true});const r=await h.call('weekly',{day_of_week:2,breaks:[{start:'10:00',end:'11:00'}]});
  assert.equal(r.status,409);assert.equal(r.body.code,'existing_booking_conflict');
  assert.equal(h.statements.at(-1).sql,'ROLLBACK');
  assert.equal(h.statements.filter(x=>x.sql==='COMMIT').length,0);
});
test('date-specific multiple intervals validate selected date for active booking conflicts',async()=>{
  const h=harness();const date=futureDate();
  const r=await h.call('dated',{date,breaks:[{start:'12:00',end:'13:00'}]});
  assert.equal(r.status,200);
  assert.deepEqual(h.statements.find(x=>x.sql.startsWith('SELECT b.id FROM bookings b')).args,[7,[date]]);
  assert.ok(h.statements.some(x=>x.sql.startsWith('INSERT INTO barber_date_breaks')));
});
test('clearing a weekday by empty array still protects existing bookings',async()=>{
  const h=harness({conflict:true});
  const r=await h.call('weekly',{day_of_week:0,breaks:[]});
  assert.equal(r.status,409);
  assert.ok(h.statements.some(x=>x.sql.startsWith('DELETE FROM barber_weekly_breaks')));
  assert.equal(h.statements.at(-1).sql,'ROLLBACK');
});
test('invalid input and non-barber do not open transactions',async()=>{
  const h=harness();
  assert.equal((await h.call('weekly',{day_of_week:7,breaks:[]})).status,400);
  assert.equal((await h.call('dated',{date:'2023-11-18',breaks:[]})).status,400);
  assert.equal((await h.call('weekly',{day_of_week:1,breaks:[]},'customer')).status,403);
  assert.equal(h.statements.length,0);
});
test('slot reads and writes consult the shared union of all break intervals',()=>{
  for(const sql of [FIT_SQL,DAY_SQL,INVALID_BOOKING_SQL])assert.match(sql,/ustara_effective_breaks/);
  assert.deepEqual(withBreakBusy([{start:600,end:620}],{
    breaks:[{start:'12:00',end:'13:00'},{start:'15:00',end:'15:30'}],
    break_start:'11:00',break_end:'11:30',
  }),[{start:600,end:620},{start:720,end:780},{start:900,end:930}]);
  assert.deepEqual(withBreakBusy([],{breaks:[]}),[]);
});
test('new migration is ordered after v18 and preserves legacy exception breaks',()=>{
  const root=path.resolve(__dirname,'..');
  const sql=fs.readFileSync(path.join(root,'database/migrations/20261203_barber_break_rules.sql'),'utf8');
  const boot=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
  assert.match(sql,/CREATE TABLE barber_weekly_breaks/);
  assert.match(sql,/CREATE TABLE barber_date_breaks/);
  assert.match(sql,/CREATE FUNCTION ustara_effective_breaks/);
  assert.match(sql,/barber_calendar_exceptions e/);
  assert.ok(boot.indexOf('20261203_barber_break_rules.sql')>boot.indexOf('20261202_barber_calendar_exceptions.sql'));
  const verify=fs.readFileSync(path.join(root,'database/bootstrap/verify.sql'),'utf8');
  for(const value of ['barber_weekly_breaks','barber_date_breaks','20261203_barber_break_rules','ustara_effective_breaks(integer,date)'])assert.ok(verify.includes(value),value);
});
