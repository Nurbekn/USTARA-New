'use strict';
const { test, after }=require('node:test');
const assert=require('node:assert/strict');
const {createMultiBooking,multiSlots}=require('../services/multiBooking');
const {modifyCustomerBooking,modificationSlots,modificationInput}=require('../services/bookingModification');
const {fingerprint}=require('../services/bookingIdempotency');
const actor={role:'customer',profileId:10,accountId:100};
const when='2035-01-01T12:00:00+05:00';
const quoted={barber_id:30,service_ids:[40],booking_time:when,
  expected_total_price:'50000.00',expected_duration_minutes:30};
function database({commitFails=false,rollbackFails=false,early='none',replay=false,mode='create'}={}){
  const calls=[],releases=[];
  let inserted=0;
  const service={id:40,name:'Test xizmat',price:'50000.00',duration_minutes:30};
  const booking={id:88,customer_id:10,barber_id:30,service_id:40,
    booking_time:when,duration_minutes:30,total_price:'50000.00',status:'confirmed'};
  const client={
    async query(sql,args=[]){
      calls.push(sql);
      if(sql==='COMMIT' && commitFails) throw Object.assign(Error('lost commit acknowledgement'),{code:'08006'});
      if(sql==='ROLLBACK' && rollbackFails)throw Error('lost rollback acknowledgement');
      if(/^(BEGIN|SET LOCAL|COMMIT|ROLLBACK)/.test(sql))return {rows:[],rowCount:0};
      if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};
      if(sql.startsWith('SELECT user_id FROM customers'))return {rows:[{user_id:100}],rowCount:1};
      if(sql.startsWith('SELECT c.id FROM customers c'))return {rows:[{id:10}],rowCount:1};
      if(sql.includes("role='customer' AND deactivated_at IS NULL"))return {rows:[{id:100}],rowCount:1};
      if(sql.startsWith('SELECT verification_status'))return {rows:[{verification_status:'approved',accepting_bookings:early!=='paused',now:new Date('2026-11-18T00:00:00Z')}],rowCount:1};
      if(sql.startsWith('SELECT user_id FROM barbers'))return {rows:[{user_id:200}],rowCount:1};
      if(sql.startsWith('SELECT id FROM users WHERE id=$1 AND deactivated_at IS NULL'))return {rows:[{id:200}],rowCount:1};
      if(sql.startsWith('SELECT id,name,price,duration_minutes'))return {rows:[service],rowCount:1};
      if(sql.includes('AS fits FROM ustara_effective_day_schedule'))return {rows:[{fits:true}],rowCount:1};
      if(sql.startsWith('SELECT id FROM bookings WHERE barber_id=$1 AND status IN'))return {rows:[],rowCount:0};
      if(sql.startsWith('SELECT id FROM bookings WHERE customer_id=$1'))return {rows:[],rowCount:0};
      if(sql.startsWith('SELECT clock_timestamp()'))return {rows:[{now:new Date('2026-11-18T00:00:00Z')}],rowCount:1};
      if(sql.startsWith('INSERT INTO bookings')){ inserted++;return {rows:[booking],rowCount:1}; }
      if(sql.startsWith('INSERT INTO booking_services'))return {rows:[],rowCount:1};
      if(sql.startsWith('SELECT k.fingerprint,b.*'))return replay
        ?{rows:[{...booking,fingerprint:fingerprint(30,[40],when)}],rowCount:1}:{rows:[],rowCount:0};
      if(sql.startsWith('SELECT service_id AS id,service_name AS name,price,duration_minutes'))return {rows:[service],rowCount:1};
      if(sql.startsWith('INSERT INTO booking_request_keys'))return {rows:[],rowCount:1};
      if(sql.includes('FROM barbers WHERE id=$1')&&sql.startsWith('SELECT verification_status'))return {rows:[{verification_status:'approved',accepting_bookings:early!=='paused'}],rowCount:1};
      if(sql.startsWith('SELECT s.start_time,s.end_time,s.break_start'))return {rows:early==='no-hours'?[]:[{start_time:'09:00:00',end_time:'18:00:00',now_minutes:0,breaks:[]}],rowCount:early==='no-hours'?0:1};
      if(sql.startsWith('SELECT EXTRACT(EPOCH FROM'))return {rows:[],rowCount:0};
      if(sql.startsWith('SELECT barber_id FROM bookings'))return {rows:[{barber_id:30}],rowCount:1};
      if(sql.startsWith('SELECT * FROM bookings'))return {rows:[booking],rowCount:1};
      if(sql.startsWith('SELECT b.verification_status'))return {rows:[{verification_status:'approved',accepting_bookings:early!=='paused',deactivated_at:null}],rowCount:1};
      if(sql.startsWith('SELECT service_id FROM booking_services'))return {rows:[{service_id:40}],rowCount:1};
      if(sql.startsWith('SELECT id FROM bookings WHERE barber_id=$1 AND id<>$4'))return {rows:[],rowCount:0};
      if(sql.startsWith('SELECT id FROM bookings WHERE customer_id=$1 AND id<>$4'))return {rows:[],rowCount:0};
      if(sql.startsWith('UPDATE bookings SET booking_time='))return {rows:[{...booking,booking_time:when}],rowCount:1};
      if(sql.startsWith('SELECT barber_id,duration_minutes,booking_time,status'))return {rows:[booking],rowCount:1};
      if(sql.startsWith('SELECT s.start_time,s.end_time'))return {rows:[],rowCount:0};
      throw Error(`Unexpected SQL in v80 fixture (${mode}): ${sql}`);
    },
    release(discard){releases.push(Boolean(discard));},
  };
  return {pool:{connect:async()=>client,query:async sql=>{
    if(sql.includes("to_regclass('booking_services')"))return {rows:[{ready:true}],rowCount:1};
    throw Error('Unexpected pool SQL '+sql);
  }},calls,releases,get inserted(){return inserted;}};
}
for(const rollbackFails of [false,true]){
  test(`createMultiBooking discards COMMIT-uncertain client; rollback fails=${rollbackFails}`,async()=>{
    const f=database({commitFails:true,rollbackFails});
    await assert.rejects(createMultiBooking(f.pool,actor,quoted),e=>e.code==='08006');
    assert.ok(f.calls.includes('COMMIT'));
    assert.equal(f.inserted,1);
    assert.equal(f.calls.at(-1),'ROLLBACK');
    assert.deepEqual(f.releases,[true]);
  });
  test(`reschedule discards COMMIT-uncertain client; rollback fails=${rollbackFails}`,async()=>{
    const f=database({commitFails:true,rollbackFails,mode:'modify'});
    await assert.rejects(modifyCustomerBooking(f.pool,actor,88,{
      booking_time:when.replace('12:00','13:00'), expected_booking_time:when,
    }),e=>e.code==='08006');
    assert.ok(f.calls.includes('COMMIT'));
    assert.equal(f.calls.at(-1),'ROLLBACK');
    assert.deepEqual(f.releases,[true]);
  });
}
test('successful new booking commits and returns healthy client to pool',async()=>{
  const f=database();const created=await createMultiBooking(f.pool,actor,quoted);
  assert.equal(created.id,88);assert.deepEqual(f.releases,[false]);
  assert.equal(f.calls.at(-1),'COMMIT');assert.equal(f.inserted,1);
});
test('idempotent replay COMMIT uncertainty never returns questionable connection',async()=>{
  const f=database({replay:true,commitFails:true});
  await assert.rejects(createMultiBooking(f.pool,actor,{...quoted,
    request_id:'11111111-1111-4111-8111-111111111111'}),e=>e.code==='08006');
  assert.equal(f.inserted,0);
  assert.deepEqual(f.releases,[true]);
});
test('idempotent replay success returns existing booking, does not insert',async()=>{
  const f=database({replay:true});
  const result=await createMultiBooking(f.pool,actor,{...quoted,
    request_id:'11111111-1111-4111-8111-111111111111'});
  assert.equal(result.replayed,true);
  assert.equal(f.inserted,0);
  assert.deepEqual(f.releases,[false]);
});
for(const early of ['paused','no-hours']){
  test(`public slots early ${early} COMMIT failure discards connection`,async()=>{
    const f=database({commitFails:true,early,mode:'slots'});
    await assert.rejects(multiSlots(f.pool,{barber_id:'30',service_ids:[40],date:'2035-01-01'}),e=>e.code==='08006');
    assert.deepEqual(f.releases,[true]);
  });
}
test('modification replay COMMIT failure discards connection',async()=>{
  const f=database({commitFails:true,mode:'modify'});
  // Mock DB already contains exactly the requested target time.
  await assert.rejects(modifyCustomerBooking(f.pool,actor,88,{
    booking_time:when,expected_booking_time:when.replace('12:00','11:00'),
  }),e=>e.code==='08006');
  assert.deepEqual(f.releases,[true]);
});
test('read-only modify-slots early COMMIT failure discards connection',async()=>{
  const f=database({commitFails:true,early:'paused',mode:'modify-slots'});
  await assert.rejects(modificationSlots(f.pool,actor,88,'2035-01-01'),e=>e.code==='08006');
  assert.deepEqual(f.releases,[true]);
});
for(const id of [0,-1,2147483648,Number.MAX_SAFE_INTEGER]){
  test(`booking modification rejects out-of-range ID ${id} before DB`,()=>{
    assert.throws(()=>modificationInput(id,actor,{booking_time:when,expected_booking_time:when}),
      {status:400,code:'invalid_booking_id'});
  });
}

test('out-of-range customer profile is rejected before any database write',()=>{
  assert.throws(()=>modificationInput(88,{...actor,profileId:2147483648},{
    booking_time:when,expected_booking_time:when}),{status:403,code:'forbidden'});
});
for(const id of [2147483648,Number.MAX_SAFE_INTEGER]){
  test(`slot lookup refuses out-of-range booking ID ${id}`,async()=>{
    const f=database({mode:'modify-slots'});
    await assert.rejects(modificationSlots(f.pool,actor,id,'2035-01-01'),{status:400,code:'invalid_selection'});
    assert.deepEqual(f.calls,[]);assert.deepEqual(f.releases,[]);
  });
}
