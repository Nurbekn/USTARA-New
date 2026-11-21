'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBookingStatusService } = require('../services/bookingStatusService');
const rows = values => ({ rows: values, rowCount: values.length });
function fixture({ status = 'confirmed', commitFails = false, rollbackFails = false,
  invalidTransition = false, updateFails = false } = {}) {
  const queries=[], released=[];
  const booking={ id:61, customer_id:12,barber_id:23,service_id:34,
    booking_time:'2030-01-07T05:00:00Z',duration_minutes:30,status };
  const client={
    async query(sql,params=[]) {
      queries.push(sql);
      if (sql === 'BEGIN' || sql.startsWith('SET LOCAL') || sql.includes('pg_advisory_xact_lock')) return rows([]);
      if (sql === 'COMMIT') { if (commitFails) throw Object.assign(new Error('connection lost'),{code:'08006'}); return rows([]); }
      if (sql === 'ROLLBACK') { if (rollbackFails) throw new Error('rollback connection lost'); return rows([]); }
      if (sql.startsWith('SELECT barber_id FROM bookings')) return rows([{barber_id:23}]);
      if (sql.startsWith('SELECT bookings.id')) return rows([booking]);
      if (sql.startsWith('SELECT clock_timestamp()')) return rows([{now:'2029-01-01T00:00:00Z'}]);
      if (sql.startsWith('UPDATE bookings SET status')) {
        if (updateFails) throw new Error('update failed');
        return rows([{...booking,status:params[0]}]);
      }
      throw Error('Unexpected SQL: '+sql);
    },
    release(broken){ released.push(broken === true); },
  };
  return { queries,released,booking,pool:{connect:async()=>client} };
}
const actor={role:'customer',profileId:12};
const action = f => createBookingStatusService({pool:f.pool}).update(61,'cancelled',actor);
test('v87: confirmed cancellation commits and returns healthy connection',async()=>{
  const f=fixture(); const result=await action(f);
  assert.equal(result.status,'cancelled'); assert.deepEqual(f.released,[false]);
  assert.equal(f.queries.filter(sql=>sql==='COMMIT').length,1);
  assert.equal(f.queries.includes('ROLLBACK'),false);
});
test('v87: committed cancellation replay is a no-op',async()=>{
  const f=fixture({status:'cancelled'}); const result=await action(f);
  assert.equal(result.replayed,true); assert.deepEqual(f.released,[false]);
  assert.equal(f.queries.some(q=>q.startsWith('UPDATE bookings')),false);
});
for (const status of ['confirmed','cancelled']) {
  test(`v87: ${status} COMMIT response lost discards connection`,async()=>{
    const f=fixture({status,commitFails:true});
    await assert.rejects(action(f),/connection lost/);
    assert.deepEqual(f.released,[true]);
    assert.ok(f.queries.includes('ROLLBACK'));
  });
}
test('v87: rollback failure discards connection',async()=>{
  const f=fixture({status:'completed',rollbackFails:true});
  await assert.rejects(action(f),/status/);
  assert.deepEqual(f.released,[true]);
});
test('v87: failed update rolls back but can return healthy connection',async()=>{
  const f=fixture({updateFails:true});
  await assert.rejects(action(f),/update failed/);
  assert.deepEqual(f.released,[false]);
  assert.ok(f.queries.includes('ROLLBACK'));
});
for(const badId of [0,-1,2147483648,Number.MAX_SAFE_INTEGER,1.5,NaN]) {
  test(`v87: invalid booking ID ${badId} rejected before DB`,async()=>{
    let calls=0;const pool={connect:async()=>{calls++;throw Error('unexpected connect')}};
    await assert.rejects(createBookingStatusService({pool}).update(badId,'cancelled',actor),{code:'invalid_id'});
    assert.equal(calls,0);
  });
}
for(const badProfile of [0,-1,2147483648,NaN]) {
  test(`v87: invalid profile ${badProfile} rejected before DB`,async()=>{
    let calls=0;const pool={connect:async()=>{calls++;throw Error('unexpected connect')}};
    await assert.rejects(createBookingStatusService({pool}).update(61,'cancelled',{role:'customer',profileId:badProfile}),{code:'forbidden'});
    assert.equal(calls,0);
  });
}
