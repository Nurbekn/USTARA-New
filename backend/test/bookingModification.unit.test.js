'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { modificationInput, modifyCustomerBooking } = require('../services/bookingModification');
const ACTOR = { role: 'customer', profileId: 10, accountId: 100 };
const BASE = { booking_time: '2030-02-01T11:00:00+05:00', expected_booking_time: '2030-02-01T10:00:00+05:00' };
const ORIGINAL = { id: 20, customer_id: 10, barber_id: 30, service_id: 40,
  booking_time: '2030-02-01T05:00:00.000Z', duration_minutes: 30, total_price: '50000.00', status: 'confirmed' };
function database({ booking = ORIGINAL, conflict = false, customerBusy = false, price = '60000.00',
    quote = null, outsideHours = false, dbConstraint = null, clock = '2026-11-18T00:00:00Z' } = {}) {
  const calls = []; let released = false, state = { ...booking };
  const client = {
    async query(sql, args = []) {
      calls.push({ sql, args });
      if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql)) return { rows: [], rowCount: 0 };
      if (sql.startsWith('SELECT user_id FROM customers')) return { rows: [{ user_id: 100 }], rowCount: 1 };
      if (sql.startsWith("SELECT id FROM users WHERE id=$1 AND role='customer'")) return { rows: [{ id: 100 }], rowCount: 1 };
      if (sql.startsWith('SELECT barber_id FROM bookings')) return { rows: [{ barber_id: 30 }], rowCount: 1 };
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
      if (sql.startsWith('SELECT * FROM bookings')) return { rows: [state], rowCount: 1 };
      if (sql.startsWith('SELECT clock_timestamp()')) return { rows: [{ now: clock }], rowCount: 1 };
      if (sql.startsWith('SELECT b.verification_status')) return { rows: [{ verification_status: 'approved', accepting_bookings: true, deactivated_at: null }], rowCount: 1 };
      if (sql.startsWith('SELECT service_id FROM booking_services')) return { rows: [{ service_id: 40 }], rowCount: 1 };
      if (sql.startsWith('SELECT id,name,price,duration_minutes')) return { rows: [
        { id: 41, name: 'Soqol', duration_minutes: 15, price },
      ], rowCount: 1 };
      if (sql.includes('AS fits FROM ustara_effective_day_schedule')) return { rows: [{ fits: !outsideHours }], rowCount: 1 };
      if (sql.includes('FROM bookings WHERE barber_id=$1 AND id<>$4')) return { rows: conflict ? [{ id: 90 }] : [], rowCount: +conflict };
      if (sql.includes('FROM bookings WHERE customer_id=$1 AND id<>$4')) return { rows: customerBusy ? [{ id: 91 }] : [], rowCount: +customerBusy };
      if (sql.startsWith('UPDATE bookings SET booking_time=')) {
        if (dbConstraint) throw Object.assign(new Error('Exclusion constraint'), { code: '23P01', constraint: dbConstraint });
        state = { ...state, booking_time: args[2], duration_minutes: args[3], service_id: args[4], total_price: args[5] };
        return { rows: [state], rowCount: 1 };
      }
      if (sql.startsWith('DELETE FROM booking_services') || sql.startsWith('INSERT INTO booking_services')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL ${sql}`);
    },
    release(flag) { assert.equal(flag || false, false); released = true; },
  };
  return { pool: { async query(sql) {
    assert.match(sql, /to_regclass\('booking_services'\)/);
    return { rows: [{ ready: true }], rowCount: 1 };
  }, async connect() { return client; } }, calls, get released() { return released; } };
}

test('malformed date, 5-minute step, unauthorized actor and missing service quote rejected before DB', () => {
  for (const input of [{...BASE,booking_time:'2030-02-01T11:02:00+05:00'},
    {...BASE,booking_time:'2030-02-31T11:00:00+05:00'},
    {...BASE,expected_booking_time:undefined},
    {...BASE,service_ids:[41]}]) {
    assert.throws(()=>modificationInput(20,ACTOR,input),{status:400});
  }
  assert.throws(()=>modificationInput(20,{role:'barber',profileId:10},BASE),{status:403});
  assert.throws(()=>modificationInput(0,ACTOR,BASE),{status:400});
});
test('successful reschedule keeps original service, price and booking ID', async () => {
  const db=database(); const result=await modifyCustomerBooking(db.pool,ACTOR,20,BASE);
  assert.equal(result.id,20); assert.equal(result.service_id,40);assert.equal(result.duration_minutes,30);
  assert.equal(result.total_price,'50000.00');assert.equal(+new Date(result.booking_time),+new Date(BASE.booking_time));
  assert.equal(db.calls.filter(x=>x.sql.startsWith('UPDATE bookings')).length,1);
  assert.equal(db.calls.some(x=>x.sql.startsWith('DELETE FROM booking_services')),false);
  assert.equal(db.calls.at(-1).sql,'COMMIT'); assert.ok(db.released);
  assert.ok(db.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock')) < db.calls.findIndex(x=>x.sql.includes('FROM bookings WHERE barber_id=$1 AND id<>$4')));
});
test('barber conflict preserves original booking via ROLLBACK',async()=>{
  const db=database({conflict:true});await assert.rejects(modifyCustomerBooking(db.pool,ACTOR,20,BASE),{status:409,code:'booking_conflict'});
  assert.equal(db.calls.filter(x=>x.sql.startsWith('UPDATE bookings')).length,0);
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');assert.ok(db.released);
});
test('customer cannot overlap their own booking at another barber',async()=>{
  const db=database({customerBusy:true});await assert.rejects(modifyCustomerBooking(db.pool,ACTOR,20,BASE),{status:409,code:'customer_time_conflict'});
  assert.equal(db.calls.filter(x=>x.sql.startsWith('UPDATE bookings')).length,0);
});
test('stale original time fails closed, but repeated same reschedule returns its existing result', async()=>{
  const different=database({booking:{...ORIGINAL,booking_time:'2030-02-01T04:00:00.000Z'}});
  await assert.rejects(modifyCustomerBooking(different.pool,ACTOR,20,BASE),{status:409,code:'booking_changed'});
  const same=database({booking:{...ORIGINAL,booking_time:'2030-02-01T06:00:00.000Z'}});
  const result=await modifyCustomerBooking(same.pool,ACTOR,20,BASE);
  assert.equal(result.replayed,true);assert.equal(same.calls.some(x=>x.sql.startsWith('UPDATE bookings')),false);
});
test('service edit persists new snapshot and total atomically when quote matches',async()=>{
  const db=database();const result=await modifyCustomerBooking(db.pool,ACTOR,20,{...BASE,service_ids:[41],expected_service_ids:[40],expected_total_price:'60000.00'});
  assert.equal(result.service_id,41);assert.equal(result.duration_minutes,15);assert.equal(result.total_price,'60000.00');
  assert.equal(db.calls.filter(x=>x.sql.startsWith('DELETE FROM booking_services')).length,1);
  assert.equal(db.calls.filter(x=>x.sql.startsWith('INSERT INTO booking_services')).length,1);
  assert.equal(db.calls.at(-1).sql,'COMMIT');
});
test('changed price and work-hour violations roll back without replacing old service snapshot',async()=>{
  for (const [options, input, code] of [
    [{}, {...BASE,service_ids:[41],expected_service_ids:[40],expected_total_price:'55000.00'},'price_changed'],
    [{outsideHours:true},BASE,'outside_work_hours']]) {
    const db=database(options);await assert.rejects(modifyCustomerBooking(db.pool,ACTOR,20,input),{status:409,code});
    assert.equal(db.calls.some(x=>x.sql.startsWith('DELETE FROM booking_services')),false);
    assert.equal(db.calls.at(-1).sql,'ROLLBACK');
  }
});
test('non-active booking and missing migration cannot be rescheduled',async()=>{
  const db=database({booking:{...ORIGINAL,status:'cancelled'}});
  await assert.rejects(modifyCustomerBooking(db.pool,ACTOR,20,BASE),{status:409,code:'invalid_booking_status'});
  const pool={query:async()=>({rows:[{ready:false}]})};
  await assert.rejects(modifyCustomerBooking(pool,ACTOR,20,BASE),{status:503,code:'migration_required'});
});

const { modificationSlots } = require('../services/bookingModification');
function availabilityDatabase({ authorized = true, hasSchedule = true, busy = false, paused = false } = {}) {
  const calls=[];
  return {calls,pool:{async connect() {return {
    async query(sql,args=[]) {
      calls.push({sql,args});
      if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql)) return {rows:[],rowCount:0};
      if(sql.startsWith('SELECT c.id FROM customers c')) return {rows:[{id:10}],rowCount:1};
      if(sql.includes('SELECT barber_id,duration_minutes,booking_time,status'))
        return {rows:authorized?[ORIGINAL]:[],rowCount:+authorized};
      if(sql.startsWith('SELECT id,name,price,duration_minutes'))return {rows:[{id:41,name:'Soqol',price:'60000.00',duration_minutes:15}],rowCount:1};
      if(sql.startsWith('SELECT clock_timestamp()'))return {rows:[{now:'2026-11-18T00:00:00Z'}],rowCount:1};
      if(sql.includes('SELECT b.verification_status'))return {rows:[{verification_status:'approved',accepting_bookings:!paused,deactivated_at:null}],rowCount:1};
      if(sql.includes('SELECT s.start_time,s.end_time,s.break_start,s.break_end,'))return {rows:hasSchedule?[{start_time:'09:00:00',end_time:'10:00:00',now_minutes:-100}]:[],rowCount:+hasSchedule};
      if(sql.includes('FROM bookings WHERE (barber_id=$1 OR customer_id=$4) AND id<>$3'))return {rows:busy?[{start:585,end:600}]:[],rowCount:+busy};
      throw Error(sql);
    },release(){},
  };}}};
}
test('modification slots require booking ownership and never list private booking names',async()=>{
  const denied=availabilityDatabase({authorized:false});
  await assert.rejects(modificationSlots(denied.pool,ACTOR,20,'2030-02-01'),{status:404,code:'not_found'});
  assert.equal(denied.calls.at(-1).sql,'ROLLBACK');
  await assert.rejects(modificationSlots(denied.pool,{role:'barber',profileId:30},20,'2030-02-01'),{status:403});
});
test('slot suggestions exclude own booking and enforce real 5-minute availability',async()=>{
  const db=availabilityDatabase({busy:true});
  const result=await modificationSlots(db.pool,ACTOR,20,'2030-02-01');
  assert.equal(result.duration,30);assert.equal(result.working,true);
  assert.ok(result.slots.some(slot=>slot.start==='09:00'));
  assert.equal(result.slots.some(slot=>slot.start==='09:20'),false);
  assert.ok(db.calls.some(x=>x.sql.includes('id<>$3')&&x.args[2]===20&&x.args[3]===10));
  assert.deepEqual(Object.keys(result).sort(),['accepting_bookings','date','duration','slots','working']);
  assert.equal(db.calls.at(-1).sql,'COMMIT');
});
test('paused barber and non-working date produce no edit slots',async()=>{
  for(const options of [{paused:true},{hasSchedule:false}]){
    const result=await modificationSlots(availabilityDatabase(options).pool,ACTOR,20,'2030-02-01');
    assert.deepEqual(result.slots,[]);
  }
});


test('service editing cannot silently overwrite edits made on another device',async()=>{
  const db=database();
  await assert.rejects(modifyCustomerBooking(db.pool,ACTOR,20,{
    ...BASE,service_ids:[41],expected_service_ids:[99],expected_total_price:'60000.00',
  }),{status:409,code:'booking_changed'});
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
  assert.equal(db.calls.some(x=>x.sql.startsWith('UPDATE bookings')),false);
});
test('service quote slots use replacement duration and server price, not old booking duration',async()=>{
  const db=availabilityDatabase({busy:true});
  const result=await modificationSlots(db.pool,ACTOR,20,'2030-02-01',[41]);
  assert.equal(result.duration,15);
  assert.equal(result.total_price,'60000.00');
  assert.ok(result.slots.some(slot=>slot.start==='09:00'));
  assert.equal(result.slots.some(slot=>slot.start==='09:30'),true);
  assert.equal(result.slots.some(slot=>slot.start==='09:35'),false);
  assert.ok(db.calls.some(x=>x.sql.startsWith('SELECT id,name,price,duration_minutes')));
});
test('service replacement quote rejects duplicate, empty and too many service IDs',async()=>{
  for(const ids of [[],[41,41],Array.from({length:21},(_,i)=>i+1)]) {
    await assert.rejects(modificationSlots(availabilityDatabase().pool,ACTOR,20,'2030-02-01',ids),{status:400});
  }
  assert.throws(()=>modificationInput(20,ACTOR,{...BASE,service_ids:[41],expected_total_price:'60000.00'}),{status:400});
});


test('database customer exclusion rejects race after application checks with clean rollback',async()=>{
  const db=database({dbConstraint:'bookings_customer_time_excl'});
  await assert.rejects(modifyCustomerBooking(db.pool,ACTOR,20,BASE),{status:409,code:'customer_time_conflict'});
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
  assert.ok(db.released);
  assert.equal(db.calls.some(({sql})=>sql.startsWith('DELETE FROM booking_services')),false);
});
