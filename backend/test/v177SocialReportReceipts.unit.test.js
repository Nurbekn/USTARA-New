const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMyReportsHandler } = require('../controllers/socialReportReceiptsV177');
function response() {
  const result = { code: 200, headers: {} };
  result.status = n => { result.code = n; return result; };
  result.set = (name, value) => { result.headers[name] = value; return result; };
  result.json = body => { result.body = body; return result; };
  return result;
}
test('#151 rejects guest, admin and malformed account without DB access', async () => {
  let calls = 0;
  const handler = createMyReportsHandler({ query: async () => { calls++; return { rows: [] }; } });
  for (const user of [null, { role: 'admin', accountId: 3 }, { role: 'customer', accountId: '3' }, { role: 'barber', accountId: -3 }]) {
    const res = response();
    await handler({ user }, res);
    assert.equal(res.code, 403);
  }
  assert.equal(calls, 0);
});
test('#151 returns only current account receipts, bounded and not cached', async () => {
  const calls = [];
  const db = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ id: 12, postId: 16, reason: 'spam', createdAt: '2026-11-20T09:00:00Z' }] };
  } };
  const res = response();
  await createMyReportsHandler(db)({ user: { role: 'customer', accountId: 21 }, query: { userId: '5' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.body.moderationStatusAvailable, false);
  assert.equal(res.body.limit, 50);
  assert.equal(res.body.reports.length, 1);
  assert.deepEqual(calls[0].values, [21]);
  assert.match(calls[0].sql, /WHERE user_id=\$1/);
  assert.match(calls[0].sql, /LIMIT 50/);
  assert.doesNotMatch(calls[0].sql, /details|phone|JOIN/);
});
test('#151 barber may see only own reports', async () => {
  const res = response();
  await createMyReportsHandler({ query: async (_, values) => {
    assert.deepEqual(values, [8]);return { rows: [] };
  } })({ user: { role: 'barber', accountId: 8 } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.reports, []);
});
test('#151 DB failures do not expose internal error or claim empty history', async () => {
  const res = response();
  await createMyReportsHandler({ query: async () => { throw Object.assign(new Error('secret connection'), { code: 'XX001' }); } })
    ({ user: { role: 'customer', accountId: 14 } }, res);
  assert.equal(res.code, 503);
  assert.ok(!JSON.stringify(res.body).includes('secret'));
});
test('#151 route is mounted behind auth middleware', () => {
  const fs = require('node:fs');
  const route = fs.readFileSync(require.resolve('../routes/social'), 'utf8');
  assert.ok(route.indexOf('router.use(authMiddleware)') < route.indexOf('router.get("/my-reports"')); 
});
