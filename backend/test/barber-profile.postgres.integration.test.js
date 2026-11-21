const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { testTarget, assertTestConnection } = require("./helpers/testDatabaseTarget");

const enabled = Boolean(process.env.USTARA_TEST_DATABASE_URL);

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function callApi(server, method, route, body, token) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const headers = {};
  if (payload) {
    headers["content-type"] = "application/json";
    headers["content-length"] = payload.length;
  }
  if (token) headers.authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port: server.address().port,
      method,
      path: route,
      headers,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch {
          reject(new Error("API javobi JSON formatida emas"));
        }
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error("Mahalliy API so‘rovi vaqti tugadi")));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

test("barber profil API haqiqiy PostgreSQL bilan tekshiriladi", { skip: !enabled }, async (t) => {
  const target = testTarget(process.env.USTARA_TEST_DATABASE_URL, "Barber profil integratsiya bazasi");
  const pool = new Pool({ connectionString: process.env.USTARA_TEST_DATABASE_URL, ssl: false, max: 1 });
  const fixtures = [];
  let server;
  let injectedDatabase = false;
  let previousDatabaseModule;
  let previousSecret;
  let previousDotenvConfig;
  let dotenv;
  let appModulePath;
  let cleanupFailure;

  t.after(async () => {
    try {
      if (server?.listening) await closeServer(server);
      if (fixtures.length) {
        const client = await pool.connect();
        try {
          await assertTestConnection(client, target);
          await client.query("BEGIN");
          for (const fixture of [...fixtures].reverse()) {
            const deleted = await client.query(
              "DELETE FROM users WHERE id=$1 AND phone=$2 RETURNING id",
              [fixture.userId, fixture.phone],
            );
            if (deleted.rowCount !== 1) throw new Error("Faqat test uchun yaratilgan account ID tozalanmadi");
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        } finally {
          client.release();
        }
        const remaining = await pool.query(
          "SELECT count(*)::int AS n FROM users WHERE id=ANY($1::int[])",
          [fixtures.map((fixture) => fixture.userId)],
        );
        if (remaining.rows[0].n !== 0) throw new Error("Test account qatorlari tozalangandan keyin ham qoldi");
      }
    } catch {
      cleanupFailure = new Error("Test ma’lumotlarini ID bo‘yicha tozalash yoki tekshirish muvaffaqiyatsiz bo‘ldi");
    } finally {
      if (injectedDatabase) {
        if (previousDatabaseModule) require.cache[require.resolve("../db")] = previousDatabaseModule;
        else delete require.cache[require.resolve("../db")];
      }
      if (appModulePath) delete require.cache[appModulePath];
      if (dotenv && previousDotenvConfig) dotenv.config = previousDotenvConfig;
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
      await pool.end();
    }
    if (cleanupFailure) throw cleanupFailure;
  });

  const identity = await assertTestConnection(pool, target);
  assert.equal(identity.database, "ustara_test_db");
  const schema = await pool.query("SELECT current_schema() AS schema");
  assert.equal(schema.rows[0].schema, "public");

  const migrationState = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM ustara_schema_migrations
       WHERE version='20261116_account_profile_deletion_integrity') AS account_migration,
      (SELECT count(*)::int FROM ustara_schema_migrations
       WHERE version='20261117_barber_profile') AS profile_migration,
      (SELECT count(*)::int FROM pg_attribute
       WHERE attrelid='public.barbers'::regclass
         AND attname=ANY(ARRAY['salon_name','address','latitude','longitude','experience_years','bio','avatar_url'])
         AND attnum>0 AND NOT attisdropped) AS profile_columns
  `);
  assert.deepEqual(migrationState.rows[0], {
    account_migration: 1,
    profile_migration: 1,
    profile_columns: 7,
  });

  const activeAdmin = await pool.query(
    "SELECT id FROM admin_accounts WHERE is_active=TRUE ORDER BY id LIMIT 1",
  );
  previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  const secret = process.env.JWT_SECRET;
  const adminToken = activeAdmin.rowCount
    ? jwt.sign({ id: activeAdmin.rows[0].id, role: "admin" }, secret, { expiresIn: "5m" })
    : null;
  const makeToken = (fixture) => jwt.sign({
    id: fixture.userId,
    profileId: fixture.profileId,
    role: fixture.role,
    sessionVersion: 0,
  }, secret, { expiresIn: "5m" });

  const dotenvPackage = require("dotenv");
  dotenv = dotenvPackage;
  previousDotenvConfig = dotenv.config;
  dotenv.config = () => ({ parsed: {} });
  const databasePath = require.resolve("../db");
  previousDatabaseModule = require.cache[databasePath];
  if (previousDatabaseModule) throw new Error("Barber profil integratsiya jarayoni oldin DB modulini yuklagan");
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: pool,
  };
  injectedDatabase = true;
  appModulePath = require.resolve("../server");
  const app = require(appModulePath);
  dotenv.config = previousDotenvConfig;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  async function createFixture(role, verification = "approved") {
    const client = await pool.connect();
    const phone = `+998${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    try {
      await client.query("BEGIN");
      const account = await client.query(
        "INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id",
        [phone, "profile-test-only-hash", role],
      );
      const userId = account.rows[0].id;
      let profile;
      if (role === "barber") {
        profile = await client.query(
          `INSERT INTO barbers(user_id,first_name,last_name,specialty,verification_status)
           VALUES($1,$2,$3,'barber',$4) RETURNING id`,
          [userId, "Sinov", `Barber${userId}`, verification],
        );
      } else {
        profile = await client.query(
          "INSERT INTO customers(user_id,first_name,last_name) VALUES($1,$2,$3) RETURNING id",
          [userId, "Sinov", `Customer${userId}`],
        );
      }
      await client.query("COMMIT");
      const fixture = { userId, profileId: profile.rows[0].id, phone, role };
      fixtures.push(fixture);
      return fixture;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const barber = await createFixture("barber");
  const otherBarber = await createFixture("barber");
  const pendingBarber = await createFixture("barber", "pending");
  const customer = await createFixture("customer");
  const barberToken = makeToken(barber);
  const customerToken = makeToken(customer);

  await t.test("tasdiqlangan barberning ommaviy profili olinadi", async () => {
    const response = await callApi(server, "GET", `/api/barbers/${barber.profileId}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.id, barber.profileId);
    assert.equal(response.body.first_name, "Sinov");
  });

  await t.test("tasdiqlanmagan barber ommaviy profil va ro‘yxatda ko‘rinmaydi", async () => {
    const profile = await callApi(server, "GET", `/api/barbers/${pendingBarber.profileId}`);
    assert.equal(profile.status, 404);
    const list = await callApi(server, "GET", "/api/barbers");
    assert.equal(list.status, 200);
    assert.equal(list.body.some((item) => item.id === pendingBarber.profileId), false);
  });

  await t.test("barber o‘zining to‘liq profilini oladi", async () => {
    const response = await callApi(server, "GET", "/api/barbers/me", undefined, barberToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.barber.id, barber.profileId);
    assert.equal(response.body.barber.phone, barber.phone);
  });

  await t.test("profil maydonlari API orqali saqlanib, PostgreSQL va API javobida qayta o‘qiladi", async () => {
    const update = await callApi(server, "PUT", `/api/barbers/${barber.profileId}`, {
      salonName: "Sinov saloni",
      address: "Toshkent, Sinov ko‘chasi",
      location: { lat: 41.3111, lng: 69.2797 },
      experience: 8,
      about: "Profil integratsiya sinovi",
      avatarPhoto: "https://images.example.test/profile-fixture.jpg",
    }, barberToken);
    assert.equal(update.status, 200);
    const stored = await pool.query(
      `SELECT salon_name,address,latitude,longitude,experience_years,bio,avatar_url
       FROM barbers WHERE id=$1`,
      [barber.profileId],
    );
    assert.deepEqual(stored.rows[0], {
      salon_name: "Sinov saloni",
      address: "Toshkent, Sinov ko‘chasi",
      latitude: 41.3111,
      longitude: 69.2797,
      experience_years: 8,
      bio: "Profil integratsiya sinovi",
      avatar_url: "https://images.example.test/profile-fixture.jpg",
    });
    const own = await callApi(server, "GET", "/api/barbers/me", undefined, barberToken);
    assert.equal(own.status, 200);
    assert.equal(own.body.barber.salon_name, stored.rows[0].salon_name);
    const publicProfile = await callApi(server, "GET", `/api/barbers/${barber.profileId}`);
    assert.equal(publicProfile.status, 200);
    assert.equal(publicProfile.body.avatar_url, stored.rows[0].avatar_url);
  });

  await t.test("barber boshqa barber profilini o‘zgartira olmaydi", async () => {
    const before = await pool.query(
      "SELECT salon_name,address,bio FROM barbers WHERE id=$1",
      [otherBarber.profileId],
    );
    const response = await callApi(server, "PUT", `/api/barbers/${otherBarber.profileId}`, {
      bio: "Ruxsatsiz yozuv",
    }, barberToken);
    assert.equal(response.status, 403);
    const after = await pool.query(
      "SELECT salon_name,address,bio FROM barbers WHERE id=$1",
      [otherBarber.profileId],
    );
    assert.deepEqual(after.rows, before.rows);
  });

  await t.test("customer barber profilini o‘zgartira olmaydi", async () => {
    const response = await callApi(server, "PUT", `/api/barbers/${barber.profileId}`, {
      bio: "Customer yozuvi",
    }, customerToken);
    assert.equal(response.status, 403);
  });

  await t.test("admin barber profilini o‘zgartira olmaydi", { skip: !adminToken }, async () => {
    const response = await callApi(server, "PUT", `/api/barbers/${barber.profileId}`, {
      bio: "Admin yozuvi",
    }, adminToken);
    assert.equal(response.status, 403);
  });

  await t.test("noto‘g‘ri koordinata, tajriba va himoyalangan maydonlar rad etiladi", async () => {
    const before = await pool.query(
      `SELECT salon_name,address,latitude,longitude,experience_years,bio,avatar_url
       FROM barbers WHERE id=$1`,
      [barber.profileId],
    );
    for (const body of [
      { location: { lat: 91, lng: 69 } },
      { location: { lat: 41, lng: -181 } },
      { experience: -1 },
      { experience: 1.5 },
      { first_name: "   ", last_name: "Sinov" },
      { verification_status: "rejected" },
      { user_id: otherBarber.userId },
      { avatarPhoto: "ftp://images.example.test/profile.jpg" },
    ]) {
      const response = await callApi(server, "PUT", `/api/barbers/${barber.profileId}`, body, barberToken);
      assert.equal(response.status, 400);
    }
    const after = await pool.query(
      `SELECT salon_name,address,latitude,longitude,experience_years,bio,avatar_url
       FROM barbers WHERE id=$1`,
      [barber.profileId],
    );
    assert.deepEqual(after.rows, before.rows);
  });

  await t.test("ixtiyoriy profil maydonlari bo‘shatilganda PostgreSQL NULL saqlaydi", async () => {
    const response = await callApi(server, "PUT", `/api/barbers/${barber.profileId}`, {
      salonName: "",
      address: null,
      location: null,
      experience: null,
      about: "",
      avatarPhoto: "",
    }, barberToken);
    assert.equal(response.status, 200);
    const stored = await pool.query(
      `SELECT salon_name,address,latitude,longitude,experience_years,bio,avatar_url
       FROM barbers WHERE id=$1`,
      [barber.profileId],
    );
    assert.deepEqual(stored.rows[0], {
      salon_name: null,
      address: null,
      latitude: null,
      longitude: null,
      experience_years: null,
      bio: null,
      avatar_url: null,
    });
    const own = await callApi(server, "GET", "/api/barbers/me", undefined, barberToken);
    assert.equal(own.body.barber.salon_name, null);
    assert.equal(own.body.barber.latitude, null);
    assert.equal(own.body.barber.experience_years, null);
  });

  await t.test("ommaviy profil maxfiy va ichki maydonlarni oshkor qilmaydi", async () => {
    const response = await callApi(server, "GET", `/api/barbers/${barber.profileId}`);
    assert.equal(response.status, 200);
    for (const field of ["phone", "user_id", "userId", "account_id", "accountId", "verification_status", "created_at", "password", "role"]) {
      assert.equal(Object.hasOwn(response.body, field), false, `${field} ommaviy javobda bo‘lmasin`);
    }
  });
});
