'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

// The controllers use only this injected stub. Never load live DB credentials.
const dbPath = require.resolve('../db');
assert.equal(require.cache[dbPath], undefined);
let handler = async () => { throw new Error('Unexpected database query'); };
const db = { query: (...args) => handler(...args) };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const social = require('../controllers/socialController');
const reviews = require('../controllers/reviewsController');
after(() => { delete require.cache[dbPath]; });

function response() {
  return {
    statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}
const post = {
  id: 17, barber_id: 23, first_name: 'Ali', last_name: 'Valiyev', salon_name: 'Salon',
  avatar_url: null, caption: 'Yangi ish', created_at: '2026-11-19T09:00:00Z', kind: 'portfolio',
  media: [], service_id: null, service_name: null, like_count: 3, comment_count: 0,
  liked_by_me: false, saved_by_me: false,
};

test('v157: guest portfolio displays only posts of an approved barber, without personal likes', async () => {
  const calls = [];
  handler = async (sql, params) => {
    calls.push({sql, params});
    if (sql.includes('FROM social_posts p JOIN barbers')) {
      assert.match(sql, /verification_status='approved'/);
      assert.deepEqual(params, [null, 100, 23]);
      return { rows: [post] };
    }
    if (sql.includes('FROM social_comments')) return { rows: [] };
    if (sql.includes('FROM social_follows WHERE barber_id')) {
      assert.deepEqual(params, [23, null]);
      return { rows: [{ followers: 4, following: 0 }] };
    }
    assert.fail('unexpected SQL statement');
  };
  const res = response();
  await social.getPortfolio({ params: { id: '23' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 3);
  assert.equal(res.body.posts.length, 1);
  assert.equal(res.body.posts[0].likedByMe, false);
  assert.equal(res.body.posts[0].saved, false);
  assert.equal(res.body.followerCount, 4);
  assert.equal(res.body.followingCount, 0);
  assert.ok(!JSON.stringify(res.body).includes('owner_user_id'));
});

test('v157: guest is blocked from /me/portfolio, and unapproved public profile does not leak content', async () => {
  handler = () => assert.fail('unauthorized query');
  const own = response();
  await social.getPortfolio({ params: { id: 'me' } }, own);
  assert.equal(own.statusCode, 403);
  const notPublished = response();
  handler = async (sql, params) => {
    if (sql.includes('FROM social_posts p JOIN barbers')) {
      assert.deepEqual(params, [null, 100, 23]);
      return { rows: [] };
    }
    if (sql.includes('SELECT 1 FROM barbers')) return { rowCount: 0, rows: [] };
    assert.fail('unexpected SQL');
  };
  await social.getPortfolio({ params: { id: '23' } }, notPublished);
  assert.equal(notPublished.statusCode, 404);
  assert.equal(notPublished.body.posts, undefined);
});

test('v157: public reviews are guest-readable but private booking/profile IDs are omitted', async () => {
  let queries = 0;
  handler = async (sql, params) => {
    queries++;
    assert.deepEqual(params, [23]);
    if (sql.includes('SELECT id FROM barbers')) {
      assert.match(sql, /verification_status='approved'/);
      return { rowCount: 1, rows: [{ id: 23 }] };
    }
    if (sql.includes('FROM barber_reviews r')) return { rows: [{
      id: 8, booking_id: 77, customer_id: 91, barber_id: 23, rating: 5,
      text: 'Yaxshi', reply: 'Rahmat!', created_at: '2026-11-19T09:00:00Z',
      first_name: 'Dilnoza', last_name: 'Karimova',
    }] };
    assert.fail('unexpected SQL');
  };
  const res = response();
  await reviews.getPublicReviews({ params: { id: '23' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(queries, 2);
  assert.equal(res.body.summary.average, 5);
  assert.deepEqual(Object.keys(res.body.reviews[0]), ['id', 'customer', 'rating', 'text', 'reply', 'date']);
  assert.ok(!('bookingId' in res.body.reviews[0]));
  assert.ok(!('customerId' in res.body.reviews[0]));
});

test('v157: unapproved profile reviews and invalid IDs are not exposed', async () => {
  handler = async (sql, params) => {
    assert.match(sql, /verification_status='approved'/);
    assert.deepEqual(params, [23]);
    return { rowCount: 0, rows: [] };
  };
  const hidden = response();
  await reviews.getPublicReviews({ params: { id: '23' } }, hidden);
  assert.equal(hidden.statusCode, 404);
  handler = () => assert.fail('must not query database for invalid ID');
  for (const id of ['no', '0', '1.1', '999999999999999999']) {
    const res = response();
    await reviews.getPublicReviews({ params: { id } }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('v157: review creation still needs an authenticated customer', async () => {
  handler = () => assert.fail('unauthenticated writes must not query database');
  const res = response();
  await reviews.create({ params: { id: '123' }, body: { rating: 5, text: 'OK' } }, res);
  assert.equal(res.statusCode, 403);
});
