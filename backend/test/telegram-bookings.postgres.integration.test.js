// Isolated PostgreSQL only. Telegram transport is simulated; no dotenv or real bot.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { testTarget, assertTestConnection } = require('./helpers/testDatabaseTarget');
const { createTelegramLinkService } = require('../services/telegramLinkService');
const { createBookingStatusService } = require('../services/bookingStatusService');
const { createUpdateHandler } = require('../telegram/handler');
const enabled = process.env.NODE_ENV === 'test'
  && process.env.USTARA_TELEGRAM_AUTH_TESTS === 'I_AUTHORIZE_TEST_DATA'
  && Boolean(process.env.USTARA_TEST_DATABASE_URL);

test('Telegram bron boshqaruvi: haqiqiy PostgreSQL, taqlid qilingan transport', { skip: !enabled }, async t => {
  const target = testTarget(process.env.USTARA_TEST_DATABASE_URL, 'Telegram bron testi', ['ustara_account_test']);
  const pool = new Pool({ connectionString: process.env.USTARA_TEST_DATABASE_URL, max: 4 });
  const people = [], bookingIds = [], serviceIds = [];
  let verified = false;
  t.after(async () => {
    try {
      if (verified) {
        await assertTestConnection(pool, target);
        for (const id of bookingIds) await pool.query('DELETE FROM bookings WHERE id=$1', [id]);
        for (const id of serviceIds) await pool.query('DELETE FROM services WHERE id=$1', [id]);
        for (const person of people) await pool.query('DELETE FROM users WHERE id=$1 AND phone=$2', [person.id, person.phone]);
      }
    } finally { await pool.end(); }
  });
  await assertTestConnection(pool, target); verified = true;
  async function person(role) {
    const phone = '+998' + crypto.randomInt(900000000, 999999999);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const account = (await client.query('INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id,phone', [phone, 'unused-test-password-hash', role])).rows[0];
      const table = role === 'customer' ? 'customers' : 'barbers';
      const profile = (await client.query(`INSERT INTO ${table}(user_id,first_name,last_name${role === 'barber' ? ',specialty' : ''}) VALUES($1,$2,$3${role === 'barber' ? ",$4" : ''}) RETURNING id`,
        [account.id, 'Sinov', 'Telegram', ...(role === 'barber' ? ['barber'] : [])])).rows[0];
      await client.query('COMMIT');
      const value = { ...account, role, profileId: profile.id }; people.push(value); return value;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const customer = await person('customer'), barber = await person('barber');
  const chat = crypto.randomInt(100000000, 900000000), botId = 123456;
  const env = { TELEGRAM_BOT_USERNAME: 'ustara_booking_bot' };
  const links = createTelegramLinkService({ pool, env });
  const link = await links.start(barber);
  const messages = [];
  let failDelivery = false;
  const api = async (method, body) => {
    if (failDelivery && method === 'sendMessage') throw Error('Simulated delivery error');
    messages.push({ method, body }); return { message_id: messages.length, chat: { id: body.chat_id } };
  };
  const status = createBookingStatusService({ pool });
  const handler = createUpdateHandler({ service: links, contacts: {}, username: env.TELEGRAM_BOT_USERNAME,
    api, botId, bookings: status });
  await handler({ message: { chat: { id: chat, type: 'private' }, from: { id: chat }, text: '/start ' + link.token } });
  assert.equal((await links.status(barber)).linked, true);
  const notifierModule = require('../services/telegramBookingNotifications');
  const original = notifierModule.createBookingNotifier;
  notifierModule.createBookingNotifier = options => original({ ...options, api, logger: { error() {} } });
  const notifier = notifierModule.createBookingNotifier({ pool });
  const dbPath = require.resolve('../db');
  assert.equal(require.cache[dbPath], undefined);
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  const controller = require('../controllers/bookingsController');
  t.after(() => { notifierModule.createBookingNotifier = original; delete require.cache[dbPath]; });
  const service = (await pool.query('INSERT INTO services(barber_id,name,price,duration_minutes) VALUES($1,$2,100000,30) RETURNING id', [barber.profileId, 'Sinov xizmati'])).rows[0]; serviceIds.push(service.id);
  async function booking() {
    const row = (await pool.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes) VALUES($1,$2,$3,clock_timestamp()+($4::int*INTERVAL '1 day'),30) RETURNING id", [customer.profileId, barber.profileId, service.id, bookingIds.length + 5])).rows[0];
    bookingIds.push(row.id); return row.id;
  }
  async function callback(id, action, identity = chat) {
    await handler({ callback_query: { id: crypto.randomBytes(8).toString('hex'), from: { id: identity },
      data: `booking:${action}:${id}`, message: { message_id: 100, from: { id: botId, is_bot: true }, chat: { id: identity, type: 'private' } } } });
  }
  const stored = async id => (await pool.query('SELECT status FROM bookings WHERE id=$1', [id])).rows[0].status;
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  await t.test('profil bog‘lash saqlanadi; yangi bron xabari va Telegramdan tasdiqlash', async () => {
    const id = await booking(); assert.equal((await notifier(id)).sent, true);
    assert.deepEqual(messages.at(-1).body.reply_markup.inline_keyboard[0].map(b => b.callback_data), [`booking:confirmed:${id}`, `booking:rejected:${id}`]);
    await callback(id, 'confirmed'); assert.equal(await stored(id), 'confirmed');
    const res = response(); await controller.refreshStatus({ params: { id }, body: { status: 'cancelled' }, user: customer }, res);
    assert.equal(res.statusCode, 200); assert.equal(await stored(id), 'cancelled');
    assert.match(messages.at(-1).body.text, /bekor qilindi/);
    assert.equal(messages.at(-1).body.reply_markup, undefined);
  });
  await t.test('begona chat rad etiladi; parallel bir xil callback bitta o‘tish qiladi', async () => {
    const id = await booking(); await callback(id, 'rejected', chat + 1); assert.equal(await stored(id), 'pending');
    const start = messages.length;
    await Promise.all([callback(id, 'rejected'), callback(id, 'rejected')]);
    assert.equal(await stored(id), 'rejected');
    const answers = messages.slice(start).filter(m => m.method === 'answerCallbackQuery');
    assert.equal(answers.filter(m => m.body.show_alert === false).length, 1);
    assert.equal(answers.filter(m => m.body.show_alert === true).length, 1);
  });
  await t.test('legacy bekor qilish xabari; yetkazish xatosi va takroriy so‘rov statusni buzmaydi', async () => {
    for (const failing of [false, true]) {
      const id = await booking(); failDelivery = failing;
      const res = response(); await controller.deleteBooking({ params: { id }, user: customer }, res);
      assert.equal(res.statusCode, 200); assert.equal(await stored(id), 'cancelled');
      if (!failing) assert.match(messages.at(-1).body.text, /bekor qilindi/);
      const before = messages.length, repeated = response();
      await controller.deleteBooking({ params: { id }, user: customer }, repeated);
      assert.equal(repeated.statusCode, 404); assert.equal(messages.length, before);
    }
    failDelivery = false;
    await links.unlink(barber); assert.equal((await links.status(barber)).linked, false);
  });
});
