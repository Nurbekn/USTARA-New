const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { Pool } = require("pg");
const { testTarget, assertTestConnection } = require("./helpers/testDatabaseTarget");

const TEST_USER = "ustara_account_test";
const enabled = process.env.NODE_ENV === "test"
  && process.env.USTARA_EXPLORE_CATALOG_TESTS === "I_AUTHORIZE_TEST_DATA"
  && Boolean(process.env.USTARA_TEST_DATABASE_URL);

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function getDirectory(server) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: "127.0.0.1",
      port: server.address().port,
      path: "/api/barbers",
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({
            status: response.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString()),
          });
        } catch {
          reject(new Error("Katalog API javobi JSON formatida emas"));
        }
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error("Katalog API so‘rovi vaqti tugadi")));
    request.on("error", reject);
  });
}

test("Explore katalog API haqiqiy PostgreSQL bilan tekshiriladi", { skip: !enabled }, async (t) => {
  const target = testTarget(
    process.env.USTARA_TEST_DATABASE_URL,
    "Explore katalog test bazasi",
    [TEST_USER],
  );
  const pool = new Pool({
    connectionString: process.env.USTARA_TEST_DATABASE_URL,
    ssl: false,
    max: 1,
  });
  const fixtures = [];
  let server;
  let databaseInjected = false;
  let previousDatabaseModule;
  let appModulePath;
  let dotenv;
  let previousDotenvConfig;
  const previousJwtSecret = process.env.JWT_SECRET;
  let cleanupFailure;

  t.after(async () => {
    try {
      if (server?.listening) await closeServer(server);
      if (fixtures.length) {
        const client = await pool.connect();
        try {
          await assertTestConnection(client, target, TEST_USER);
          await client.query("BEGIN");
          for (const fixture of [...fixtures].reverse()) {
            const deleted = await client.query(
              "DELETE FROM users WHERE id=$1 AND phone=$2 RETURNING id",
              [fixture.userId, fixture.phone],
            );
            if (deleted.rowCount !== 1) throw new Error("Test account ID bo‘yicha topilmadi");
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
        if (remaining.rows[0].n !== 0) throw new Error("Test account qatorlari cleanupdan keyin qoldi");
      }
    } catch {
      cleanupFailure = new Error("Test yozuvlarini faqat o‘z ID’lari bilan tozalash muvaffaqiyatsiz bo‘ldi");
    } finally {
      if (databaseInjected) {
        if (previousDatabaseModule) require.cache[require.resolve("../db")] = previousDatabaseModule;
        else delete require.cache[require.resolve("../db")];
      }
      if (appModulePath) delete require.cache[appModulePath];
      if (dotenv && previousDotenvConfig) dotenv.config = previousDotenvConfig;
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
      await pool.end();
    }
    if (cleanupFailure) throw cleanupFailure;
  });

  const identity = await assertTestConnection(pool, target, TEST_USER);
  assert.equal(identity.database, "ustara_test_db");
  const relations = await pool.query(`
    SELECT current_schema() AS schema,
           to_regclass('public.users') IS NOT NULL AS users_exists,
           to_regclass('public.barbers') IS NOT NULL AS barbers_exists,
           to_regclass('public.services') IS NOT NULL AS services_exists,
           to_regclass('public.ustara_schema_migrations') IS NOT NULL AS migrations_exists
  `);
  assert.equal(relations.rows[0].schema, "public");
  assert.equal(relations.rows[0].users_exists, true);
  assert.equal(relations.rows[0].barbers_exists, true);
  assert.equal(relations.rows[0].services_exists, true);
  assert.equal(relations.rows[0].migrations_exists, true);

  const schemaState = await pool.query(`
    SELECT
           (SELECT count(*)::int FROM pg_attribute
            WHERE attrelid=to_regclass('public.barbers')
              AND attname=ANY(ARRAY['salon_name','address','latitude','longitude','avatar_url'])
              AND attnum>0 AND NOT attisdropped) AS explore_profile_columns,
           (SELECT count(*)::int FROM ustara_schema_migrations
            WHERE version='20261117_barber_profile') AS profile_migration
  `);
  assert.equal(schemaState.rows[0].explore_profile_columns, 5);
  assert.equal(schemaState.rows[0].profile_migration, 1);

  const dotenvPackage = require("dotenv");
  dotenv = dotenvPackage;
  previousDotenvConfig = dotenv.config;
  dotenv.config = () => ({ parsed: {} });
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  const databasePath = require.resolve("../db");
  previousDatabaseModule = require.cache[databasePath];
  if (previousDatabaseModule) throw new Error("Test jarayoni oldin backend DB modulini yuklagan");
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: pool,
  };
  databaseInjected = true;
  appModulePath = require.resolve("../server");
  const app = require(appModulePath);
  dotenv.config = previousDotenvConfig;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  async function createBarber({ verification, salonName, address, latitude, longitude, avatarUrl, services = [] }) {
    const client = await pool.connect();
    const phone = `+998${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    try {
      await assertTestConnection(client, target, TEST_USER);
      await client.query("BEGIN");
      const account = await client.query(
        "INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id",
        [phone, "explore-test-only-password", "barber"],
      );
      const userId = account.rows[0].id;
      const profile = await client.query(
        `INSERT INTO barbers(
           user_id,first_name,last_name,specialty,verification_status,
           salon_name,address,latitude,longitude,avatar_url
         ) VALUES($1,$2,$3,'barber',$4,$5,$6,$7,$8,$9) RETURNING id`,
        [userId, "Usta", `Explore${userId}`, verification, salonName, address, latitude, longitude, avatarUrl],
      );
      const serviceIds = [];
      for (const service of services) {
        const inserted = await client.query(
          "INSERT INTO services(barber_id,name,price,duration_minutes) VALUES($1,$2,$3,$4) RETURNING id",
          [profile.rows[0].id, service.name, service.price, service.duration],
        );
        serviceIds.push(inserted.rows[0].id);
      }
      await client.query("COMMIT");
      const fixture = { userId, profileId: profile.rows[0].id, phone, serviceIds };
      fixtures.push(fixture);
      return fixture;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const approved = await createBarber({
    verification: "approved",
    salonName: "Explore Salon",
    address: "Toshkent, Explore manzil",
    latitude: 41.3111,
    longitude: 69.2797,
    avatarUrl: "https://images.example.test/explore-avatar.jpg",
    services: [
      { name: "Explore Soch xizmati", price: 35000, duration: 40 },
      { name: "Explore Soqol xizmati", price: 12000, duration: 20 },
      { name: "Explore Uslub xizmati", price: 24000, duration: 30 },
    ],
  });
  const pending = await createBarber({
    verification: "pending",
    salonName: "Yashirin Explore saloni",
    address: "Toshkent, ko‘rinmas manzil",
    latitude: 41.31,
    longitude: 69.27,
    avatarUrl: null,
  });

  const response = await getDirectory(server);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));
  const catalogRows = response.body;
  const listedBarber = catalogRows.find((barber) => barber.id === approved.profileId);
  assert.ok(listedBarber);
  const { normalizeCatalog, selectResults } = await import("../../frontend/src/pages/user/explore/catalog.js");
  const catalog = normalizeCatalog({
    barbers: catalogRows,
    salons: [],
    services: catalogRows.flatMap((barber) => barber.services || []),
  });

  await t.test("tasdiqlangan barber katalogda chiqadi", async () => {
    assert.ok(catalogRows.some((barber) => barber.id === approved.profileId));
  });

  await t.test("tasdiqlanmagan barber katalogda chiqmaydi", async () => {
    assert.equal(catalogRows.some((barber) => barber.id === pending.profileId), false);
  });

  await t.test("ommaviy katalog maxfiy va ichki maydonlarni qaytarmaydi", async () => {
    for (const field of ["phone", "user_id", "userId", "account_id", "accountId", "created_at", "verification_status", "password", "role"]) {
      assert.equal(Object.hasOwn(listedBarber, field), false, `${field} ommaviy javobda bo‘lmasin`);
    }
  });

  await t.test("barber ID va profil maydonlari to‘g‘ri qaytadi", async () => {
    assert.equal(listedBarber.id, approved.profileId);
    assert.equal(listedBarber.salonName, "Explore Salon");
    assert.equal(listedBarber.avatarPhoto, "https://images.example.test/explore-avatar.jpg");
    assert.equal(listedBarber.address, "Toshkent, Explore manzil");
    assert.deepEqual(listedBarber.location, { lat: 41.3111, lng: 69.2797 });
  });

  await t.test("xizmat nomlari va ID’lari to‘g‘ri qaytadi", async () => {
    assert.deepEqual(listedBarber.serviceIds, approved.serviceIds);
    assert.deepEqual(listedBarber.services.map((service) => service.id), approved.serviceIds);
    assert.deepEqual(listedBarber.services.map((service) => service.name), [
      "Explore Soch xizmati",
      "Explore Soqol xizmati",
      "Explore Uslub xizmati",
    ]);
  });

  await t.test("eng past xizmat narxi to‘g‘ri qaytadi", async () => {
    assert.equal(listedBarber.startingPrice, 12000);
  });

  await t.test("barber va salon nomi bo‘yicha qidiruv ishlaydi", async () => {
    assert.ok(selectResults(catalog, "barbers", new URLSearchParams(`q=Explore${approved.userId}`), null)
      .some((barber) => barber.id === approved.profileId));
    assert.ok(selectResults(catalog, "barbers", new URLSearchParams("q=Explore Salon"), null)
      .some((barber) => barber.id === approved.profileId));
  });

  await t.test("xizmat nomi bo‘yicha qidiruv ishlaydi", async () => {
    assert.ok(selectResults(catalog, "barbers", new URLSearchParams("q=Explore Soqol xizmati"), null)
      .some((barber) => barber.id === approved.profileId));
  });

  await t.test("narx filtri mavjud xizmat narxlariga mos ishlaydi", async () => {
    assert.ok(selectResults(catalog, "barbers", new URLSearchParams("min=20000"), null)
      .some((barber) => barber.id === approved.profileId));
    assert.equal(selectResults(catalog, "barbers", new URLSearchParams("min=36000"), null)
      .some((barber) => barber.id === approved.profileId), false);
  });

  await t.test("masofa filtri koordinatalardan hisoblanadi", async () => {
    assert.ok(selectResults(catalog, "barbers", new URLSearchParams("distance=1"),
      { lat: 41.3111, lng: 69.2797 }).some((barber) => barber.id === approved.profileId));
    assert.equal(selectResults(catalog, "barbers", new URLSearchParams("distance=1"),
      { lat: 0, lng: 0 }).some((barber) => barber.id === approved.profileId), false);
  });

  await t.test("mos natija bo‘lmasa bo‘sh massiv qaytadi", async () => {
    assert.deepEqual(selectResults(catalog, "barbers", new URLSearchParams("q=ExploreTopilmadi"), null), []);
  });
});
