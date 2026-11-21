'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
// Only a fake DB is injected. Never import the live db/credentials.
const dbPath=require.resolve('../db');
const previous=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{connect:()=>{throw Error('production connection forbidden');}}};
const {createBooking}=require('../controllers/bookingsController');
after(()=>{if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];});
const DATE='2035-01-01T12:00:00+05:00';
function fixture({commitFails=false,rollbackFails=false,failCode='08006',earlyReplay=false}={}){
 const calls=[],releases=[];
 const clock=new Date('2026-11-18T00:00:00Z');
 const user={role:'customer',profileId:10,accountId:100};
 const booking={id:49,customer_id:10,barber_id:30,service_id:40,
   booking_time:DATE,duration_minutes:30,status:'confirmed'};
 const client={
   async query(sql,args=[]){
     calls.push(sql);
     if(sql==='COMMIT'&&commitFails)throw Object.assign(Error('private database network detail'),{code:failCode});
     if(sql==='ROLLBACK'&&rollbackFails)throw Error('socket lost');
     if(/^(BEGIN|SET LOCAL|ROLLBACK|COMMIT)/.test(sql))return {rows:[],rowCount:0};
     if(sql.startsWith('SELECT user_id FROM customers'))return {rows:[{user_id:100}],rowCount:1};
     if(sql.startsWith("SELECT id FROM users WHERE id=$1 AND role='customer'"))return {rows:[{id:100}],rowCount:1};
     if(sql.startsWith('SELECT k.fingerprint,b.*'))return earlyReplay
        ?{rows:[{...booking,fingerprint:require('../services/bookingIdempotency').fingerprint(30,[40],DATE)}],rowCount:1}
        :{rows:[],rowCount:0};
     if(sql.startsWith('SELECT service_id AS id,service_name AS name'))return {rows:[{id:40,name:'Old service',price:'50000.00',duration_minutes:30}],rowCount:1};
     if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};
     if(sql.startsWith('SELECT verification_status'))return {rows:[{verification_status:'approved',accepting_bookings:true,now:clock}],rowCount:1};
     if(sql.startsWith('SELECT user_id FROM barbers'))return {rows:[{user_id:200}],rowCount:1};
     if(sql.startsWith('SELECT id FROM users WHERE id=$1 AND deactivated_at IS NULL'))return {rows:[{id:200}],rowCount:1};
     if(sql.startsWith('SELECT id, duration_minutes'))return {rows:[{id:40,duration_minutes:30}],rowCount:1};
     if(sql.includes('AS fits FROM ustara_effective_day_schedule'))return {rows:[{fits:true}],rowCount:1};
     if(sql.startsWith('SELECT id,booking_time,booking_time +'))return {rows:[],rowCount:0};
     if(sql.startsWith('SELECT id FROM bookings WHERE customer_id'))return {rows:[],rowCount:0};
     if(sql.startsWith('SELECT clock_timestamp()'))return {rows:[{now:clock}],rowCount:1};
     if(sql.startsWith('INSERT INTO bookings'))return {rows:[booking],rowCount:1};
     if(sql.startsWith('INSERT INTO booking_request_keys'))return {rows:[],rowCount:1};
     throw Error('Unexpected legacy SQL: '+sql);
   },
   release(discard){releases.push(Boolean(discard));},
 };
 const db={
   connect:async()=>client,
   async query(sql){
     if(sql.includes("to_regclass('booking_services')"))return {rows:[{ready:false}],rowCount:1};
     if(sql.includes("to_regclass('booking_request_keys')"))return {rows:[{ready:true}],rowCount:1};
     throw Error('Unexpected pool query: '+sql);
   }
 };
 const req={user,body:{barber_id:30,service_id:40,booking_time:DATE,
   ...(earlyReplay?{request_id:'11111111-1111-4111-8111-111111111111'}:{})}};
 const res={statusCode:200,body:null,status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;}};
 return {db,req,res,calls,releases};
}
for(const rollbackFails of [false,true]){
 test(`legacy booking COMMIT failure discards connection (rollback fails=${rollbackFails})`,async()=>{
  const f=fixture({commitFails:true,rollbackFails});
  const original=console.error;console.error=()=>{};
  try{await createBooking(f.req,f.res,null,f.db,async()=>{});}finally{console.error=original;}
  assert.equal(f.res.statusCode,503);
  assert.equal(f.res.body.code,'booking_result_unknown');
  assert.doesNotMatch(JSON.stringify(f.res.body),/private database network detail/);
  assert.ok(f.calls.includes('COMMIT'));
  assert.equal(f.calls.includes('ROLLBACK'),false);
  assert.deepEqual(f.releases,[true]);
 });
}
test('legacy replay COMMIT failure discards connection and never reports success',async()=>{
 const f=fixture({commitFails:true,earlyReplay:true});
 const original=console.error;console.error=()=>{};
 try{await createBooking(f.req,f.res,null,f.db,async()=>{});}finally{console.error=original;}
 assert.equal(f.res.statusCode,503);
  assert.equal(f.res.body.code,'booking_result_unknown');
 assert.ok(f.calls.includes('COMMIT'));
 assert.equal(f.calls.includes('ROLLBACK'),false);
 assert.deepEqual(f.releases,[true]);
});
test('legacy COMMIT success releases healthy connection once and responds 201',async()=>{
 const f=fixture();
 await createBooking(f.req,f.res,null,f.db,async()=>{});
 assert.equal(f.res.statusCode,201);assert.deepEqual(f.releases,[false]);
 assert.equal(f.calls.at(-1),'COMMIT');
});
