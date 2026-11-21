const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { hashPassword } = require("../utils/passwordPolicy");

// Javob regressiyalari offline tekshiriladi; DB, dotenv yoki tashqi API ishlatilmaydi.
let query;
const dbPath = require.resolve("../db");
assert.equal(require.cache[dbPath], undefined);
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { query: (sql, ...args) => {
    if (sql.startsWith('INSERT INTO account_device_sessions(')) return Promise.resolve({rows:[],rowCount:1});
    return query(sql, ...args);
  }, connect: async () => assert.fail("DB ulanishi kutilmagan") } };

// Rate-limit saqlashini chetlab, haqiqiy login SELECT, parol tekshiruvi, JWT
// yaratish va javob mappingini sinaymiz; rate-limit xatti-harakati sinovdan tashqari.
const protection = require("../services/loginProtection");
const originalProtection = protection.createLoginProtection;
protection.createLoginProtection = (pool) => async (_identity, authenticate) => authenticate(pool);
const barbers = require("../controllers/barbersController");
const { createRoleLogin } = require("../services/loginAuthentication");
protection.createLoginProtection = originalProtection;
const bookings = require("../controllers/bookingsController");
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "offline-response-regression-only";
after(() => {
  delete require.cache[dbPath];
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

function response() {
  return { statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return this; } };
}
const rows = (row) => ({ rows: [row], rowCount: 1 });
const profile = { id: 23, first_name: "Ali", last_name: "Valiyev",
  phone: "+998901234567", created_at: "2030-01-01T00:00:00Z" };

for (const [name, handler, req, specialty, extra, wrapped, params] of [
  ["list", "getBarbers", {}, "barber", { verification_status: "approved" }, "list", ["approved", "barber"]],
  ["detail", "takeBarberById", { params: { id: "23" } }, "cosmetolog", {}, "detail", [23]],
  ["me", "getMyBarberProfile", { user: { role: "barber", profileId: 23, accountId: 91 } },
    "stylist", { verification_status: "approved" }, "me", [23, 91]],
]) {
test(`barber ${name} selects DB specialty and returns its API fields`, async () => {
    const base = { ...profile, ...extra, specialty };
    const databaseRow = wrapped === "list" ? {
      ...base,
      user_id: 91,
      salon_name: "Ustara",
      address: "Toshkent",
      latitude: 41.31,
      longitude: 69.28,
      avatar_url: "https://cdn.example/avatar.jpg",
      starting_price: "25000.00",
      service_ids: [31, 32],
      services: [{ id: 31, name: "Soch olish", description: null, category: null,
        minPrice: 25000, maxPrice: 25000, barberIds: [23], salonIds: [] }],
    } : base;
    const expected = wrapped === "list" ? {
      id: base.id,
      first_name: base.first_name,
      last_name: base.last_name,
      specialty: base.specialty,
      salonName: "Ustara",
      address: "Toshkent",
      location: { lat: 41.31, lng: 69.28 },
      avatarPhoto: "https://cdn.example/avatar.jpg",
      startingPrice: 25000,
      serviceIds: [31, 32],
      services: [{ id: 31, name: "Soch olish", description: null, category: null,
        minPrice: 25000, maxPrice: 25000, barberIds: [23], salonIds: [] }],
    } : { ...base, salon_name: null, address: null,
      latitude: null, longitude: null, experience_years: null, bio: null, avatar_url: null };
    query = async (sql, values) => {
      assert.match(sql.split(/\bFROM\b/i)[0], /\bb\.specialty\b/);
      assert.deepEqual(values, params);
      if (wrapped === "me") assert.match(sql, /WHERE b\.id=\$1 AND b\.user_id=\$2/);
      else if (wrapped === "list") {
        assert.match(sql, /WHERE b\.verification_status=\$1/);
        assert.match(sql, /u\.role=\$2/);
        assert.match(sql, /MIN\(s\.price\)/);
        assert.match(sql, /json_agg\(json_build_object/);
        assert.match(sql.split(/\bFROM\b/i)[0], /service_summary\.services/);
        assert.doesNotMatch(sql.split(/\bFROM\b/i)[0], /phone|user_id|created_at|verification_status/i);
      }
      else {
        assert.match(sql, /b\.verification_status='approved'/);
        if (wrapped === "detail") { assert.match(sql.split(/\bFROM\b/i)[0], /u\.phone AS phone/); assert.doesNotMatch(sql.split(/\bFROM\b/i)[0], /customer|verification_status|user_id|created_at/i); }
      }
      return rows(wrapped === "list" ? databaseRow : expected);
    };
    const res = response();
    await barbers[handler](req, res);
    assert.equal(res.statusCode, 200);
    const publicFields = ["id", "first_name", "last_name", "salon_name", "address", "latitude", "longitude", "experience_years", "bio", "avatar_url", "specialty", "phone"];
    assert.deepEqual(res.body, wrapped === "list" ? [expected] : wrapped === "me" ? { barber: expected }
      : Object.fromEntries(publicFields.map((key) => [key, expected[key]])));
  });
}

test("barber ommaviy katalogida natija bo‘lmasa bo‘sh massiv qaytadi", async () => {
  query = async (_sql, values) => {
    assert.deepEqual(values, ["approved", "barber"]);
    return { rows: [], rowCount: 0 };
  };
  const res = response();
  await barbers.getBarbers({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test("barber login returns DB specialty inside barber without changing JWT identity", async () => {
  const password = "ResponseTest123";
  const passwordHash = await hashPassword(password);
  for (const specialty of ["barber", "cosmetolog", "stylist"]) {
    query = async (sql, values) => {
      assert.match(sql.split(/\bFROM\b/i)[0], /\bp\.specialty\b/);
      assert.deepEqual(values, [profile.phone]);
      return rows({ ...profile, specialty, user_id: 91, role: "barber",
        password: passwordHash, session_version: 4, verification_status: "approved" });
    };
    const res = response();
    await barbers.loginBarber({ body: { phone: profile.phone, password }, socket: { remoteAddress: "127.0.0.1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.barber, { id: 23, first_name: profile.first_name,
      last_name: profile.last_name, phone: profile.phone, specialty });
    assert.equal(res.body.verification_status, "approved");
    assert.deepEqual(Object.keys(res.body).sort(), ["barber", "message", "token", "verification_status"]);
    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.equal(claims.id, 91);
    assert.equal(claims.profileId, 23);
    assert.equal(claims.role, "barber");
    assert.equal(claims.sessionVersion, 4);
  }
});

test("shared login mapping leaves customer response unchanged", async () => {
  const password = "ResponseTest123";
  const passwordHash = await hashPassword(password);
  query = async (sql) => {
    assert.doesNotMatch(sql, /p\.specialty/);
    return rows({ ...profile, user_id: 91, role: "customer", password: passwordHash });
  };
  const res = response();
  await createRoleLogin("customer", require("../db"))({ body: { phone: profile.phone, password },
    socket: { remoteAddress: "127.0.0.1" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.customer, { id: 23, first_name: profile.first_name,
    last_name: profile.last_name, phone: profile.phone });
  assert.deepEqual(Object.keys(res.body).sort(), ["customer", "message", "token"]);
});

// Turli account, profil va xizmat ID’lari identifikatorlarni adashtirishni aniqlaydi.
const booking = { id: 61, customer_id: 12, barber_id: 23, service_id: 34,
  customer_first_name: "Vali", customer_last_name: "Aliyev",
  barber_first_name: "Ali", barber_last_name: "Valiyev", service_name: "Soch olish",
  booking_time: "2030-01-01T05:00:00Z", duration_minutes: 30,
  booking_end: "2030-01-01T05:30:00Z", status: "pending", created_at: "2029-12-31T00:00:00Z" };
for (const [handler, roles] of [["getBooking", ["customer", "barber"]],
  ["getBookingById", ["customer", "barber", "admin"]]]) {
  for (const role of roles) {
    test(`booking ${handler} (${role}) returns profile/service IDs and preserves scope`, async () => {
      const detail = handler === "getBookingById";
      const profileId = role === "customer" ? 12 : 23;
      query = async (sql, values) => {
        // The booking reader probes optional booking_services schema before
        // attaching service snapshots; this fixture models the older schema.
        if (sql.includes("to_regclass('booking_services')")) return { rows: [{ ready: false }], rowCount: 1 };
        const select = sql.split(/\bFROM\b/i)[0];
        for (const key of ["customer_id", "barber_id", "service_id"]) {
          assert.match(select, new RegExp(`\\bbookings\\.${key}\\b`));
        }
        assert.deepEqual(values, detail ? role === "admin" ? [61] : [61, profileId] : [profileId]);
        if (role !== "admin") assert.match(sql,
          new RegExp(`(?:WHERE|AND) bookings\\.${role}_id\\s*=\\s*\\$${detail ? 2 : 1}`));
        return rows(booking);
      };
      const res = response();
      await bookings[handler]({ user: { role, profileId, accountId: 91 }, params: { id: "61" } }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, detail ? booking : [booking]);
    });
  }
}
