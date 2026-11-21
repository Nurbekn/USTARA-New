'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {recoverBooking}=require('../services/bookingRecovery');
const UUID='550e8400-e29b-41d4-a716-446655440000';
const user={role:'customer',profileId:11,accountId:24};
function harness({found=false,snapshots=false}={}){
  const calls=[];
  return {calls,db:{query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.includes('to_regclass'))return {rows:[{ready:sql.includes('booking_request_keys')?true:snapshots}]};
    if(sql.includes('JOIN bookings b'))return found
      ? {rowCount:1,rows:[{id:81,customer_id:11,barber_id:23,service_id:34,status:'confirmed',booking_time:'2030-01-07T05:00:00Z',duration_minutes:30,total_price:'50000.00'}]}
      : {rowCount:0,rows:[]};
    if(sql.includes('FROM booking_services'))return {rowCount:1,rows:[{booking_id:81,id:34,name:'Historical',price:'50000.00',duration_minutes:30}]};
    throw Error('Unexpected query');
  }}};
}
test('v82: unknown result is explicitly uncertain and read-only',async()=>{
  const {calls,db}=harness();
  assert.deepEqual(await recoverBooking(db,user,UUID),{found:false,uncertain:true});
  assert.equal(calls.filter(x=>x.sql.includes('JOIN bookings b')).length,1);
  assert.deepEqual(calls.find(x=>x.sql.includes('JOIN bookings b')).params,[11,UUID]);
  for(const c of calls) assert.doesNotMatch(c.sql,/\b(INSERT|UPDATE|DELETE|COMMIT)\b/i);
});
test('v82: database lookup is scoped to requester in both key and booking tables',async()=>{
  const {db,calls}=harness({found:true});
  const result=await recoverBooking(db,user,UUID);
  assert.equal(result.found,true);assert.equal(result.data.id,81);
  const lookup=calls.find(x=>x.sql.includes('JOIN bookings b'));
  assert.match(lookup.sql,/k\.customer_id=\$1/);
  assert.match(lookup.sql,/b\.customer_id=\$1/);
});
test('v82: snapshot is not replaced by current catalog data',async()=>{
  const {db}=harness({found:true,snapshots:true});
  const result=await recoverBooking(db,user,UUID);
  assert.equal(result.data.service_name,'Historical');
  assert.equal(result.data.services[0].price,'50000.00');
});
test('v82: cache-control no-store set before recovery, including error responses',()=>{
  const source=readFileSync(join(__dirname,'../controllers/bookingsController.js'),'utf8');
  const start=source.indexOf('async function getBookingRecovery(');
  const end=source.indexOf('//Barcha bookinglarni olish',start);
  const handler=source.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.ok(handler.indexOf("res.set('Cache-Control','no-store')")>=0);
  assert.ok(handler.indexOf("res.set('Cache-Control','no-store')")<handler.indexOf('try {'));
  assert.match(handler,/code:'recovery_unavailable'/);
});
test('v82: missing idempotency schema does not perform booking lookup',async()=>{
  const calls=[];const db={query:async(sql)=>{calls.push(sql);return {rows:[{ready:false}]};}};
  await assert.rejects(recoverBooking(db,user,UUID),{status:503,code:'migration_required'});
  assert.equal(calls.length,1);
});
test('v82: non-customer and out-of-range profile cannot query database',async()=>{
  const {db,calls}=harness();
  for(const actor of [null,{...user,role:'barber'},{...user,profileId:2147483648},{...user,profileId:0}])
    await assert.rejects(recoverBooking(db,actor,UUID),{status:403});
  assert.equal(calls.length,0);
});
