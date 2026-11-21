const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupHours } = require('../services/barberSetup');
test('onboarding jadvali vaqt va takroriy kunlarni tekshiradi', () => {
  const day = { day_of_week: 1, start_time: '09:00', end_time: '18:00' };
  assert.deepEqual(setupHours([day]), [day]);
  for (const value of [[], null, [day, day], [{ ...day, day_of_week: 7 }], [{ ...day, start_time: '25:00' }], [{ ...day, start_time: '18:00' }]]) assert.throws(() => setupHours(value));
});
