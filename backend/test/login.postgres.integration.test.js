const { test } = require('node:test');
const assert = require('node:assert/strict');
const enabled = process.env.NODE_ENV === 'test' && process.env.USTARA_LOGIN_WRITE_TESTS === 'I_AUTHORIZE_TEST_DATA';

test('Login: PostgreSQL va haqiqiy HTTP', { skip: !enabled }, async t => {
  const h = await require('./helpers/loginHarness').createLoginHarness();
  t.after(() => h.close());
  const customer = await h.account(), barber = await h.account('barber');
  await t.test('umumiy endpoint har ikki rolni va canonical JWT identityni qaytaradi', async () => {
    const jwt = require('jsonwebtoken');
    for (const user of [customer, barber]) {
      const result = await h.call(user.phone);
      assert.equal(result.status, 200);
      assert.equal(result.body[user.role].id, user.profileId);
      const claims = jwt.verify(result.body.token, process.env.JWT_SECRET);
      assert.equal(claims.id, user.userId);
      assert.equal(claims.profileId, user.profileId);
      assert.equal(claims.role, user.role);
    }
  });
  const blocked = await h.account();
  await t.test('bitta urinish bitta xato; 5-xato 429, Retry-After va no-store beradi', async () => {
    for (let n = 1; n <= 5; n++) {
      const result = await h.call(blocked.phone, 'Wrong123');
      assert.equal(result.status, n === 5 ? 429 : 401);
      const row = (await h.pool.query("SELECT * FROM login_attempt_limits WHERE scope='public' AND kind='account' AND key_hash=$1", [h.hash(blocked.phone)])).rows[0];
      assert.equal(row.failed_count, n === 5 ? 0 : n);
      if (n === 5) {
        assert.equal(result.body.code, 'login_throttled');
        assert.ok(result.body.retryAfter > 0 && result.body.retryAfter <= 60);
        assert.equal(result.headers.get('retry-after'), String(result.body.retryAfter));
        assert.equal(result.headers.get('cache-control'), 'no-store');
        assert.match(result.headers.get('access-control-expose-headers'), /Retry-After/i);
      }
    }
    const before = (await h.pool.query("SELECT blocked_until FROM login_attempt_limits WHERE kind='account' AND key_hash=$1", [h.hash(blocked.phone)])).rows[0].blocked_until;
    assert.equal((await h.call(blocked.phone)).status, 429);
    const after = (await h.pool.query("SELECT blocked_until FROM login_attempt_limits WHERE kind='account' AND key_hash=$1", [h.hash(blocked.phone)])).rows[0].blocked_until;
    assert.equal(+after, +before);
  });
  await t.test('umumiy proxy/IP ortidagi ko‘p xatolar boshqa raqamlarni bloklamaydi', async () => {
    for (let n = 0; n < 12; n++) {
      const phone = await h.freshPhone();
      assert.equal((await h.call(phone, 'Wrong123')).status, 401);
    }
    assert.equal((await h.call(customer.phone)).status, 200);
    assert.equal((await h.call(barber.phone)).status, 200);
  });
  await t.test('parallel 12 so‘rov faqat 5 marta parol tekshiradi; boshqa telefon mustaqil', async () => {
    const phone = await h.freshPhone();
    const results = await Promise.all(Array.from({ length: 12 }, () => h.call(phone, 'Wrong123')));
    assert.equal(results.filter(r => r.status === 401).length, 4);
    assert.equal(results.filter(r => r.status === 429).length, 8);
    const row = (await h.pool.query("SELECT failed_count,penalty_level FROM login_attempt_limits WHERE kind='account' AND key_hash=$1", [h.hash(phone)])).rows[0];
    assert.equal(row.failed_count, 0);
    assert.equal(row.penalty_level, 1);
    assert.equal((await h.call(customer.phone)).status, 200);
  });
  await t.test('eski endpointlar umumiy account limitini chetlab o‘tolmaydi', async () => {
    assert.equal((await h.call(blocked.phone, h.password, '/api/customers/login')).status, 429);
    assert.equal((await h.call(blocked.phone, h.password, '/api/barbers/login')).status, 429);
    const protect = require('../services/loginProtection').createLoginProtection(h.pool);
    h.keys.add(h.hash(JSON.stringify([blocked.phone, '192.0.2.10'])));
    const changedIp = await protect({ scope: 'public', account: blocked.phone, ip: '192.0.2.10' }, () => {
      throw Error('Bloklangan account paroli tekshirilmasligi kerak');
    });
    assert.equal(changedIp.status, 429);
  });
  await t.test('blok muddati tugaganda muvaffaqiyatli login hisoblagichni tozalaydi', async () => {
    await h.pool.query("UPDATE login_attempt_limits SET window_started_at=window_started_at-interval '10 minutes',last_failed_at=last_failed_at-interval '10 minutes',blocked_until=blocked_until-interval '10 minutes' WHERE scope='public' AND key_hash=ANY($1::text[])",
      [[h.hash(blocked.phone), h.hash(JSON.stringify([blocked.phone, '127.0.0.1']))]]);
    assert.equal((await h.call(blocked.phone)).status, 200);
    const row = (await h.pool.query("SELECT * FROM login_attempt_limits WHERE kind='account' AND key_hash=$1", [h.hash(blocked.phone)])).rows[0];
    assert.equal(row.penalty_level, 0);
    assert.equal(row.blocked_until, null);
  });
  await t.test('admin: 5 urinish, 1/3/5 daqiqa va eski uzun blokning yangi muddati', async () => {
    for (const seconds of [60, 180, 300, 300]) {
      for (let n = 1; n <= 5; n++) {
        const result = await h.callAdmin('Wrong123');
        assert.equal(result.status, n === 5 ? 429 : 401);
        if (n === 5) {
          assert.ok(result.body.retryAfter > seconds - 3 && result.body.retryAfter <= seconds);
          assert.equal(result.headers.get('retry-after'), String(result.body.retryAfter));
        }
      }
      await h.pool.query("UPDATE login_attempt_limits SET window_started_at=window_started_at-interval '10 minutes',last_failed_at=last_failed_at-interval '10 minutes',blocked_until=blocked_until-interval '10 minutes' WHERE scope='admin' AND key_hash=ANY($1::text[])",
        [[h.hash('singleton-admin'), h.hash('127.0.0.1')]]);
    }
    const legacy = await h.account();
    await h.call(legacy.phone, 'Wrong123');
    await h.pool.query("UPDATE login_attempt_limits SET failed_count=0,window_started_at=NULL,penalty_level=4,last_failed_at=clock_timestamp()-interval '22 minutes',blocked_until=clock_timestamp()+interval '38 minutes' WHERE kind='account' AND key_hash=$1", [h.hash(legacy.phone)]);
    assert.equal((await h.call(legacy.phone)).status, 200);
    assert.equal((await h.callAdmin()).status, 200);
  });
});
