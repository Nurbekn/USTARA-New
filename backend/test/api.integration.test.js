const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assertTestIdentity, dropOwnedSchema, testTarget } = require("./helpers/testDatabaseTarget");

const ownerDatabaseUrl = process.env.USTARA_TEST_OWNER_DATABASE_URL;
const appDatabaseUrl = process.env.USTARA_TEST_APP_DATABASE_URL;
const enabled = Boolean(ownerDatabaseUrl || appDatabaseUrl);

test("yagona account API integratsiyasi (faqat alohida test bazasida)", { skip: !enabled }, async (t) => {
  assert.ok(ownerDatabaseUrl && appDatabaseUrl,
    "USTARA_TEST_OWNER_DATABASE_URL va USTARA_TEST_APP_DATABASE_URL ikkalasi ham kerak");
  const ownerTarget = testTarget(ownerDatabaseUrl, "Owner test database", ["ustara_test_owner"]);
  const appTarget = testTarget(appDatabaseUrl, "App test database", ["ustara_test_app"]);
  assert.equal(appTarget.database, ownerTarget.database, "Owner va app URL'lari bir xil test bazasiga tegishli bo‘lishi kerak");
  assert.equal(ownerTarget.sessionUser, "ustara_test_owner", "Owner URL ustara_test_owner role'idan foydalanishi kerak");
  assert.equal(appTarget.sessionUser, "ustara_test_app", "App URL ustara_test_app role'idan foydalanishi kerak");

  assert.equal(ownerTarget.host, appTarget.host, "Owner va app URL'lari bir xil local test hostdan foydalanishi kerak");
  assert.equal(ownerTarget.port, appTarget.port, "Owner va app URL'lari bir xil test portidan foydalanishi kerak");

  const schema = `test_${process.pid}_${Date.now()}`;
  const quoteIdentifier = (value) => `"${value.replace(/"/g, '""')}"`;
  const quotedSchema = quoteIdentifier(schema);
  const restoreEnv = {};
  const envKeys = ["USTARA_TEST_SEARCH_PATH", "USTARA_TEST_USE_APP_DATABASE_URL", "JWT_SECRET", "ADMIN_LOGIN", "ADMIN_PASSWORD", "NODE_ENV", "OTP_SMS_ADAPTER", "OTP_EXPOSE_CODE", "OTP_HMAC_KEY"];
  for (const key of envKeys) restoreEnv[key] = process.env[key];

  process.env.USTARA_TEST_SEARCH_PATH = schema;
  process.env.USTARA_TEST_USE_APP_DATABASE_URL = "1";
  process.env.JWT_SECRET = "integration-test-secret";
  process.env.ADMIN_LOGIN = "test-admin";
  process.env.ADMIN_PASSWORD = "test-admin-password";
  process.env.NODE_ENV = "test";
  process.env.OTP_SMS_ADAPTER = "test";
  process.env.OTP_EXPOSE_CODE = "true";
  process.env.OTP_HMAC_KEY = "integration-test-only-hmac-key-32-bytes";

  const { Pool } = require("pg");
  const ownerPool = new Pool({ connectionString: ownerDatabaseUrl, ssl: false, options: `-c search_path=${schema}` });
  let appPool;
  let server;
  let schemaCreated = false;
  let schemaOid;

  t.after(async () => {
    let cleanupError;
    if (server?.listening) {
      try {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      } catch (error) { cleanupError ||= error; }
    }
    if (appPool) {
      try { await appPool.end(); } catch (error) { cleanupError ||= error; }
    }
    if (schemaCreated) {
      try {
        if (!schemaOid) throw new Error("Yaratilgan API test schema OID'i tasdiqlanmagan; cleanup uni o'chirmadi");
        await dropOwnedSchema(ownerPool, ownerTarget, schema, true, "ustara_test_owner", schemaOid);
      } catch (error) { cleanupError ||= error; }
    }
    try { await ownerPool.end(); } catch (error) { cleanupError ||= error; }
    for (const [key, value] of Object.entries(restoreEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (cleanupError) throw cleanupError;
  });

  await assertTestIdentity(ownerPool, ownerTarget, "ustara_test_owner");

  await ownerPool.query(`CREATE SCHEMA ${quotedSchema}`);
  schemaCreated = true;
  schemaOid = (await ownerPool.query("SELECT oid::text AS oid FROM pg_catalog.pg_namespace WHERE nspname = $1", [schema])).rows[0]?.oid;
  assert.ok(schemaOid, "Yaratilgan API test schema katalogdan topilishi kerak");
  const { assertTestSchema } = require("./helpers/testDatabaseTarget");
  await assertTestSchema(ownerPool, ownerTarget, schema, "ustara_test_owner");
  appPool = require("../db");
  await assertTestSchema(appPool, appTarget, schema, "ustara_test_app");
  await ownerPool.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO ustara_test_app`);
  await ownerPool.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ustara_test_owner IN SCHEMA ${quotedSchema} GRANT SELECT ON TABLES TO ustara_test_app`);
  await ownerPool.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ustara_test_owner IN SCHEMA ${quotedSchema} GRANT USAGE ON SEQUENCES TO ustara_test_app`);

  const schemaSql = fs.readFileSync(path.join(__dirname, "fixtures/pre_otp_schema.sql"), "utf8");
  await ownerPool.query(schemaSql);
  for (const filename of [
    "20261113_00_users_foundation.sql", "20261113_unified_accounts.sql",
    "20261113_unified_accounts_02_admin_accounts.sql", "20261114_otp_registration.sql", "20261114_otp_registration_02_profile_names.sql",
    "20261114_otp_registration_03_barber_specialty.sql",
    "20261114_security_01_login_protection.sql",
    "20261114_security_02_password_reset.sql",
    "20261114_slots_01_booking_duration.sql",
    "20261114_telegram_01_barber_links.sql",
    "20261115_slots_02_booking_no_overlap.sql",
    "20261116_account_profile_deletion_integrity.sql",
    "20261117_barber_profile.sql",
    "20261117_barber_profile_02_booking_acceptance.sql",
    "20261123_security_login_policy.sql",
  ]) {
    await ownerPool.query(fs.readFileSync(path.join(__dirname, "../database/migrations", filename), "utf8"));
  }

  const appTables = [
    "users", "customers", "barbers", "services", "bookings", "admin_accounts",
    "login_attempt_limits", "account_session_versions", "pending_registrations", "password_reset_requests",
    "barber_working_hours", "barber_telegram_links", "barber_telegram_link_tokens",
    "registration_phone_limits", "registration_otp_history", "password_reset_limits",
    "registration_security_events", "registration_admin_actions", "password_reset_events",
    "ustara_schema_migrations", "telegram_bot_state",
  ];
  const missingTables = await ownerPool.query(`
    SELECT expected.table_name
    FROM unnest($2::text[]) AS expected(table_name)
    LEFT JOIN pg_class AS relation
      ON relation.relnamespace = to_regnamespace($1)
     AND relation.relname = expected.table_name
     AND relation.relkind IN ('r', 'p')
    WHERE relation.oid IS NULL
    ORDER BY expected.table_name
  `, [schema, appTables]);
  assert.deepEqual(missingTables.rows, [], `Migration jadvallari topilmadi: ${missingTables.rows.map((row) => row.table_name).join(", ")}`);

  const identityTables = [
    "users", "customers", "barbers", "services", "barber_working_hours", "bookings",
    "pending_registrations", "registration_otp_history", "registration_security_events",
    "registration_admin_actions", "password_reset_requests", "password_reset_events",
  ];
  const sequenceInventory = await ownerPool.query(`
    SELECT expected.table_name,
           pg_get_serial_sequence(format('%I.%I', $1::text, expected.table_name), 'id') AS linked_sequence,
           sequence_schema.nspname AS sequence_schema,
           sequence_relation.relname AS sequence_name,
           sequence_relation.relkind AS sequence_kind
    FROM unnest($2::text[]) AS expected(table_name)
    LEFT JOIN LATERAL (
      SELECT to_regclass(
        pg_get_serial_sequence(format('%I.%I', $1::text, expected.table_name), 'id')
      ) AS sequence_oid
    ) AS resolved_sequence ON TRUE
    LEFT JOIN pg_class AS sequence_relation ON sequence_relation.oid = resolved_sequence.sequence_oid
    LEFT JOIN pg_namespace AS sequence_schema ON sequence_schema.oid = sequence_relation.relnamespace
    ORDER BY expected.table_name
  `, [schema, identityTables]);
  assert.equal(identityTables.length, 12, "Kutilgan identity sequence'lar soni 12 bo‘lishi kerak");
  assert.equal(sequenceInventory.rows.length, identityTables.length, "Har bir identity jadval uchun sequence natijasi tekshirilishi kerak");
  const invalidSequences = sequenceInventory.rows.filter((row) =>
    row.linked_sequence === null || row.sequence_kind !== "S" || row.sequence_schema !== schema
  );
  assert.deepEqual(invalidSequences, [], `Identity sequence topilmadi yoki kutilgan schemada emas: ${invalidSequences.map((row) => `${row.table_name} → ${row.linked_sequence ?? "topilmadi"}`).join(", ")}`);

  async function grantTablePrivileges(privileges, tables) {
    const qualifiedTables = tables.map((table) => `${quotedSchema}.${quoteIdentifier(table)}`).join(", ");
    await ownerPool.query(`GRANT ${privileges} ON TABLE ${qualifiedTables} TO ustara_test_app`);
  }
  await grantTablePrivileges("SELECT, INSERT, UPDATE, DELETE", [
    "users", "customers", "barbers", "services", "bookings", "admin_accounts",
    "login_attempt_limits", "account_session_versions", "pending_registrations", "password_reset_requests",
  ]);
  await grantTablePrivileges("SELECT, INSERT, DELETE", [
    "barber_working_hours", "barber_telegram_links", "barber_telegram_link_tokens",
  ]);
  await grantTablePrivileges("SELECT, INSERT, UPDATE", [
    "registration_phone_limits", "registration_otp_history", "password_reset_limits",
  ]);
  await grantTablePrivileges("SELECT, INSERT", [
    "registration_security_events", "registration_admin_actions", "password_reset_events",
  ]);
  await grantTablePrivileges("SELECT", ["ustara_schema_migrations", "telegram_bot_state"]);
  for (const sequence of sequenceInventory.rows) {
    const qualifiedSequence = `${quoteIdentifier(sequence.sequence_schema)}.${quoteIdentifier(sequence.sequence_name)}`;
    await ownerPool.query(`GRANT USAGE ON SEQUENCE ${qualifiedSequence} TO ustara_test_app`);
  }

  const app = require("../server");
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, route, body, token) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }

  // Exercise the new public flow while retaining account/profile/login assertions.
  async function registerAccount(route, body) {
    const started = await call("POST", "/api/auth/registration/start", {
      phone: body.phone, password: body.password,
      role: route === "/api/customers" ? "customer" : "barber",
      ...(route === "/api/barbers" ? { specialty: body.specialty || "barber" } : {}),
    });
    if (started.status !== 201) return started;
    const { sessionToken, testOtp } = started.data;
    const verified = await call("POST", "/api/auth/registration/verify", { sessionToken, otp: testOtp });
    if (verified.status !== 200) return verified;
    return call("POST", "/api/auth/registration/complete", { sessionToken, firstName: body.firstName, lastName: body.lastName });
  }

  async function createBookingReadFixtures(phonePrefix) {
    async function createAccount(route, lastName, phoneTail) {
      const password = "BookingRead123";
      const phone = `+998900000${phoneTail}`;
      const registered = await registerAccount(route, { firstName: "Sinov", lastName, phone, password });
      assert.equal(registered.status, 201, `${route} fixture ro'yxatdan o'tishi kerak`);
      const login = await call("POST", `${route}/login`, { phone, password });
      assert.equal(login.status, 200, `${route} fixture tizimga kirishi kerak`);
      const profile = registered.data[route === "/api/customers" ? "customer" : "barber"];
      return { id: profile.id, token: login.data.token, lastName };
    }

    const customerOne = await createAccount("/api/customers", "BirinchiMijoz", `${phonePrefix}1`);
    const customerTwo = await createAccount("/api/customers", "IkkinchiMijoz", `${phonePrefix}2`);
    const barberOne = await createAccount("/api/barbers", "BirinchiUsta", `${phonePrefix}3`);
    const barberTwo = await createAccount("/api/barbers", "IkkinchiUsta", `${phonePrefix}4`);

    for (const barber of [barberOne, barberTwo]) {
      await appPool.query("UPDATE barbers SET verification_status='approved' WHERE id=$1", [barber.id]);
    }

    async function createService(barber, name) {
      const result = await appPool.query(
        "INSERT INTO services (barber_id,name,price,duration_minutes) VALUES ($1,$2,50000,30) RETURNING id",
        [barber.id, name],
      );
      return result.rows[0].id;
    }
    const serviceOne = await createService(barberOne, `Booking sinov 1 ${phonePrefix}`);
    const serviceTwo = await createService(barberTwo, `Booking sinov 2 ${phonePrefix}`);

    async function createBooking(customer, barber, service, bookingTime) {
      const result = await appPool.query(
        `INSERT INTO bookings (customer_id,barber_id,service_id,booking_time,duration_minutes,status)
         VALUES ($1,$2,$3,$4,30,'pending') RETURNING id`,
        [customer.id, barber.id, service, bookingTime],
      );
      return result.rows[0].id;
    }
    const bookingOne = await createBooking(customerOne, barberOne, serviceOne, "2099-01-01T10:00:00+05:00");
    const bookingTwo = await createBooking(customerTwo, barberOne, serviceOne, "2099-01-01T10:30:00+05:00");
    const bookingThree = await createBooking(customerTwo, barberTwo, serviceTwo, "2099-01-01T10:00:00+05:00");

    const adminToken = require("jsonwebtoken").sign({ id: 1, role: "admin" }, process.env.JWT_SECRET);
    return { customerOne, customerTwo, barberOne, barberTwo, bookingOne, bookingTwo, bookingThree, adminToken };
  }

  await t.test("customer va barber parol siyosati", async () => {
    const roles = [
      { path: "/api/customers", role: "customer", suffix: "301" },
      { path: "/api/barbers", role: "barber", suffix: "302" },
    ];
    const invalidPasswords = [
      "Aa12345",
      `A1${"x".repeat(127)}`,
      "12345678",
      "Abcdefgh",
      "password",
      "qwerty123",
    ];

    for (const [index, role] of roles.entries()) {
      assert.equal((await call("POST", `${role.path}/register`, null)).status, 410);
      for (const body of [null, { phone: {}, password: "Aa123456" }, { phone: "+998900000300", password: [] }]) {
        assert.equal((await call("POST", "/api/auth/registration/start", body && { ...body, role: role.role })).status, 400);
      }
      for (const password of invalidPasswords) {
        const result = await registerAccount(role.path, {
          firstName: "Parol", lastName: "Sinov",
          phone: `+9989000003${role.suffix}`,
          password,
        });
        assert.equal(result.status, 400, `${role.role} parol siyosati: ${password}`);
      }

      const phone = `+99890000031${index}`;
      const register = await registerAccount(role.path, {
        firstName: "Parol", lastName: role.role,
        phone,
        password: "Aa123456",
      });
      assert.equal(register.status, 201, "8 belgili, maxsus belgisiz kuchli parol qabul qilinishi kerak");
      assert.equal("password" in register.data, false);
      const login = await call("POST", `${role.path}/login`, { phone, password: "Aa123456" });
      assert.equal(login.status, 200);
      const payload = require("jsonwebtoken").verify(login.data.token, process.env.JWT_SECRET);
      assert.equal(payload.role, role.role);
    }

    const longPassword = `Aa123456${"x".repeat(120)}`;
    assert.equal(Array.from(longPassword).length, 128);
    const longRegister = await registerAccount("/api/customers", {
      firstName: "Uzun", lastName: "parol",
      phone: "+998900000399",
      password: longPassword,
    });
    assert.equal(longRegister.status, 201);
    assert.equal((await call("POST", "/api/customers/login", { phone: "+998900000399", password: longPassword })).status, 200);
    const wrongTail = `Aa123456${"x".repeat(64)}${"y".repeat(56)}`;
    assert.equal((await call("POST", "/api/customers/login", { phone: "+998900000399", password: wrongTail })).status, 401);
  });

  await t.test("ro'yxatdan o'tish, login, takroriy/parallel telefon va JWT", async () => {
    // Keep account and profile sequences different so ID confusion is observable.
    await appPool.query("INSERT INTO users(phone,password,role) VALUES('+998900000099','test-fixture-hash','customer')");
    const customerBody = { firstName: "Sinov", lastName: "mijoz", phone: "+998900000101", password: "strong-pass-1" };
    const registered = await registerAccount("/api/customers", customerBody);
    assert.equal(registered.status, 201);
    assert.equal("password" in registered.data.customer, false);
    const login = await call("POST", "/api/customers/login", { phone: customerBody.phone, password: customerBody.password });
    assert.equal(login.status, 200);
    const jwt = require("jsonwebtoken").verify(login.data.token, process.env.JWT_SECRET);
    const account = await appPool.query("SELECT id FROM users WHERE phone=$1", [customerBody.phone]);
    assert.equal(jwt.id, account.rows[0].id);
    assert.equal(jwt.profileId, registered.data.customer.id);
    assert.notEqual(jwt.id, jwt.profileId);
    assert.equal(jwt.role, "customer");
    assert.equal((await call("GET", "/api/customers/me", null, login.data.token)).status, 200);
    assert.equal((await call("GET", "/api/barbers/pending", null, login.data.token)).status, 403);
    assert.equal((await call("POST", "/api/customers/login", { phone: "+998900000000", password: "Aa123456" })).status, 401);
    const beforeCustomerUpdate = await appPool.query("SELECT phone,password FROM users WHERE id=$1", [account.rows[0].id]);
    assert.equal((await call("PUT", `/api/customers/${registered.data.customer.id}`, {
      firstName: "Profil", lastName: "yangilandi",
      phone: "+998900009999",
      password: "NotApplied999",
    }, login.data.token)).status, 200);
    const afterCustomerUpdate = await appPool.query("SELECT phone,password FROM users WHERE id=$1", [account.rows[0].id]);
    assert.deepEqual(afterCustomerUpdate.rows[0], beforeCustomerUpdate.rows[0]);
    assert.equal((await call("GET", "/api/customers/me", null, login.data.token)).status, 200);
    const forgedRoleToken = require("jsonwebtoken").sign({ id: account.rows[0].id, role: "barber" }, process.env.JWT_SECRET);
    assert.equal((await call("GET", "/api/customers/me", null, forgedRoleToken)).status, 401);
    assert.equal((await call("GET", "/api/barbers/me", null, forgedRoleToken)).status, 401);
    assert.equal((await call("POST", "/api/customers/login", { phone: customerBody.phone, password: "wrong-password" })).status, 401);
    assert.equal((await call("POST", "/api/barbers/login", { phone: customerBody.phone, password: customerBody.password })).status, 401);
    assert.equal((await registerAccount("/api/barbers", { ...customerBody, firstName: "Raqib", lastName: "Sinov" })).status, 409);

    const parallelPhone = "+998900000102";
    const parallel = await Promise.all([1, 2].map(() => registerAccount("/api/customers", { ...customerBody, phone: parallelPhone, firstName: "Parallel", lastName: "Mijoz" })));
    assert.deepEqual(parallel.map((r) => r.status).sort(), [201, 409]);

    const crossRolePhone = "+998900000104";
    const crossRole = await Promise.all([
      registerAccount("/api/customers", { ...customerBody, phone: crossRolePhone }),
      registerAccount("/api/barbers", { ...customerBody, phone: crossRolePhone }),
    ]);
    assert.deepEqual(crossRole.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await appPool.query("SELECT count(*)::int AS count FROM users WHERE phone=$1", [crossRolePhone])).rows[0].count, 1);

    const barberBody = { firstName: "Sinov", lastName: "barber", phone: "+998900000103", password: "strong-pass-2" };
    assert.equal((await registerAccount("/api/barbers", barberBody)).status, 201);
    const barberLogin = await call("POST", "/api/barbers/login", { phone: barberBody.phone, password: barberBody.password });
    assert.equal(barberLogin.status, 200);
    const barberJwt = require("jsonwebtoken").verify(barberLogin.data.token, process.env.JWT_SECRET);
    const barberAccount = await appPool.query("SELECT id FROM users WHERE phone=$1", [barberBody.phone]);
    assert.equal(barberJwt.id, barberAccount.rows[0].id);
    assert.equal(barberJwt.profileId, barberLogin.data.barber.id);
    assert.notEqual(barberJwt.id, barberJwt.profileId);
    assert.equal(barberJwt.role, "barber");
    assert.equal((await call("GET", "/api/barbers/me")).status, 401);
    assert.equal((await call("GET", "/api/barbers/me", null, login.data.token)).status, 403);
    const barberMe = await call("GET", "/api/barbers/me", null, barberLogin.data.token);
    assert.equal(barberMe.status, 200);
    assert.equal(barberMe.data.barber.id, barberLogin.data.barber.id);
    assert.equal(barberMe.data.barber.first_name, barberBody.firstName);
    assert.equal(barberMe.data.barber.last_name, barberBody.lastName);
    assert.equal("name" in barberMe.data.barber, false);
    assert.equal(barberMe.data.barber.phone, barberBody.phone);
    assert.equal(barberMe.data.barber.verification_status, "pending");
    assert.equal("password" in barberMe.data.barber, false);
    assert.equal("password_hash" in barberMe.data.barber, false);
    const barberHash = await appPool.query("SELECT password FROM users WHERE id=$1", [barberAccount.rows[0].id]);
    assert.equal(JSON.stringify(barberMe.data).includes(barberHash.rows[0].password), false);

    const secondBarberBody = { firstName: "Ikkinchi", lastName: "barber", phone: "+998900000105", password: "strong-pass-3" };
    assert.equal((await registerAccount("/api/barbers", secondBarberBody)).status, 201);
    const secondBarberLogin = await call("POST", "/api/barbers/login", {
      phone: secondBarberBody.phone,
      password: secondBarberBody.password,
    });
    assert.equal(secondBarberLogin.status, 200);
    const secondBarberMe = await call("GET", "/api/barbers/me", null, secondBarberLogin.data.token);
    assert.equal(secondBarberMe.status, 200);
    assert.equal(secondBarberMe.data.barber.id, secondBarberLogin.data.barber.id);
    assert.notEqual(secondBarberMe.data.barber.id, barberLogin.data.barber.id);
    const mismatchedIdentityToken = require("jsonwebtoken").sign({
      id: barberAccount.rows[0].id,
      role: "barber",
      profileId: secondBarberLogin.data.barber.id,
    }, process.env.JWT_SECRET);
    assert.equal((await call("GET", "/api/barbers/me", null, mismatchedIdentityToken)).status, 401);
    assert.equal((await call("GET", "/api/barbers/pending", null, barberLogin.data.token)).status, 403);
    assert.equal((await call("POST", "/api/barbers/login", { phone: barberBody.phone, password: "wrong-password" })).status, 401);
    assert.equal((await call("GET", "/api/barbers/working-hours", null, barberLogin.data.token)).status, 200);
    const forgedCustomerClaim = require("jsonwebtoken").sign({
      id: barberAccount.rows[0].id, role: "customer", profileId: barberLogin.data.barber.id,
    }, process.env.JWT_SECRET);
    assert.equal((await call("GET", "/api/barbers/working-hours", null, forgedCustomerClaim)).status, 401);
    assert.equal((await call("POST", "/api/barbers/login", { phone: "+998900000000", password: "Aa123456" })).status, 401);
    assert.equal((await call("POST", "/api/customers/login", { phone: barberBody.phone, password: barberBody.password })).status, 401);
  });

  await t.test("users.role o'zgarishi DB tomonidan rad etiladi", async () => {
    const customer = await registerAccount("/api/customers", {
      firstName: "Role", lastName: "Immutable", phone: "+998900000451", password: "Aa123456",
    });
    const barber = await registerAccount("/api/barbers", {
      firstName: "Role", lastName: "Immutable", phone: "+998900000452", password: "Aa123456",
    });
    assert.equal(customer.status, 201);
    assert.equal(barber.status, 201);
    const customerId = (await appPool.query("SELECT id FROM users WHERE phone=$1", ["+998900000451"])).rows[0].id;
    const barberId = (await appPool.query("SELECT id FROM users WHERE phone=$1", ["+998900000452"])).rows[0].id;
    await assert.rejects(appPool.query("UPDATE users SET role='barber' WHERE id=$1", [customerId]), { code: "23514" });
    await assert.rejects(appPool.query("UPDATE users SET role='customer' WHERE id=$1", [barberId]), { code: "23514" });
    assert.deepEqual((await appPool.query("SELECT role FROM users WHERE id=ANY($1::int[]) ORDER BY id", [[customerId, barberId]])).rows,
      [{ role: "customer" }, { role: "barber" }]);
  });

  await t.test("OTP complete account va profilni bitta transactionda yaratadi", async () => {
    await ownerPool.query(`
      CREATE FUNCTION fail_customer_profile_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test customer profile failure'; END $$;
      CREATE TRIGGER fail_customer_profile_insert BEFORE INSERT ON customers
      FOR EACH ROW EXECUTE FUNCTION fail_customer_profile_insert();
    `);
    const customerFailure = await registerAccount("/api/customers", {
      firstName: "Transaction", lastName: "customer", phone: "+998900000401", password: "Aa123456",
    });
    assert.equal(customerFailure.status, 500);
    assert.equal((await appPool.query("SELECT count(*)::int AS count FROM users WHERE phone=$1", ["+998900000401"])).rows[0].count, 0);
    await ownerPool.query("DROP TRIGGER fail_customer_profile_insert ON customers; DROP FUNCTION fail_customer_profile_insert()");

    await ownerPool.query(`
      CREATE FUNCTION fail_barber_profile_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test barber profile failure'; END $$;
      CREATE TRIGGER fail_barber_profile_insert BEFORE INSERT ON barbers
      FOR EACH ROW EXECUTE FUNCTION fail_barber_profile_insert();
    `);
    const barberFailure = await registerAccount("/api/barbers", {
      firstName: "Transaction", lastName: "barber", phone: "+998900000402", password: "Aa123456",
    });
    assert.equal(barberFailure.status, 500);
    assert.equal((await appPool.query("SELECT count(*)::int AS count FROM users WHERE phone=$1", ["+998900000402"])).rows[0].count, 0);
    await ownerPool.query("DROP TRIGGER fail_barber_profile_insert ON barbers; DROP FUNCTION fail_barber_profile_insert()");
  });

  await t.test("admin login, DB faolligi, token tekshiruvi va DB xatosi", async () => {
    const jwt = require("jsonwebtoken");
    const admin = await call("POST", "/api/admin/login", { login: "test-admin", password: "test-admin-password" });
    assert.equal(admin.status, 200);
    const payload = jwt.verify(admin.data.token, process.env.JWT_SECRET);
    const adminRow = await appPool.query("SELECT id FROM admin_accounts WHERE is_active=TRUE");
    const schemaSeed = await appPool.query("SELECT id,is_active FROM admin_accounts");
    assert.deepEqual(schemaSeed.rows, [{ id: 1, is_active: true }]);
    assert.equal(payload.role, "admin");
    assert.equal(payload.id, adminRow.rows[0].id);
    assert.equal((await call("GET", "/api/barbers/pending", null, admin.data.token)).status, 200);

    assert.equal((await call("POST", "/api/admin/login", { login: "wrong-admin", password: "test-admin-password" })).status, 401);
    assert.equal((await call("POST", "/api/admin/login", { login: "test-admin", password: "wrong-password" })).status, 401);
    const invalidIdToken = jwt.sign({ id: 999, role: "admin" }, process.env.JWT_SECRET);
    const expiredToken = jwt.sign({ id: payload.id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: -1 });
    assert.equal((await call("GET", "/api/barbers/pending", null, `${admin.data.token}broken`)).status, 401);
    assert.equal((await call("GET", "/api/barbers/pending", null, expiredToken)).status, 401);
    assert.equal((await call("GET", "/api/barbers/pending", null, invalidIdToken)).status, 401);

    await appPool.query("UPDATE admin_accounts SET is_active=FALSE WHERE id=$1", [payload.id]);
    // Oldingi ikki xatodan keyingi uchta xato besh urinish limitiga yetadi.
    for (let n = 0; n < 2; n++) {
      assert.equal((await call("POST", "/api/admin/login", { login: "test-admin", password: "test-admin-password" })).status, 401);
    }
    assert.equal((await call("POST", "/api/admin/login", { login: "test-admin", password: "test-admin-password" })).status, 429);
    assert.equal((await call("GET", "/api/barbers/pending", null, admin.data.token)).status, 401);
    await appPool.query("UPDATE admin_accounts SET is_active=TRUE WHERE id=$1", [payload.id]);

    // Reset only this disposable fixture's login counters so subsequent missing
    // identity / DB-outage assertions exercise their own failure independently.
    await appPool.query("DELETE FROM login_attempt_limits WHERE scope='admin'");
    await appPool.query("DELETE FROM admin_accounts WHERE id=$1", [payload.id]);
    assert.equal((await call("POST", "/api/admin/login", { login: "test-admin", password: "test-admin-password" })).status, 401);
    assert.equal((await call("GET", "/api/barbers/pending", null, admin.data.token)).status, 401);
    await appPool.query("INSERT INTO admin_accounts (id, is_active) VALUES ($1, TRUE)", [payload.id]);

    await ownerPool.query("ALTER TABLE admin_accounts RENAME TO admin_accounts_temporarily_hidden");
    assert.equal((await call("POST", "/api/admin/login", { login: "test-admin", password: "test-admin-password" })).status, 503);
    assert.equal((await call("GET", "/api/barbers/pending", null, admin.data.token)).status, 500);
    await ownerPool.query("ALTER TABLE admin_accounts_temporarily_hidden RENAME TO admin_accounts");
    assert.equal((await call("GET", "/api/barbers/pending", null, admin.data.token)).status, 200);
  });

  await t.test("admin accountlar, profil huquqi, service va ish jadvali", async () => {
    const admin = await call("POST", "/api/admin/login", { login: "test-admin", password: "test-admin-password" });
    assert.equal(admin.status, 200);
    assert.equal((await call("POST", "/api/customers", {}, admin.data.token)).status, 410);
    assert.equal((await call("POST", "/api/barbers", {}, admin.data.token)).status, 410);
    const customer = await registerAccount("/api/customers", { firstName: "Admin", lastName: "mijoz", phone: "+998900000201", password: "admin-pass-1" });
    assert.equal(customer.status, 201);
    const barber = await registerAccount("/api/barbers", { firstName: "Admin", lastName: "barber", phone: "+998900000202", password: "admin-pass-2" });
    assert.equal(barber.status, 201);
    await appPool.query("UPDATE barbers SET verification_status='approved' WHERE user_id=(SELECT id FROM users WHERE phone=$1)", ["+998900000202"]);
    const barberLogin = await call("POST", "/api/barbers/login", { phone: "+998900000202", password: "admin-pass-2" });
    const customerLogin = await call("POST", "/api/customers/login", { phone: "+998900000201", password: "admin-pass-1" });
    assert.equal((await call("GET", "/api/customers/me", null, barberLogin.data.token)).status, 403);
    assert.equal((await call("GET", "/api/barbers/working-hours", null, customerLogin.data.token)).status, 403);
    assert.equal((await call("PUT", `/api/customers/${customer.data.customer.id}`, { firstName: "Ruxsatsiz", lastName: "Sinov" }, barberLogin.data.token)).status, 403);
    const newBarberPhone = "+998900000203";
    const oldBarberPasswordHash = (await appPool.query("SELECT password FROM users WHERE phone=$1", ["+998900000202"])).rows[0].password;
    assert.equal((await call("PUT", `/api/barbers/${barber.data.barber.id}`, {
      firstName: "Admin", lastName: "barber", phone: newBarberPhone, password: "NotApplied999",
    }, barberLogin.data.token)).status, 403);
    assert.equal((await appPool.query("SELECT u.phone FROM users u JOIN barbers b ON b.user_id=u.id WHERE b.id=$1", [barber.data.barber.id])).rows[0].phone, "+998900000202");
    assert.equal((await appPool.query("SELECT password FROM users WHERE phone=$1", ["+998900000202"])).rows[0].password, oldBarberPasswordHash);
    assert.equal((await call("POST", "/api/barbers/login", { phone: newBarberPhone, password: "admin-pass-2" })).status, 401);
    assert.equal((await call("POST", "/api/barbers/login", { phone: "+998900000202", password: "admin-pass-2" })).status, 200);
    assert.equal((await call("PUT", `/api/barbers/${barber.data.barber.id}`, { firstName: "Yangilangan", lastName: "barber" }, barberLogin.data.token)).status, 200);

    const hours = { working_hours: Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, start_time: "00:00", end_time: "23:59" })) };
    assert.equal((await call("PUT", "/api/barbers/working-hours", hours, barberLogin.data.token)).status, 200);
    assert.equal((await call("GET", "/api/barbers/working-hours", null, barberLogin.data.token)).data.length, 7);
    const service = await call("POST", "/api/services", { name: "Soch olish", price: 50000, duration_minutes: 30 }, barberLogin.data.token);
    assert.equal(service.status, 201);
    const serviceId = service.data.data.id;
    assert.equal((await call("GET", `/api/services/${serviceId}`, null, barberLogin.data.token)).status, 200);
    assert.equal((await call("PUT", `/api/services/${serviceId}`, { name: "Yangilangan", price: 60000, duration_minutes: 40 }, barberLogin.data.token)).status, 200);
    const tomorrow = new Date(Date.now() + 2 * 86400000);
    const day = tomorrow.toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
    const bookingTime = new Date(`${day}T12:00:00+05:00`).toISOString();
    const booking = await call("POST", "/api/bookings", { barber_id: barber.data.barber.id, service_id: serviceId, booking_time: bookingTime }, customerLogin.data.token);
    assert.equal(booking.status, 201);
    assert.equal((await call("PUT", `/api/bookings/${booking.data.data.id}`, { status: "confirmed" }, barberLogin.data.token)).status, 200);
    assert.equal((await call("PUT", `/api/bookings/${booking.data.data.id}`, { status: "completed" }, customerLogin.data.token)).status, 403);
    assert.equal((await call("PUT", `/api/bookings/${booking.data.data.id}`, { status: "cancelled" }, customerLogin.data.token)).status, 200);
    assert.equal((await call("DELETE", `/api/services/${serviceId}`, null, barberLogin.data.token)).status, 409);
    const unusedService = await call("POST", "/api/services", { name: "O'chiriladigan", price: 10000, duration_minutes: 15 }, barberLogin.data.token);
    assert.equal((await call("DELETE", `/api/services/${unusedService.data.data.id}`, null, barberLogin.data.token)).status, 200);
    assert.equal((await call("POST", "/api/services", { name: "No permission", price: 1000, duration_minutes: 10 }, customerLogin.data.token)).status, 403);
  });

  await t.test("PostgreSQL booking exclusion parallel, overlap, status va rollback holatlarini himoya qiladi", async () => {
    const fixture = await createBookingReadFixtures("82");
    await ownerPool.query(`INSERT INTO barber_working_hours (barber_id,day_of_week,start_time,end_time)
      VALUES ($1,4,'09:00','18:00'),($2,4,'09:00','18:00')`, [fixture.barberOne.id, fixture.barberTwo.id]);
    const post = (barber, service, time, token = fixture.customerOne.token) => call("POST", "/api/bookings", {
      barber_id: barber, service_id: service, booking_time: time,
    }, token);

    const identical = await post(fixture.barberOne.id, (await appPool.query("SELECT id FROM services WHERE barber_id=$1 ORDER BY id LIMIT 1", [fixture.barberOne.id])).rows[0].id, "2099-01-01T10:00:00+05:00");
    assert.equal(identical.status, 409);
    const partial = await post(fixture.barberOne.id, (await appPool.query("SELECT id FROM services WHERE barber_id=$1 ORDER BY id LIMIT 1", [fixture.barberOne.id])).rows[0].id, "2099-01-01T10:15:00+05:00");
    assert.equal(partial.status, 409);

    const serviceOne = (await appPool.query("SELECT id FROM services WHERE barber_id=$1 ORDER BY id LIMIT 1", [fixture.barberOne.id])).rows[0].id;
    const serviceTwo = (await appPool.query("SELECT id FROM services WHERE barber_id=$1 ORDER BY id LIMIT 1", [fixture.barberTwo.id])).rows[0].id;
    const adjacent = await post(fixture.barberOne.id, serviceOne, "2099-01-01T11:00:00+05:00");
    assert.equal(adjacent.status, 201);
    const otherBarber = await post(fixture.barberTwo.id, serviceTwo, "2099-01-01T11:00:00+05:00");
    assert.equal(otherBarber.status, 201);

    const parallel = await Promise.all([
      post(fixture.barberOne.id, serviceOne, "2099-01-01T12:00:00+05:00"),
      post(fixture.barberOne.id, serviceOne, "2099-01-01T12:00:00+05:00", fixture.customerTwo.token),
    ]);
    assert.deepEqual(parallel.map((response) => response.status).sort(), [201, 409]);

    const confirmed = await call("PUT", `/api/bookings/${adjacent.data.data.id}`, { status: "confirmed" }, fixture.barberOne.token);
    assert.equal(confirmed.status, 200);
    assert.equal((await post(fixture.barberOne.id, serviceOne, "2099-01-01T11:00:00+05:00")).status, 409);

    const cancellable = await post(fixture.barberOne.id, serviceOne, "2099-01-01T13:00:00+05:00");
    assert.equal(cancellable.status, 201);
    assert.equal((await call("PUT", `/api/bookings/${cancellable.data.data.id}`, { status: "cancelled" }, fixture.customerOne.token)).status, 200);
    assert.equal((await post(fixture.barberOne.id, serviceOne, "2099-01-01T13:00:00+05:00")).status, 201);
    const rejectable = await post(fixture.barberOne.id, serviceOne, "2099-01-01T14:00:00+05:00");
    assert.equal(rejectable.status, 201);
    assert.equal((await call("PUT", `/api/bookings/${rejectable.data.data.id}`, { status: "rejected" }, fixture.barberOne.token)).status, 200);
    assert.equal((await post(fixture.barberOne.id, serviceOne, "2099-01-01T14:00:00+05:00")).status, 201);

    const before = Number((await ownerPool.query("SELECT count(*) AS n FROM bookings WHERE barber_id=$1 AND booking_time='2099-01-01T10:00:00+05:00'", [fixture.barberOne.id])).rows[0].n);
    const direct = await ownerPool.connect();
    try {
      await direct.query("BEGIN");
      await assert.rejects(direct.query(`INSERT INTO bookings (customer_id,barber_id,service_id,booking_time,duration_minutes,status)
        VALUES ($1,$2,$3,'2099-01-01T10:00:00+05:00',30,'pending')`, [fixture.customerTwo.id, fixture.barberOne.id, serviceOne]), { code: "23P01" });
      await direct.query("ROLLBACK");
      assert.equal(Number((await direct.query("SELECT count(*) AS n FROM bookings WHERE barber_id=$1 AND booking_time='2099-01-01T10:00:00+05:00'", [fixture.barberOne.id])).rows[0].n), before);
    } finally { direct.release(); }

    // The valid transition graph cannot cause a real EXCLUDE violation on UPDATE:
    // pending -> confirmed keeps the row active, while every transition out of
    // pending/confirmed moves it out of the constraint predicate. Keep this
    // trigger regression for the HTTP SQLSTATE mapper; direct INSERT above tests
    // the real exclusion constraint.
    const statusGuardName = `test_23p01_guard_${process.pid}`;
    await ownerPool.query(`CREATE FUNCTION ${quotedSchema}.${quoteIdentifier(statusGuardName)}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'internal test detail' USING ERRCODE='23P01'; END $$`);
    await ownerPool.query(`CREATE TRIGGER ${quoteIdentifier(statusGuardName)} BEFORE UPDATE OF status ON ${quotedSchema}.bookings
      FOR EACH ROW WHEN (OLD.id=${Number(adjacent.data.data.id)}) EXECUTE FUNCTION ${quotedSchema}.${quoteIdentifier(statusGuardName)}()`);
    try {
      const response = await call("PUT", `/api/bookings/${adjacent.data.data.id}`, { status: "cancelled" }, fixture.customerOne.token);
      assert.equal(response.status, 409);
      assert.deepEqual(response.data, { message: "Bu vaqt band" });
      assert.equal(JSON.stringify(response.data).includes("internal test detail"), false);
    } finally {
      await ownerPool.query(`DROP TRIGGER ${quoteIdentifier(statusGuardName)} ON ${quotedSchema}.bookings`);
      await ownerPool.query(`DROP FUNCTION ${quotedSchema}.${quoteIdentifier(statusGuardName)}()`);
    }
  });

  await t.test("booking overlap migration mavjud to'qnashuvlarda IDlarni ko'rsatib atomar rollback qiladi", async () => {
    const overlapSchema = `test_overlap_migration_${process.pid}_${Date.now()}`;
    const quotedOverlapSchema = quoteIdentifier(overlapSchema);
    const migrationClient = new (require("pg").Client)({ connectionString: ownerDatabaseUrl, ssl: false, options: `-c search_path=${overlapSchema}` });
    await ownerPool.query(`CREATE SCHEMA ${quotedOverlapSchema}`);
    try {
      await migrationClient.connect();
      await migrationClient.query(`CREATE TABLE ustara_schema_migrations (version text PRIMARY KEY);
        CREATE TABLE bookings (
          id integer PRIMARY KEY, barber_id integer NOT NULL, booking_time timestamptz NOT NULL,
          duration_minutes integer NOT NULL, status text NOT NULL
        );
        INSERT INTO ustara_schema_migrations(version) VALUES ('20261114_slots_01_booking_duration');
        INSERT INTO bookings VALUES
          (71001, 77, '2099-01-01T10:00:00+05:00', 30, 'pending'),
          (71002, 77, '2099-01-01T10:15:00+05:00', 30, 'confirmed');`);
      const migrationSql = fs.readFileSync(path.join(__dirname, "../database/migrations/20261115_slots_02_booking_no_overlap.sql"), "utf8");
      await assert.rejects(migrationClient.query(migrationSql), (error) =>
        error.code === "P0001" && error.message.includes("71001/71002"));
      await migrationClient.query("ROLLBACK");
      assert.deepEqual((await migrationClient.query("SELECT id,barber_id,booking_time,duration_minutes,status FROM bookings ORDER BY id")).rows,
        [
          { id: 71001, barber_id: 77, booking_time: new Date("2099-01-01T05:00:00.000Z"), duration_minutes: 30, status: "pending" },
          { id: 71002, barber_id: 77, booking_time: new Date("2099-01-01T05:15:00.000Z"), duration_minutes: 30, status: "confirmed" },
        ]);
      assert.equal((await migrationClient.query("SELECT to_regclass('bookings_active_time_excl') AS constraint_name")).rows[0].constraint_name, null);
      assert.equal((await migrationClient.query("SELECT count(*)::int AS n FROM ustara_schema_migrations WHERE version='20261115_slots_02_booking_no_overlap'")).rows[0].n, 0);
    } finally {
      await migrationClient.end();
      await dropOwnedSchema(ownerPool, ownerTarget, overlapSchema, true);
    }
  });

  await t.test("bookinglar ro'yxati customer, barber va admin ruxsatlarini chegaralaydi", async () => {
    const fixture = await createBookingReadFixtures("80");

    for (const token of [undefined, "noto'g'ri.jwt.token"]) {
      const response = await call("GET", "/api/bookings", null, token);
      assert.equal(response.status, 401);
    }

    const customerOneList = await call("GET", "/api/bookings", null, fixture.customerOne.token);
    assert.equal(customerOneList.status, 200);
    assert.deepEqual(customerOneList.data.map((booking) => booking.id), [fixture.bookingOne]);
    assert.ok(customerOneList.data.every((booking) => booking.customer_id === fixture.customerOne.id));
    assert.ok(customerOneList.data.every((booking) => booking.barber_id === fixture.barberOne.id));
    assert.equal(JSON.stringify(customerOneList.data).includes(fixture.customerTwo.lastName), false);
    assert.equal(JSON.stringify(customerOneList.data).includes(fixture.barberTwo.lastName), false);

    const customerTwoList = await call("GET", "/api/bookings", null, fixture.customerTwo.token);
    assert.equal(customerTwoList.status, 200);
    assert.deepEqual(customerTwoList.data.map((booking) => booking.id).sort((a, b) => a - b),
      [fixture.bookingTwo, fixture.bookingThree].sort((a, b) => a - b));
    assert.ok(customerTwoList.data.every((booking) => booking.customer_id === fixture.customerTwo.id));
    assert.equal(JSON.stringify(customerTwoList.data).includes(fixture.customerOne.lastName), false);

    const barberOneList = await call("GET", "/api/bookings", null, fixture.barberOne.token);
    assert.equal(barberOneList.status, 200);
    assert.deepEqual(barberOneList.data.map((booking) => booking.id).sort((a, b) => a - b),
      [fixture.bookingOne, fixture.bookingTwo].sort((a, b) => a - b));
    assert.ok(barberOneList.data.every((booking) => booking.barber_id === fixture.barberOne.id));
    assert.equal(JSON.stringify(barberOneList.data).includes(fixture.barberTwo.lastName), false);

    const barberTwoList = await call("GET", "/api/bookings", null, fixture.barberTwo.token);
    assert.equal(barberTwoList.status, 200);
    assert.deepEqual(barberTwoList.data.map((booking) => booking.id), [fixture.bookingThree]);
    assert.ok(barberTwoList.data.every((booking) => booking.barber_id === fixture.barberTwo.id));
    assert.equal(JSON.stringify(barberTwoList.data).includes(fixture.barberOne.lastName), false);

    const adminList = await call("GET", "/api/bookings", null, fixture.adminToken);
    assert.equal(adminList.status, 403);
  });

  await t.test("booking ID bo'yicha o'qish egani tekshiradi va admin siyosatini saqlaydi", async () => {
    const fixture = await createBookingReadFixtures("81");

    for (const token of [undefined, "noto'g'ri.jwt.token"]) {
      const response = await call("GET", `/api/bookings/${fixture.bookingOne}`, null, token);
      assert.equal(response.status, 401);
    }

    const customerOneOwn = await call("GET", `/api/bookings/${fixture.bookingOne}`, null, fixture.customerOne.token);
    assert.equal(customerOneOwn.status, 200);
    assert.equal(customerOneOwn.data.id, fixture.bookingOne);
    assert.equal(customerOneOwn.data.customer_id, fixture.customerOne.id);
    assert.equal(customerOneOwn.data.barber_id, fixture.barberOne.id);

    for (const foreignBooking of [fixture.bookingTwo, fixture.bookingThree]) {
      const response = await call("GET", `/api/bookings/${foreignBooking}`, null, fixture.customerOne.token);
      assert.equal(response.status, 404);
      assert.deepEqual(response.data, { message: "Booking topilmadi" });
      assert.equal(JSON.stringify(response.data).includes(fixture.customerTwo.lastName), false);
      assert.equal(JSON.stringify(response.data).includes(fixture.barberTwo.lastName), false);
    }

    const customerTwoOwn = await call("GET", `/api/bookings/${fixture.bookingTwo}`, null, fixture.customerTwo.token);
    assert.equal(customerTwoOwn.status, 200);
    assert.equal(customerTwoOwn.data.customer_id, fixture.customerTwo.id);
    const customerTwoOtherOwn = await call("GET", `/api/bookings/${fixture.bookingThree}`, null, fixture.customerTwo.token);
    assert.equal(customerTwoOtherOwn.status, 200);
    assert.equal(customerTwoOtherOwn.data.customer_id, fixture.customerTwo.id);

    for (const ownBooking of [fixture.bookingOne, fixture.bookingTwo]) {
      const response = await call("GET", `/api/bookings/${ownBooking}`, null, fixture.barberOne.token);
      assert.equal(response.status, 200);
      assert.equal(response.data.barber_id, fixture.barberOne.id);
    }
    const barberOneForeign = await call("GET", `/api/bookings/${fixture.bookingThree}`, null, fixture.barberOne.token);
    assert.equal(barberOneForeign.status, 404);
    assert.deepEqual(barberOneForeign.data, { message: "Booking topilmadi" });
    assert.equal(JSON.stringify(barberOneForeign.data).includes(fixture.customerTwo.lastName), false);
    assert.equal(JSON.stringify(barberOneForeign.data).includes(fixture.barberTwo.lastName), false);

    const barberTwoOwn = await call("GET", `/api/bookings/${fixture.bookingThree}`, null, fixture.barberTwo.token);
    assert.equal(barberTwoOwn.status, 200);
    assert.equal(barberTwoOwn.data.barber_id, fixture.barberTwo.id);
    for (const foreignBooking of [fixture.bookingOne, fixture.bookingTwo]) {
      const response = await call("GET", `/api/bookings/${foreignBooking}`, null, fixture.barberTwo.token);
      assert.equal(response.status, 404);
      assert.deepEqual(response.data, { message: "Booking topilmadi" });
    }

    const adminOwnPolicy = await call("GET", `/api/bookings/${fixture.bookingOne}`, null, fixture.adminToken);
    assert.equal(adminOwnPolicy.status, 200);
    assert.equal(adminOwnPolicy.data.id, fixture.bookingOne);
    assert.equal(adminOwnPolicy.data.customer_id, fixture.customerOne.id);
    assert.equal(adminOwnPolicy.data.barber_id, fixture.barberOne.id);

    const missing = await call("GET", "/api/bookings/2147483647", null, fixture.customerOne.token);
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.data, { message: "Booking topilmadi" });
  });
});
