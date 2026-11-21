const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dbPath = require.resolve("../db");
assert.equal(require.cache[dbPath], undefined);
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => assert.fail("standart DB query chaqirilmasligi kerak"),
    connect: async () => assert.fail("DB ulanishi ochilmasligi kerak") } };
const { createBarberProfileHandlers } = require("../controllers/barbersController");
after(() => { delete require.cache[dbPath]; });

function response() {
  return { statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const profile = {
  id: 7, first_name: "Ali", last_name: "Valiyev", phone: "+998901234567",
  salon_name: "Ustara", address: "Toshkent", latitude: 41.31, longitude: 69.28,
  experience_years: 7, bio: "Barber", avatar_url: "https://cdn.example/avatar.jpg",
  specialty: "barber", verification_status: "approved", accepting_bookings: true,
  created_at: "2030-01-01T00:00:00.000Z",
};

test("barber o‘zining to‘liq profilini account ID bilan oladi", async () => {
  let queryCount = 0;
  const handlers = createBarberProfileHandlers({ query: async (sql, values) => {
    queryCount += 1;
    assert.match(sql, /WHERE b\.id=\$1 AND b\.user_id=\$2 AND u\.role='barber'/);
    assert.deepEqual(values, [7, 41]);
    return { rows: [profile] };
  } });
  const res = response();
  await handlers.getMyBarberProfile({ user: { role: "barber", profileId: 7, accountId: 41 } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { barber: profile });
  assert.equal(queryCount, 1);
});

test("barber ruxsat etilgan profil maydonlarini parametrli SQL bilan yangilaydi", async () => {
  let captured;
  const handlers = createBarberProfileHandlers({ query: async (sql, values) => {
    captured = { sql, values };
    return { rows: [profile] };
  } });
  const res = response();
  await handlers.refreshData({
    params: { id: "7" }, user: { role: "barber", profileId: 7, accountId: 41 },
    body: {
      first_name: "Ali", last_name: "Valiyev", salon_name: "Ustara", address: "Toshkent",
      location: { lat: 41.31, lng: 69.28 }, experience_years: 7, bio: "Barber",
      avatar_url: "https://cdn.example/avatar.jpg",
    },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "Barber profili yangilandi", data: profile });
  assert.match(captured.sql, /WHERE b\.id=\$1 AND b\.user_id=\$2/);
  assert.match(captured.sql, /u\.role='barber'/);
  assert.deepEqual(captured.values, [7, 41, "Ali", "Valiyev", "Ustara", "Toshkent", 7, "Barber",
    "https://cdn.example/avatar.jpg", 41.31, 69.28]);
  assert.doesNotMatch(captured.sql, /user_id\s*=\$\d+\s*,|verification_status\s*=|specialty\s*=/);
});

test("boshqa barber profili va customer yangilash amali rad etiladi", async () => {
  const handlers = createBarberProfileHandlers({ query: async () => assert.fail("DB so‘rovi yuborilmasligi kerak") });
  const other = response();
  await handlers.refreshData({ params: { id: "8" }, user: { role: "barber", profileId: 7, accountId: 41 }, body: { bio: "Matn" } }, other);
  assert.equal(other.statusCode, 403);
  const customer = response();
  await handlers.refreshData({ params: { id: "7" }, user: { role: "customer", profileId: 7, accountId: 41 }, body: { bio: "Matn" } }, customer);
  assert.equal(customer.statusCode, 403);
});

test("noto‘g‘ri ism, koordinata, tajriba va himoyalangan maydon DB ga yetib bormaydi", async () => {
  let queryCount = 0;
  const handlers = createBarberProfileHandlers({ query: async () => { queryCount += 1; return { rows: [profile] }; } });
  const base = { params: { id: "7" }, user: { role: "barber", profileId: 7, accountId: 41 } };
  for (const body of [
    { first_name: "  ", last_name: "Valiyev" },
    { salon_name: "A" },
    { location: { lat: 91, lng: 69 } },
    { experience_years: -1 },
    { experience_years: 1.5 },
    { verification_status: "approved" },
    { accepting_bookings: false },
    { user_id: 999 },
    { role: "admin" },
  ]) {
    const res = response();
    await handlers.refreshData({ ...base, body }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(queryCount, 0);
});

test("ixtiyoriy maydonlarni bo‘shatish SQL ga NULL sifatida yuboriladi", async () => {
  let values;
  const handlers = createBarberProfileHandlers({ query: async (_sql, params) => {
    values = params;
    return { rows: [profile] };
  } });
  const res = response();
  await handlers.refreshData({
    params: { id: "7" }, user: { role: "barber", profileId: 7, accountId: 41 },
    body: { salon_name: "", address: null, location: null, experience_years: null, bio: "", avatar_url: "" },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(values, [7, 41, null, null, null, null, null, null, null]);
});

test("public profil tasdiqlangan barberning ruxsat etilgan maydonlarini qaytaradi", async () => {
  let captured;
  const handlers = createBarberProfileHandlers({ query: async (sql, values) => {
    captured = { sql, values };
    return { rows: [{ id: 7, first_name: "Ali", last_name: "Valiyev", specialty: "barber",
      salon_name: profile.salon_name, address: profile.address, latitude: profile.latitude,
      longitude: profile.longitude, experience_years: profile.experience_years,
      bio: profile.bio, avatar_url: profile.avatar_url }] };
  } });
  const res = response();
  await handlers.takeBarberById({ params: { id: "7" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(captured.values, [7]);
  assert.match(captured.sql, /verification_status='approved'/);
  assert.doesNotMatch(captured.sql.split(/\bFROM\b/i)[0], /phone|user_id|verification_status|created_at/i);
  assert.equal(Object.hasOwn(res.body, "phone"), false);
  assert.equal(Object.hasOwn(res.body, "user_id"), false);
});

test("barber profil migration CASE qiymatini taqqoslashda qavs bilan ajratadi", () => {
  const migration = fs.readFileSync(path.resolve(__dirname,
    "../database/migrations/20261117_barber_profile.sql"), "utf8");
  assert.match(migration,
    /column_type IS DISTINCT FROM \(CASE WHEN column_spec\.name='bio' THEN 'character varying\(200\)' ELSE column_spec\.type_name END\)/);
});
