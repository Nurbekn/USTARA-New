'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { modificationInput, modificationSlots, modifyCustomerBooking } = require('../services/bookingModification');

const actor = { role:'customer', profileId:10, accountId:100 };
const base = { booking_time:'2035-01-01T13:00:00+05:00', expected_booking_time:'2035-01-01T12:00:00+05:00' };
const booking = {id:88,customer_id:10,barber_id:30,status:'confirmed',
  booking_time:'2035-01-01T07:00:00Z',duration_minutes:30,service_id:40,total_price:'50000.00'};
function mocked({accountActive=true, available=true, duration=30, clock='2026-11-20T00:00:00Z',
  paused=false, status='confirmed', serviceDuration=30, bookingTime=booking.booking_time}={}){
  const calls=[], releases=[];
  const client = {
    async query(sql,args=[]){
      calls.push({sql,args});
      if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql))return {rows:[],rowCount:0};
      if (sql.startsWith('SELECT c.id FROM customers c')) return accountActive
        ? {rows:[{id:10}],rowCount:1}:{rows:[],rowCount:0};
      if (sql.startsWith('SELECT barber_id,duration_minutes,booking_time,status')) return {
        rows:[{...booking,duration_minutes:duration,booking_time:bookingTime,status}],rowCount:1};
      if (sql.startsWith('SELECT clock_timestamp()')) return {rows:[{now:clock}],rowCount:1};
      if (sql.startsWith('SELECT b.verification_status')) return {
        rows:[{verification_status:available?'approved':'pending',accepting_bookings:!paused,deactivated_at:null}],rowCount:1};
      if (sql.startsWith('SELECT id,name,price,duration_minutes')) return {
        rows:[{id:41,name:'Soqol',price:'55000.00',duration_minutes:serviceDuration}],rowCount:1};
      if (sql.startsWith('SELECT s.start_time,s.end_time,s.break_start'))return {
        rows:[{start_time:'09:00:00',end_time:'17:00:00',now_minutes:-1,breaks:[]}],rowCount:1};
      if (sql.includes('FROM bookings WHERE (barber_id=$1 OR customer_id=$4)'))return {rows:[],rowCount:0};
      throw new Error('Unexpected SQL: '+sql);
    },
    release(flag){releases.push(Boolean(flag));},
  };
  return {pool:{async connect(){return client;}}, calls, releases};
}

for(const bad of [undefined,null,0,-1,2147483648,'100',Number.MAX_SAFE_INTEGER]){
  test('quote rejects missing/invalid signed-in account ID '+String(bad),async()=>{
    const db=mocked();
    await assert.rejects(modificationSlots(db.pool,{...actor,accountId:bad,id:undefined},88,'2035-01-01'),
      {status:403,code:'forbidden'});
    assert.deepEqual(db.calls,[]);
  });
}
for(const bad of [undefined,null,0,-1,2147483648,'100']){
  test('PATCH rejects missing/invalid signed-in account ID '+String(bad),()=>{
    assert.throws(()=>modificationInput(88,{...actor,accountId:bad,id:undefined},base),{status:403,code:'forbidden'});
  });
}
for(const wrong of [
  {...base, expected_booking_time:'2035-01-01T12:02:00+05:00'},
  {...base, expected_booking_time:'2035-01-01T12:00:01+05:00'},
  {...base, expected_booking_time:'2035-01-01T12:00:00.001+05:00'},
  {...base, booking_time:'2035-01-01T13:01:00+05:00'},
]){
  test('PATCH refuses non-5-minute old/new timestamp',()=>{
    assert.throws(()=>modificationInput(88,actor,wrong),{status:400,code:'invalid_booking_time'});
  });
}
test('quote rechecks active customer account inside its read-only transaction',async()=>{
  const db=mocked({accountActive:false});
  await assert.rejects(modificationSlots(db.pool,actor,88,'2035-01-01'),{status:401,code:'invalid_session'});
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
  assert.equal(db.calls.some(x=>x.sql.startsWith('SELECT barber_id,duration_minutes')),false);
  assert.deepEqual(db.releases,[false]);
});
test('quote never fetches private replacement price for paused barber',async()=>{
  const db=mocked({paused:true});
  const result=await modificationSlots(db.pool,actor,88,'2035-01-01',[41]);
  assert.deepEqual(result,{date:'2035-01-01',duration:30,working:false,accepting_bookings:false,slots:[]});
  assert.equal(db.calls.some(x=>x.sql.startsWith('SELECT id,name,price,duration_minutes')),false);
  assert.deepEqual(db.releases,[false]);
});
test('quote never fetches replacement prices for unapproved barber',async()=>{
  const db=mocked({available:false});
  const result=await modificationSlots(db.pool,actor,88,'2035-01-01',[41]);
  assert.equal(result.total_price,undefined);
  assert.equal(db.calls.some(x=>x.sql.startsWith('SELECT id,name,price,duration_minutes')),false);
});
test('quote only reads replacement price after authorization and approval',async()=>{
  const db=mocked();
  const result=await modificationSlots(db.pool,actor,88,'2035-01-01',[41]);
  const authorized=db.calls.findIndex(x=>x.sql.startsWith('SELECT c.id FROM customers c'));
  const approved=db.calls.findIndex(x=>x.sql.startsWith('SELECT b.verification_status'));
  const quoted=db.calls.findIndex(x=>x.sql.startsWith('SELECT id,name,price,duration_minutes'));
  assert.ok(authorized>=0 && authorized<approved && approved<quoted);
  assert.equal(result.total_price,'55000.00');
  assert.ok(result.slots.length>0);
});
test('quote refuses a past Tashkent calendar day without computing slots',async()=>{
  const db=mocked({clock:'2035-01-02T00:00:00Z',bookingTime:'2035-01-03T07:00:00Z'});
  await assert.rejects(modificationSlots(db.pool,actor,88,'2035-01-01'),{status:409,code:'booking_date_expired'});
  assert.equal(db.calls.some(x=>x.sql.startsWith('SELECT s.start_time')),false);
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
});
for (const duration of [0,-5,10.5,1205,60000]){
  test('quote rejects corrupt stored booking duration '+duration,async()=>{
    const db=mocked({duration});
    await assert.rejects(modificationSlots(db.pool,actor,88,'2035-01-01'),{status:409,code:'booking_not_editable'});
    assert.equal(db.calls.some(x=>x.sql.startsWith('SELECT s.start_time')),false);
  });
}
test('quote rejects replacement services with a duration exceeding 20 hours',async()=>{
  const db=mocked({serviceDuration:1205});
  await assert.rejects(modificationSlots(db.pool,actor,88,'2035-01-01',[41]),{status:503,code:'invalid_duration'});
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
});
for(const clock of ['invalid',null]){
  test('quote refuses corrupted database clock '+String(clock),async()=>{
    const db=mocked({clock});
    await assert.rejects(modificationSlots(db.pool,actor,88,'2035-01-01'),{status:503,code:'invalid_booking_time'});
    assert.equal(db.calls.at(-1).sql,'ROLLBACK');
  });
}
test('quote never leaks its customer profile or database metadata in returned slots',async()=>{
  const db=mocked();const row=await modificationSlots(db.pool,actor,88,'2035-01-01');
  assert.deepEqual(Object.keys(row).sort(),['accepting_bookings','date','duration','slots','working']);
  assert.ok(row.slots.every(slot=>Object.keys(slot).sort().join(',')==='end,start'));
});
