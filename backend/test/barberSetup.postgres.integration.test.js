const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { createOtpPostgresHarness } = require('./helpers/otpPostgres');

test('barber setup: haqiqiy PostgreSQL va mobil saqlash', { skip: process.env.USTARA_DISPOSABLE_OTP_TESTS !== 'I_AUTHORIZE_TEMP_DATABASE', timeout: 90000 }, async t => {
  const h = await createOtpPostgresHarness();t.after(() => h.close());
  console.log('Setup test artefaktlari:', h.root);
  await h.admin.query('CREATE EXTENSION btree_gist WITH SCHEMA public');
  for (const name of ['20261115_slots_02_booking_no_overlap', '20261116_account_profile_deletion_integrity', '20261117_barber_profile', '20261117_barber_profile_02_booking_acceptance']) await h.admin.query(fs.readFileSync(path.join(__dirname, '../database/migrations', name + '.sql'), 'utf8'));
  const app = require('express')();app.use(require('cors')());app.use(require('express').json());
  const auth = require('../middleware/authMiddleware');
  app.put('/api/barbers/setup', auth, require('../controllers/barberSetupController').createBarberSetupController(h.pool));
  app.get('/api/barbers/me', auth, require('../controllers/barbersController').getMyBarberProfile);
  app.get('/api/barbers/working-hours', auth, require('../controllers/barbersController').getWorkingHours);
  const server = app.listen(0, '127.0.0.1');await new Promise(r => server.once('listening', r));t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function fixture(phone) {
    await h.admin.query('BEGIN');
    const u = (await h.admin.query("INSERT INTO users(phone,password,role) VALUES($1,'unused-test-hash','barber') RETURNING id,created_at", [phone])).rows[0];
    const p = (await h.admin.query("INSERT INTO barbers(user_id,first_name,last_name,specialty,created_at) VALUES($1,'Sinov','Usta','barber',$2) RETURNING id", [u.id, u.created_at])).rows[0];
    await h.admin.query('COMMIT');
    const actor = { id: u.id, profileId: p.id, role: 'barber', sessionVersion: 0 };
    return { actor, phone, token: jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '1h' }) };
  }
  const f = await fixture('+998900008001');
  const hours = Array.from({ length: 6 }, (_, i) => ({ day_of_week: i + 1, start_time: '09:00', end_time: '18:00' }));
  const body = { address: 'Toshkent', location: { lat: 41.3, lng: 69.2 }, working_hours: hours };
  const call = async (body, token = f.token) => { const r = await fetch(base + '/api/barbers/setup', { method: 'PUT', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });return { status: r.status, body: await r.json() }; };
  await t.test('sessiyasiz va noto‘g‘ri profil JWT rad etiladi', async () => {
    assert.equal((await call(body, null)).status, 401);
    assert.equal((await call(body, jwt.sign({ ...f.actor, profileId: f.actor.profileId + 1 }, process.env.JWT_SECRET))).status, 401);
  });
  await t.test('pending profil va olti kun atomik saqlanadi; admin holati o‘zgarmaydi', async () => {
    const result = await call(body);assert.equal(result.status, 200);assert.equal(result.body.barber.verification_status, 'pending');
    assert.equal(result.body.barber.address, 'Toshkent');
    assert.deepEqual((await h.admin.query('SELECT day_of_week FROM barber_working_hours WHERE barber_id=$1 ORDER BY day_of_week', [f.actor.profileId])).rows.map(r => r.day_of_week), [1, 2, 3, 4, 5, 6]);
    assert.equal((await call(body)).status, 200);
    assert.equal((await h.admin.query('SELECT count(*)::int AS n FROM barber_working_hours WHERE barber_id=$1', [f.actor.profileId])).rows[0].n, 6);
  });
  await t.test('noto‘g‘ri jadval yoki ruxsatsiz maydon o‘zgarish kiritmaydi', async () => {
    assert.equal((await call({ ...body, working_hours: [] })).status, 400);
    assert.equal((await call({ ...body, verification_status: 'approved' })).status, 400);
    assert.equal((await h.admin.query('SELECT verification_status FROM barbers WHERE id=$1', [f.actor.profileId])).rows[0].verification_status, 'pending');
  });
  await t.test('jadval yozish xatosida manzil ham rollback bo‘ladi', async () => {
    await h.admin.query("CREATE FUNCTION setup_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$");
    await h.admin.query('CREATE TRIGGER setup_test_fault BEFORE INSERT ON barber_working_hours FOR EACH ROW EXECUTE FUNCTION setup_test_fault()');
    try { assert.equal((await call({ ...body, address: 'Saqlanmasin' })).status, 503); }
    finally { await h.admin.query('DROP TRIGGER setup_test_fault ON barber_working_hours');await h.admin.query('DROP FUNCTION setup_test_fault()'); }
    assert.equal((await h.admin.query('SELECT address FROM barbers WHERE id=$1', [f.actor.profileId])).rows[0].address, 'Toshkent');
    assert.equal((await h.admin.query('SELECT count(*)::int AS n FROM barber_working_hours WHERE barber_id=$1', [f.actor.profileId])).rows[0].n, 6);
  });
  await t.test('rejected profil rad etiladi, approved holati saqlanadi', async () => {
    await h.admin.query("UPDATE barbers SET verification_status='rejected' WHERE id=$1", [f.actor.profileId]);assert.equal((await call(body)).status, 403);
    await h.admin.query("UPDATE barbers SET verification_status='approved' WHERE id=$1", [f.actor.profileId]);assert.equal((await call(body)).body.barber.verification_status, 'approved');
  });
  if (process.env.USTARA_SETUP_E2E === '1') await t.test('mobil setupdan admin tasdiqlash sahifasiga o‘tish', async () => {
    const fresh = await fixture('+998900008002');
    await require('./helpers/barberSetupMobile').runBarberSetupMobile({ base, f: fresh, artifacts: h.root });
    assert.deepEqual((await h.admin.query('SELECT day_of_week FROM barber_working_hours WHERE barber_id=$1 ORDER BY day_of_week', [fresh.actor.profileId])).rows.map(r => r.day_of_week), [1, 2, 3, 4, 5, 6]);
    assert.equal((await h.admin.query('SELECT verification_status FROM barbers WHERE id=$1', [fresh.actor.profileId])).rows[0].verification_status, 'pending');
  });
});
