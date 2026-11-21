const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDates } = require('../services/promotionWindow');
test('Promotion requires valid hours within 1–720 hours',()=>{
  for(const hours of [0,-1,721,1.5,NaN,'not-a-number']) assert.equal(parseDates({hours},0),null);
  assert.equal(parseDates({hours:1},0).expiresAt,'1970-01-01T01:00:00.000Z');
  assert.equal(parseDates({hours:720},0).expiresAt,'1970-01-31T00:00:00.000Z');
});
test('Absent promotion hours are rejected',()=>assert.equal(parseDates(undefined,0),null));
