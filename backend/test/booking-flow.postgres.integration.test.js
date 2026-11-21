const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { testTarget, assertTestConnection } = require("./helpers/testDatabaseTarget");

const TEST_USER = "ustara_account_test";
const enabled = process.env.NODE_ENV === "test"
  && process.env.USTARA_BOOKING_FLOW_TESTS === "I_AUTHORIZE_TEST_DATA"
  && Boolean(process.env.USTARA_TEST_DATABASE_URL);

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

function dateAfter(days) {
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const midnight = Date.parse(`${fields.year}-${fields.month}-${fields.day}T00:00:00Z`);
  return new Date(midnight + days * 86400000).toISOString().slice(0, 10);
}

test("booking oqimi haqiqiy PostgreSQL bilan tekshiriladi", { skip: !enabled }, async (t) => {
  const target = testTarget(
    process.env.USTARA_TEST_DATABASE_URL,
    "Booking oqimi integratsiya bazasi",
    [TEST_USER],
  );
  const pool = new Pool({
    connectionString: process.env.USTARA_TEST_DATABASE_URL,
    ssl: false,
    max: 2,
    connectionTimeoutMillis: 5000,
    application_name: "ustara_booking_flow_postgres_test",
    options: "-c search_path=public -c timezone=UTC",
  });
  const people = [];
  const serviceIds = [];
  const workingHourIds = [];
  const bookingIds = [];
  let server;
  let databaseInjected = false;
  let previousDatabaseModule;
  let appModulePath;
  let dotenv;
  let previousDotenvConfig;
  let previousJwtSecret;
  let notifierModule;
  let previousNotifierFactory;
  let cleanupFailure;

  t.after(async () => {
    try {
      if (server?.listening) await closeServer(server);
      if (people.length) {
        const identity = await pool.connect();
        try {
          await assertTestConnection(identity, target, TEST_USER);
          await identity.query("BEGIN");
          const customerIds = people.filter((person) => person.role === "customer").map((person) => person.profileId);
          const barberIds = people.filter((person) => person.role === "barber").map((person) => person.profileId);
          for (const id of [...bookingIds].reverse()) {
            const deleted = await identity.query(
              `DELETE FROM bookings WHERE id=$1
               AND (customer_id=ANY($2::int[]) OR barber_id=ANY($3::int[])) RETURNING id`,
              [id, customerIds, barberIds],
            );
            if (deleted.rowCount !== 1) throw new Error("Faqat test booking ID tozalanmadi");
          }
          for (const id of [...serviceIds].reverse()) {
            const deleted = await identity.query("DELETE FROM services WHERE id=$1 RETURNING id", [id]);
            if (deleted.rowCount !== 1) throw new Error("Faqat test xizmat ID tozalanmadi");
          }
          for (const id of [...workingHourIds].reverse()) {
            const deleted = await identity.query("DELETE FROM barber_working_hours WHERE id=$1 RETURNING id", [id]);
            if (deleted.rowCount !== 1) throw new Error("Faqat test ish vaqti ID tozalanmadi");
          }
          for (const person of [...people].reverse()) {
            const deleted = await identity.query(
              "DELETE FROM users WHERE id=$1 AND phone=$2 RETURNING id",
              [person.userId, person.phone],
            );
            if (deleted.rowCount !== 1) throw new Error("Faqat test account ID tozalanmadi");
          }
          await identity.query("COMMIT");
        } catch (error) {
          await identity.query("ROLLBACK").catch(() => {});
          throw error;
        } finally {
          identity.release();
        }

        const remaining = await pool.query(
          `SELECT
             (SELECT count(*)::int FROM users WHERE id=ANY($1::int[])) AS users,
             (SELECT count(*)::int FROM services WHERE id=ANY($2::int[])) AS services,
             (SELECT count(*)::int FROM barber_working_hours WHERE id=ANY($3::int[])) AS working_hours,
             (SELECT count(*)::int FROM bookings
              WHERE customer_id=ANY($4::int[]) OR barber_id=ANY($5::int[])) AS bookings`,
          [people.map((person) => person.userId), serviceIds, workingHourIds,
            people.filter((person) => person.role === "customer").map((person) => person.profileId),
            people.filter((person) => person.role === "barber").map((person) => person.profileId)],
        );
        assert.deepEqual(remaining.rows[0], { users: 0, services: 0, working_hours: 0, bookings: 0 });
      }
    } catch {
      cleanupFailure = new Error("Test yozuvlarini faqat o‘z ID’lari bilan tozalash yoki tekshirish muvaffaqiyatsiz bo‘ldi");
    } finally {
      if (databaseInjected) {
        if (previousDatabaseModule) require.cache[require.resolve("../db")] = previousDatabaseModule;
        else delete require.cache[require.resolve("../db")];
      }
      if (appModulePath) delete require.cache[appModulePath];
      if (dotenv && previousDotenvConfig) dotenv.config = previousDotenvConfig;
      if (notifierModule && previousNotifierFactory) notifierModule.createBookingNotifier = previousNotifierFactory;
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
      await pool.end();
    }
    if (cleanupFailure) throw cleanupFailure;
  });

  const identity = await assertTestConnection(pool, target, TEST_USER);
  assert.equal(identity.database, "ustara_test_db");
  const schema = await pool.query(`
    SELECT current_schema() AS schema,
           to_regclass('public.users') IS NOT NULL AS users_exists,
           to_regclass('public.customers') IS NOT NULL AS customers_exists,
           to_regclass('public.barbers') IS NOT NULL AS barbers_exists,
           to_regclass('public.services') IS NOT NULL AS services_exists,
           to_regclass('public.barber_working_hours') IS NOT NULL AS hours_exists,
           to_regclass('public.bookings') IS NOT NULL AS bookings_exists,
           to_regclass('public.account_session_versions') IS NOT NULL AS sessions_exists,
           EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261117_barber_profile_02_booking_acceptance') AS acceptance_migration
  `);
  assert.equal(schema.rows[0].schema, "public");
  for (const relation of ["users_exists", "customers_exists", "barbers_exists", "services_exists", "hours_exists", "bookings_exists", "sessions_exists", "acceptance_migration"]) {
    assert.equal(schema.rows[0][relation], true, `Kerakli jadval yo‘q: ${relation}`);
  }

  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  const secret = process.env.JWT_SECRET;
  const makeToken = (person) => jwt.sign({
    id: person.userId,
    profileId: person.profileId,
    role: person.role,
    sessionVersion: 0,
  }, secret, { expiresIn: "5m" });

  dotenv = require("dotenv");
  previousDotenvConfig = dotenv.config;
  dotenv.config = () => ({ parsed: {} });
  notifierModule = require("../services/telegramBookingNotifications");
  previousNotifierFactory = notifierModule.createBookingNotifier;
  notifierModule.createBookingNotifier = () => async () => ({ sent: false, reason: "sinov" });

  const databasePath = require.resolve("../db");
  previousDatabaseModule = require.cache[databasePath];
  if (previousDatabaseModule) throw new Error("Booking oqimi testi oldin backend DB modulini yuklagan");
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
  notifierModule.createBookingNotifier = previousNotifierFactory;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  async function createPerson(role) {
    const client = await pool.connect();
    const phone = `+998${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    try {
      await assertTestConnection(client, target, TEST_USER);
      await client.query("BEGIN");
      const account = await client.query(
        "INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id",
        [phone, "booking-flow-test-only-hash", role],
      );
      const userId = account.rows[0].id;
      const profile = role === "barber"
        ? await client.query(
          `INSERT INTO barbers(user_id,first_name,last_name,specialty,verification_status)
           VALUES($1,$2,$3,'barber','approved') RETURNING id`,
          [userId, "Sinov", `FlowBarber${userId}`],
        )
        : await client.query(
          "INSERT INTO customers(user_id,first_name,last_name) VALUES($1,$2,$3) RETURNING id",
          [userId, "Sinov", `FlowCustomer${userId}`],
        );
      await client.query("COMMIT");
      const person = { userId, profileId: profile.rows[0].id, phone, role };
      people.push(person);
      return person;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const customer = await createPerson("customer");
  const otherCustomer = await createPerson("customer");
  const barber = await createPerson("barber");
  const otherBarber = await createPerson("barber");
  const customerToken = makeToken(customer);
  const otherCustomerToken = makeToken(otherCustomer);
  const barberToken = makeToken(barber);
  const otherBarberToken = makeToken(otherBarber);
  const bookingDate = dateAfter(7);
  const dayOfWeek = new Date(`${bookingDate}T00:00:00Z`).getUTCDay();

  const serviceResult = await pool.query(
    "INSERT INTO services(barber_id,name,price,duration_minutes) VALUES($1,$2,$3,$4) RETURNING id",
    [barber.profileId, `Flow xizmati ${barber.userId}`, 100000, 45],
  );
  const serviceId = serviceResult.rows[0].id;
  serviceIds.push(serviceId);
  const hoursResult = await pool.query(
    `INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time)
     VALUES($1,$2,'09:00','18:00') RETURNING id`,
    [barber.profileId, dayOfWeek],
  );
  workingHourIds.push(hoursResult.rows[0].id);

  const makeBooking = async (time) => {
    const response = await callApi(server, "POST", "/api/bookings", {
      barber_id: barber.profileId,
      service_id: serviceId,
      booking_time: `${bookingDate}T${time}:00+05:00`,
    }, customerToken);
    if (Number.isInteger(response.body?.data?.id)) bookingIds.push(response.body.data.id);
    return response;
  };
  const updateBooking = (id, status, token = barberToken) =>
    callApi(server, "PUT", `/api/bookings/${id}`, { status }, token);

  let mainBookingId;
  await t.test("mijoz yangi booking yaratadi va API pending holatini qaytaradi", async () => {
    const response = await makeBooking("10:00");
    assert.equal(response.status, 201);
    assert.equal(response.body.data.status, "pending");
    assert.equal(response.body.data.barber_id, barber.profileId);
    assert.equal(response.body.data.service_id, serviceId);
    mainBookingId = response.body.data.id;
  });

  await t.test("booking PostgreSQL da pending va davomiylik snapshoti bilan saqlanadi", async () => {
    const stored = await pool.query(
      "SELECT status,duration_minutes FROM bookings WHERE id=$1",
      [mainBookingId],
    );
    assert.deepEqual(stored.rows[0], { status: "pending", duration_minutes: 45 });
  });

  await t.test("mijoz o‘z bookingini ro‘yxatda ko‘radi", async () => {
    const response = await callApi(server, "GET", "/api/bookings", undefined, customerToken);
    assert.equal(response.status, 200);
    assert.ok(response.body.some((booking) => booking.id === mainBookingId && booking.status === "pending"));
  });

  await t.test("barber o‘z bookingini ro‘yxatda ko‘radi", async () => {
    const response = await callApi(server, "GET", "/api/bookings", undefined, barberToken);
    assert.equal(response.status, 200);
    assert.ok(response.body.some((booking) => booking.id === mainBookingId && booking.status === "pending"));
  });

  await t.test("barber bookingni tasdiqlaydi", async () => {
    const response = await updateBooking(mainBookingId, "confirmed");
    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, mainBookingId);
    assert.equal(response.body.data.status, "confirmed");
  });

  await t.test("mijoz ro‘yxatida confirmed holati ko‘rinadi", async () => {
    const response = await callApi(server, "GET", "/api/bookings", undefined, customerToken);
    assert.equal(response.status, 200);
    assert.ok(response.body.some((booking) => booking.id === mainBookingId && booking.status === "confirmed"));
  });

  await t.test("boshqa barber bookingni boshqara olmaydi", async () => {
    const response = await updateBooking(mainBookingId, "cancelled", otherBarberToken);
    assert.equal(response.status, 404);
    const stored = await pool.query("SELECT status FROM bookings WHERE id=$1", [mainBookingId]);
    assert.equal(stored.rows[0].status, "confirmed");
  });

  await t.test("boshqa mijoz bookingni ko‘ra yoki boshqara olmaydi", async () => {
    const detail = await callApi(server, "GET", `/api/bookings/${mainBookingId}`, undefined, otherCustomerToken);
    assert.equal(detail.status, 404);
    const update = await updateBooking(mainBookingId, "cancelled", otherCustomerToken);
    assert.equal(update.status, 404);
    const stored = await pool.query("SELECT status FROM bookings WHERE id=$1", [mainBookingId]);
    assert.equal(stored.rows[0].status, "confirmed");
  });

  await t.test("barber boshqa pending bookingni rad eta oladi", async () => {
    const created = await makeBooking("12:00");
    assert.equal(created.status, 201);
    const response = await updateBooking(created.body.data.id, "rejected");
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, "rejected");
  });

  await t.test("mijoz o‘z bookingini bekor qila oladi", async () => {
    const created = await makeBooking("14:00");
    assert.equal(created.status, 201);
    const response = await updateBooking(created.body.data.id, "cancelled", customerToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, "cancelled");
  });

  await t.test("pending yoki confirmed vaqt bilan ustma-ust booking rad etiladi", async () => {
    const response = await makeBooking("10:15");
    assert.equal(response.status, 409);
    const stored = await pool.query(
      "SELECT count(*)::int AS count FROM bookings WHERE barber_id=$1 AND booking_time=$2::timestamptz",
      [barber.profileId, `${bookingDate}T10:15:00+05:00`],
    );
    assert.equal(stored.rows[0].count, 0);
  });

  await t.test("xizmat tahriri oldingi booking davomiyligi snapshotini o‘zgartirmaydi", async () => {
    const created = await makeBooking("16:00");
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    await pool.query("UPDATE services SET duration_minutes=$1 WHERE id=$2", [60, serviceId]);
    const stored = await pool.query("SELECT duration_minutes FROM bookings WHERE id=$1", [id]);
    assert.equal(stored.rows[0].duration_minutes, 45);
    const readBack = await callApi(server, "GET", `/api/bookings/${id}`, undefined, customerToken);
    assert.equal(readBack.status, 200);
    assert.equal(readBack.body.duration_minutes, 45);
  });

  await t.test("yangi barber holati yoqilgan bo‘ladi va barber o‘z holatini o‘zgartiradi", async () => {
    const ownProfile = await callApi(server, "GET", "/api/barbers/me", undefined, barberToken);
    const otherProfile = await callApi(server, "GET", "/api/barbers/me", undefined, otherBarberToken);
    assert.equal(ownProfile.status, 200);
    assert.equal(ownProfile.body.barber.accepting_bookings, true);
    assert.equal(otherProfile.body.barber.accepting_bookings, true);

    const customerChange = await callApi(server, "PUT", "/api/barbers/booking-acceptance",
      { accepting_bookings: false }, customerToken);
    assert.equal(customerChange.status, 403);
    const changed = await callApi(server, "PUT", "/api/barbers/booking-acceptance",
      { accepting_bookings: false, barber_id: otherBarber.profileId }, barberToken);
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.accepting_bookings, false);
    assert.equal((await callApi(server, "GET", "/api/barbers/me", undefined, barberToken)).body.barber.accepting_bookings, false);
    assert.equal((await callApi(server, "GET", "/api/barbers/me", undefined, otherBarberToken)).body.barber.accepting_bookings, true);
    assert.equal((await callApi(server, "PUT", "/api/barbers/booking-acceptance",
      { accepting_bookings: "false" }, barberToken)).status, 400);
  });

  await t.test("OFF holatida vaqtlar yopiladi, yangi booking rad etiladi va eski holatlar saqlanadi", async () => {
    const accepting = await callApi(server, "PUT", "/api/barbers/booking-acceptance",
      { accepting_bookings: true }, barberToken);
    assert.equal(accepting.status, 200);
    assert.equal(accepting.body.data.accepting_bookings, true);

    const pending = await makeBooking("17:00");
    assert.equal(pending.status, 201);
    const before = await pool.query("SELECT id,status FROM bookings WHERE id=ANY($1::int[]) ORDER BY id",
      [[mainBookingId, pending.body.data.id]]);
    assert.deepEqual(before.rows.map((row) => row.status), ["confirmed", "pending"]);

    const paused = await callApi(server, "PUT", "/api/barbers/booking-acceptance",
      { accepting_bookings: false }, barberToken);
    assert.equal(paused.status, 200);
    assert.equal(paused.body.data.accepting_bookings, false);
    const committedState = await callApi(server, "GET", "/api/barbers/me", undefined, barberToken);
    assert.equal(committedState.status, 200);
    assert.equal(committedState.body.barber.accepting_bookings, false);

    const availability = await callApi(server, "GET",
      `/api/bookings/available-slots?barber_id=${barber.profileId}&service_id=${serviceId}&date=${bookingDate}`,
      undefined, customerToken);
    assert.equal(availability.status, 200);
    assert.equal(availability.body.working, false);
    assert.deepEqual(availability.body.slots, []);
    assert.deepEqual(availability.body.recommendedSlots, []);

    const rejected = await makeBooking("14:00");
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.code, "bookings_paused");
    const after = await pool.query("SELECT id,status FROM bookings WHERE id=ANY($1::int[]) ORDER BY id",
      [[mainBookingId, pending.body.data.id]]);
    assert.deepEqual(after.rows, before.rows);
  });

  await t.test("booking qabul qilish qayta yoqilganda yangi booking yana yaratiladi", async () => {
    const enabledAgain = await callApi(server, "PUT", "/api/barbers/booking-acceptance",
      { accepting_bookings: true }, barberToken);
    assert.equal(enabledAgain.status, 200);
    assert.equal(enabledAgain.body.data.accepting_bookings, true);
    const created = await makeBooking("14:00");
    assert.equal(created.status, 201);
    assert.equal((await pool.query("SELECT status FROM bookings WHERE id=$1", [created.body.data.id])).rows[0].status, "pending");
  });

  await t.test("parallel OFF va booking so‘rovlari mavjud barber locki bilan yakunlanadi", async () => {
    const [paused, booking] = await Promise.all([
      callApi(server, "PUT", "/api/barbers/booking-acceptance", { accepting_bookings: false }, barberToken),
      makeBooking("15:00"),
    ]);
    assert.equal(paused.status, 200);
    assert.ok([201, 409].includes(booking.status));
    assert.equal((await callApi(server, "GET", "/api/barbers/me", undefined, barberToken)).body.barber.accepting_bookings, false);
    const afterPause = await makeBooking("15:30");
    assert.equal(afterPause.status, 409);
  });
});
