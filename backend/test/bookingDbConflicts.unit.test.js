'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bookingDbConflict } = require('../services/bookingDbConflicts');

test('PostgreSQL customer exclusion provides the right 409 without exposing DB details', () => {
  const conflict = bookingDbConflict({code:'23P01', constraint:'bookings_customer_time_excl',
    detail:'private customer booking details', table:'bookings'});
  assert.equal(conflict.status,409);
  assert.equal(conflict.code,'customer_time_conflict');
  assert.equal(JSON.stringify({code:conflict.code,message:conflict.message}).includes('private'), false);
});
test('barber exclusion and unknown 23P01 fail closed, non-exclusion errors stay untouched', () => {
  for(const constraint of ['bookings_active_time_excl', 'unexpected_constraint']) {
    const conflict=bookingDbConflict({code:'23P01',constraint});
    assert.equal(conflict.status,409);
    assert.equal(conflict.code,'booking_conflict');
  }
  assert.equal(bookingDbConflict({code:'23503'}),null);
  assert.equal(bookingDbConflict(null),null);
});
