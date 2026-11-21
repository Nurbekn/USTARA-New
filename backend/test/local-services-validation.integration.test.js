const { test } = require('node:test');
const { createLocalBarberHarness } = require('./helpers/localBarber');
const enabled = process.env.USTARA_LOCAL_BARBER_WRITE_TESTS === 'I_AUTHORIZE_TEST_DATA';

test('local services validation: only the three reported regressions', { skip: !enabled }, async (t) => {
  let h;
  try { h = await createLocalBarberHarness(); }
  catch { throw new Error('Cannot safely prepare local regression fixtures; details suppressed'); }
  t.after(async () => {
    try { await h.close(); }
    catch { throw new Error('Exact-ID regression cleanup or original-state verification failed'); }
  });
  const barber = await h.person('barber');
  const valid = { name: 'ValidationFixture', price: 100000, duration_minutes: 30 };
  const id = await h.insert('services', ['barber_id', 'name', 'price', 'duration_minutes'],
    [barber.profileId, valid.name, valid.price, valid.duration_minutes]);
  const state = async () => (await h.control.query('SELECT * FROM services WHERE barber_id=$1 ORDER BY id', [barber.profileId])).rows;

  for (const [label, patch] of [
    ['51-character name', { name: 'A'.repeat(51) }],
    ['price 100000000', { price: 100000000 }],
    ['duration 2147483648', { duration_minutes: 2147483648 }],
  ]) {
    await t.test(label, () => h.scenario(label, async () => {
      const before = JSON.stringify(await state());
      const created = await h.call('POST', '/api/services', { ...valid, ...patch }, barber);
      h.check(created.status === 400, 'Invalid INSERT request returns HTTP 400');
      h.check(JSON.stringify(await state()) === before, 'Invalid INSERT leaves service rows unchanged');
      const updated = await h.call('PUT', `/api/services/${id}`, { ...valid, ...patch }, barber);
      h.check(updated.status === 400, 'Same invalid UPDATE request returns HTTP 400');
      h.check(created.body.message === updated.body.message, 'INSERT and UPDATE use the same validation response');
      h.check(JSON.stringify(await state()) === before, 'Invalid UPDATE preserves original service and inserts no row');
    }));
  }
  console.log('Services regression evidence: ' + h.root);
});
