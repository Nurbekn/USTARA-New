'use strict';
const {test, after}=require('node:test');
const assert=require('node:assert/strict');
// Use a fake application pool; no real PostgreSQL connection or .env is loaded.
const dbPath=require.resolve('../db');
const previous=require.cache[dbPath];
require.cache[dbPath]={id:dbPath, filename:dbPath, loaded:true, exports:{}};
const {getModifySlots}=require('../controllers/bookingsController');
after(()=>{if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];});
function response(){return {
  statusCode:200, headers:{}, body:null,
  set(k,v){this.headers[k.toLowerCase()]=v;return this;},
  status(code){this.statusCode=code;return this;},
  json(body){this.body=body;return this;},
};}
function request(date='2035-01-01'){
  return {user:{role:'customer',profileId:10,accountId:100},params:{id:'88'},query:{date}};
}
test('private quote validation failure must also set no-store',async()=>{
  const res=response(),db={connect(){throw new Error('should not connect');}};
  await getModifySlots(request('invalid'),res,null,db);
  assert.equal(res.statusCode,400);
  assert.equal(res.headers['cache-control'],'no-store');
  assert.equal(res.body.code,'invalid_selection');
});
test('private quote success must set no-store before sending slots',async()=>{
  const client={
    async query(sql){
      if(/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql))return {rows:[],rowCount:0};
      if(sql.startsWith('SELECT c.id FROM customers c'))return {rows:[{id:10}],rowCount:1};
      if(sql.startsWith('SELECT barber_id,duration_minutes,booking_time,status'))return {rows:[{
        barber_id:30,duration_minutes:30,booking_time:'2035-01-01T07:00:00Z',status:'confirmed',
      }],rowCount:1};
      if(sql.startsWith('SELECT clock_timestamp()'))return {rows:[{now:'2026-11-20T06:00:00Z'}],rowCount:1};
      if(sql.startsWith('SELECT b.verification_status'))return {rows:[{
        verification_status:'approved',accepting_bookings:true,deactivated_at:null,
      }],rowCount:1};
      if(sql.startsWith('SELECT s.start_time'))return {rows:[{
        start_time:'09:00:00',end_time:'10:00:00',breaks:[],now_minutes:-1,
      }],rowCount:1};
      if(sql.includes('FROM bookings WHERE (barber_id=$1 OR customer_id=$4)'))return {rows:[],rowCount:0};
      throw Error('Unexpected query '+sql);
    },
    release() {},
  };
  const res=response();
  await getModifySlots(request(),res,null,{async connect(){return client;}});
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['cache-control'],'no-store');
  assert.equal(res.body.date,'2035-01-01');
  assert.ok(res.body.slots.length);
  assert.equal(res.body.customer_id,undefined);
});
