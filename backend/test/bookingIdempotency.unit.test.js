const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bookingRequest, fingerprint, replayBooking, saveBookingRequest, requireIdempotencySchema } = require('../services/bookingIdempotency');
const ID='550e8400-e29b-41d4-a716-446655440000';

test('malformed request IDs are rejected; legacy missing key stays valid', () => {
  assert.equal(bookingRequest({}), null);
  assert.equal(bookingRequest({ request_id: ID }), ID);
  for(const request_id of ['abc', '', 12, '550e8400-e29b-11d4-a716-446655440000']) {
    assert.throws(()=>bookingRequest({request_id}),{status:400,code:'invalid_request_id'});
  }
});
test('same instant with different ISO timezone offsets has identical fingerprint', () => {
  assert.equal(fingerprint(2,[3,4],'2030-01-07T10:00:00+05:00'),fingerprint(2,[3,4],'2030-01-07T05:00:00Z'));
  assert.notEqual(fingerprint(2,[3,4],'2030-01-07T10:00:00+05:00'),fingerprint(2,[4,3],'2030-01-07T10:00:00+05:00'));
});
test('replay uses existing committed booking and its immutable service snapshots', async () => {
  const calls=[];
  const db={query: async (sql, params) => {calls.push({sql,params});
    if(sql.includes('JOIN bookings')) return {rowCount:1, rows:[{ fingerprint:'abc',id:44,customer_id:8,status:'confirmed' }]};
    if(sql.includes('FROM booking_services')) return {rows:[{id:12,name:'Soch olish',price:'50000',duration_minutes:30}]};
    throw new Error(sql);
  }};
  const replay=await replayBooking(db,8,ID,'abc');
  assert.equal(replay.id,44);assert.equal(replay.replayed,true);assert.equal(replay.services[0].name,'Soch olish');
  assert.deepEqual(calls[0].params,[8,ID]);
  await assert.rejects(replayBooking(db,8,ID,'different'),{status:409,code:'request_id_reused'});
  assert.equal(calls.filter(x=>x.sql.includes('FROM booking_services')).length,1);
});
test('new request is saved inside caller transaction; no-key clients do not create idempotency row', async () => {
  const calls=[];const client={query:async(q,p)=>{calls.push({q,p});return {rows:[],rowCount:0};}};
  assert.equal(await replayBooking(client,4,null,'abc'),null);
  await saveBookingRequest(client,4,null,'abc',42);
  assert.equal(calls.length,0);
  await saveBookingRequest(client,4,ID,'abc',42);
  assert.deepEqual(calls[0].p,[4,ID,'abc',42]);
  assert.match(calls[0].q,/INSERT INTO booking_request_keys/);
});
test('fail closed when new idempotency migration has not run', async () => {
  await assert.rejects(requireIdempotencySchema({query:async()=>({rows:[{ready:false}]})}),{status:503,code:'migration_required'});
  await requireIdempotencySchema({query:async()=>({rows:[{ready:true}]})});
});
