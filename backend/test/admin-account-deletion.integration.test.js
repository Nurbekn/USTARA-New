const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { parseAllowedSessionUsers, testTarget } = require("./helpers/testDatabaseTarget");

const enabled = process.env.USTARA_ACCOUNT_INTEGRITY_TESTS === "I_AUTHORIZE_TEST_DATABASE";
const phone = (n) => `+99891000${String(n).padStart(5, "0")}`;
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function invoke(handler, req, ...args) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res, undefined, ...args);
  return res;
}

test("PostgreSQL admin account deletion erases only target-owned data", { skip: !enabled }, async (t) => {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test talab qilinadi");
  const allowedUsers = parseAllowedSessionUsers(process.env.USTARA_ACCOUNT_INTEGRITY_TEST_USERS,
    "USTARA_ACCOUNT_INTEGRITY_TEST_USERS");
  const target = testTarget(process.env.USTARA_TEST_DATABASE_URL, "Account integrity test database", allowedUsers);
  assert.ok(!["ustara_test_owner", "ustara_test_app"].includes(target.sessionUser),
    "Account Integrity session user API suite role'laridan alohida bo'lishi kerak");
  const { createAccountIntegrityHarness } = require("./helpers/accountIntegrityHarness");
  const harness = await createAccountIntegrityHarness();
  const envKeys = ["NODE_ENV", "USTARA_TEST_SEARCH_PATH", "USTARA_TEST_USE_APP_DATABASE_URL"];
  const restoreEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  process.env.USTARA_TEST_SEARCH_PATH = harness.schema;
  process.env.USTARA_TEST_USE_APP_DATABASE_URL = "0";
  t.after(async () => {
    let cleanupError;
    try {
      await harness.close();
    } catch (error) {
      cleanupError = error;
    } finally {
      for (const [key, value] of Object.entries(restoreEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    if (cleanupError) throw cleanupError;
  });
  const { AccountDeletionError, createAccountDeletionService } = require("../services/accountDeletionService");
  const { addService, refreshServiceData, deleteService } = require("../controllers/servicesController");
  const { createBooking } = require("../controllers/bookingsController");
  const { setWorkingHours } = require("../controllers/barbersController");
  const { refreshData: refreshCustomerData } = require("../controllers/customersController");
  const { createTelegramLinkService } = require("../services/telegramLinkService");
  const { pool } = harness;
  const service = createAccountDeletionService(pool);
  const admin = { role: "admin", id: 1 };

  async function createAccount(role, n) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash',$2) RETURNING id", [phone(n), role]);
      const table = role === "customer" ? "customers" : "barbers";
      const profile = await client.query(`INSERT INTO ${table}(user_id,first_name,last_name${role === "barber" ? ",specialty" : ""}) VALUES($1,'First',$2${role === "barber" ? ",'barber'" : ""}) RETURNING id`, [account.rows[0].id, `Last${n}`]);
      await client.query("COMMIT");
      return { userId: account.rows[0].id, profileId: profile.rows[0].id, phone: phone(n) };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async function addPhoneArtifacts(target, n) {
    const p = target.phone;
    const ipHash = digest(`198.51.100.${n}`);
    const adminAccountHash = digest(`fixture-admin-account-${n}`);
    const registrationNonce = digest(`registration-issuance:${p}`);
    const historyNonce = digest(`registration-history:${p}`);
    const passwordResetNonce = digest(`password-reset-issuance:${p}`);
    await pool.query("INSERT INTO account_session_versions(user_id,version) VALUES($1,1)", [target.userId]);
    await pool.query("INSERT INTO registration_phone_limits(phone) VALUES($1)", [p]);
    await pool.query(`INSERT INTO pending_registrations(phone,role,password_hash,otp_hmac_hash,otp_hmac_key_id,
      otp_issuance_nonce,otp_sent_at,otp_expires_at,session_token_hash,session_expires_at,created_at,updated_at)
      VALUES($1,'customer','$2b$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',repeat('a',64),'v1',$2,
      '2026-01-01 00:00:00+00','2026-01-01 00:03:00+00',repeat('c',64),'2026-01-01 00:30:00+00',
      '2026-01-01 00:00:00+00','2026-01-01 00:00:00+00')`, [p, registrationNonce]);
    await pool.query(`INSERT INTO registration_otp_history(phone,registration_id,issuance_nonce,otp_hmac_hash,
      otp_hmac_key_id,sent_at,expires_at) VALUES($1,$2,$3,repeat('e',64),'v1',
      '2026-01-01 00:00:00+00','2026-01-01 00:03:00+00')`, [p, n, historyNonce]);
    await pool.query("INSERT INTO registration_security_events(phone,event_type) VALUES($1,'test_event')", [p]);
    await pool.query("INSERT INTO registration_admin_actions(admin_account_id,phone,action_type,reason) VALUES(1,$1,'test_action','fixture')", [p]);
    await pool.query("INSERT INTO password_reset_limits(phone) VALUES($1)", [p]);
    await pool.query(`INSERT INTO password_reset_requests(phone,user_id,challenge_token_hash,otp_hmac_hash,otp_hmac_key_id,
      otp_issuance_nonce,otp_sent_at,otp_expires_at,challenge_expires_at)
      VALUES($1,$2,repeat('f',64),repeat('a',64),'v1',$3,
      '2026-01-01 00:00:00+00','2026-01-01 00:03:00+00','2026-01-01 00:30:00+00')`, [p, target.userId, passwordResetNonce]);
    await pool.query("INSERT INTO password_reset_events(phone,event_type,occurred_at) VALUES($1,'test_event','2026-01-01')", [p]);
    await pool.query("INSERT INTO login_attempt_limits(scope,kind,key_hash) VALUES('public','account',$1),('public','ip',$2),('admin','account',$3)",
      [digest(p), ipHash, adminAccountHash]);
    return { ipHash, adminAccountHash };
  }

  async function cleanupRollbackFixture({ customer, barber, serviceId, n }) {
    if (!customer && !barber) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (customer && barber && serviceId !== null) {
        await client.query("DELETE FROM bookings WHERE customer_id=$1 AND barber_id=$2 AND service_id=$3",
          [customer.profileId, barber.profileId, serviceId]);
      }
      if (barber && serviceId !== null) {
        await client.query("DELETE FROM services WHERE id=$1 AND barber_id=$2", [serviceId, barber.profileId]);
      }
      if (customer) {
        await client.query("DELETE FROM pending_registrations WHERE phone=$1", [customer.phone]);
        await client.query("DELETE FROM registration_otp_history WHERE phone=$1", [customer.phone]);
        await client.query("DELETE FROM registration_security_events WHERE phone=$1", [customer.phone]);
        await client.query("DELETE FROM registration_admin_actions WHERE phone=$1", [customer.phone]);
        await client.query("DELETE FROM password_reset_requests WHERE phone=$1 OR user_id=$2", [customer.phone, customer.userId]);
        await client.query("DELETE FROM password_reset_events WHERE phone=$1", [customer.phone]);
        await client.query("DELETE FROM registration_phone_limits WHERE phone=$1", [customer.phone]);
        await client.query("DELETE FROM password_reset_limits WHERE phone=$1", [customer.phone]);
        await client.query("DELETE FROM account_session_versions WHERE user_id=$1", [customer.userId]);
        await client.query(`DELETE FROM login_attempt_limits
          WHERE (scope='public' AND kind='account' AND key_hash=$1)
             OR (scope='public' AND kind='ip' AND key_hash=$2)
             OR (scope='admin' AND kind='account' AND key_hash=$3)`,
        [digest(customer.phone), digest(`198.51.100.${n}`), digest(`fixture-admin-account-${n}`)]);
        await client.query("DELETE FROM customers WHERE id=$1 AND user_id=$2", [customer.profileId, customer.userId]);
        await client.query("DELETE FROM users WHERE id=$1 AND phone=$2", [customer.userId, customer.phone]);
      }
      if (barber) {
        await client.query("DELETE FROM barbers WHERE id=$1 AND user_id=$2", [barber.profileId, barber.userId]);
        await client.query("DELETE FROM users WHERE id=$1 AND phone=$2", [barber.userId, barber.phone]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function createService(barberId) {
    return (await pool.query("INSERT INTO services(barber_id,name,price,duration_minutes) VALUES($1,'Test service',25,30) RETURNING id", [barberId])).rows[0].id;
  }

  await t.test("customer barcha statusdagi booking va phone/hash qoldiqlari bilan o'chadi", async () => {
    const customer = await createAccount("customer", 1);
    const barber = await createAccount("barber", 2);
    const serviceId = await createService(barber.profileId);
    for (const [index, status] of ["pending", "confirmed", "completed", "cancelled", "rejected"].entries()) {
      await pool.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,$4,30,$5)",
        [customer.profileId, barber.profileId, serviceId, new Date(Date.UTC(2020, 0, 1, 8 + index)), status]);
    }
    const unrelatedHashes = await addPhoneArtifacts(customer, 1);
    await pool.query("INSERT INTO registration_admin_actions(admin_account_id,phone,action_type,reason) VALUES(1,$1,'other_target_action','preserve')", [barber.phone]);
    await service.deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" });
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [customer.userId])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE id=$1", [customer.profileId])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE customer_id=$1", [customer.profileId])).rows[0].n, 0);
    for (const table of ["pending_registrations", "registration_otp_history", "registration_security_events", "registration_admin_actions", "registration_phone_limits", "password_reset_requests", "password_reset_events", "password_reset_limits"]) {
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE phone=$1`, [customer.phone])).rows[0].n, 0, `${table} cleanup`);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM login_attempt_limits WHERE scope='public' AND kind='account' AND key_hash=$1", [digest(customer.phone)])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_session_versions WHERE user_id=$1", [customer.userId])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM login_attempt_limits WHERE scope='public' AND kind='ip' AND key_hash=$1", [unrelatedHashes.ipHash])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM login_attempt_limits WHERE scope='admin' AND kind='account' AND key_hash=$1", [unrelatedHashes.adminAccountHash])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM registration_admin_actions WHERE phone=$1", [barber.phone])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM admin_accounts WHERE id=1")).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [barber.userId])).rows[0].n, 1);
    const replacement = await pool.connect();
    try {
      await replacement.query("BEGIN");
      const account = await replacement.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash','customer') RETURNING id", [customer.phone]);
      await replacement.query("INSERT INTO customers(user_id,first_name,last_name) VALUES($1,'Replacement','Account')", [account.rows[0].id]);
      await replacement.query("COMMIT");
    } catch (error) { await replacement.query("ROLLBACK"); throw error; }
    finally { replacement.release(); }
  });

  await t.test("barber booking, service, schedule va Telegram qoldiqlari cascade bilan o'chadi", async () => {
    const barber = await createAccount("barber", 3);
    const customer = await createAccount("customer", 4);
    const serviceId = await createService(barber.profileId);
    await pool.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,1,'09:00','17:00')", [barber.profileId]);
    await pool.query("INSERT INTO barber_telegram_links(barber_id,chat_id,linked_at) VALUES($1,$2,now())", [barber.profileId, 900001]);
    await pool.query("INSERT INTO barber_telegram_link_tokens(barber_id,token_hash,created_at,expires_at,session_version) VALUES($1,repeat('a',64),now(),now()+interval '5 minutes',0)", [barber.profileId]);
    for (const [index, status] of ["pending", "confirmed", "completed", "cancelled", "rejected"].entries()) {
      await pool.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,$4,30,$5)",
        [customer.profileId, barber.profileId, serviceId, new Date(Date.UTC(2020, 0, 2, 8 + index)), status]);
    }
    const unrelatedHashes = await addPhoneArtifacts(barber, 3);
    await pool.query("INSERT INTO registration_admin_actions(admin_account_id,phone,action_type,reason) VALUES(1,$1,'other_target_action','preserve')", [customer.phone]);
    await service.deleteAccount({ actor: admin, profileId: barber.profileId, role: "barber" });
    for (const [table, column, value] of [["users","id",barber.userId],["barbers","id",barber.profileId],["services","barber_id",barber.profileId],
      ["barber_working_hours","barber_id",barber.profileId],["barber_telegram_links","barber_id",barber.profileId],
      ["barber_telegram_link_tokens","barber_id",barber.profileId],["bookings","barber_id",barber.profileId]]) {
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`, [value])).rows[0].n, 0, `${table} cleanup`);
    }
    for (const table of ["pending_registrations", "registration_otp_history", "registration_security_events", "registration_admin_actions", "registration_phone_limits", "password_reset_requests", "password_reset_events", "password_reset_limits"]) {
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE phone=$1`, [barber.phone])).rows[0].n, 0, `${table} cleanup`);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM login_attempt_limits WHERE scope='public' AND kind='account' AND key_hash=$1", [digest(barber.phone)])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_session_versions WHERE user_id=$1", [barber.userId])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [customer.userId])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM admin_accounts WHERE id=1")).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM login_attempt_limits WHERE scope='public' AND kind='ip' AND key_hash=$1", [unrelatedHashes.ipHash])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM login_attempt_limits WHERE scope='admin' AND kind='account' AND key_hash=$1", [unrelatedHashes.adminAccountHash])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM registration_admin_actions WHERE phone=$1", [customer.phone])).rows[0].n, 1);
  });

  await t.test("v186: pending/confirmed future booking blocks admin removal for both roles", async () => {
    const customer = await createAccount("customer", 51);
    const barber = await createAccount("barber", 52);
    const serviceId = await createService(barber.profileId);
    await pool.query(`INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status)
      VALUES($1,$2,$3,'2099-05-01 09:00:00+00',30,'confirmed')`, [customer.profileId,barber.profileId,serviceId]);
    for(const [role,profileId,userId] of [['customer',customer.profileId,customer.userId],['barber',barber.profileId,barber.userId]]){
      await assert.rejects(service.deleteAccount({actor:admin,profileId,role}),e=>
        e instanceof AccountDeletionError && e.status===409 && e.code==='active_bookings');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM users WHERE id=$1',[userId])).rows[0].n,1);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE customer_id=$1',[customer.profileId])).rows[0].n,1);
    await pool.query(`UPDATE bookings SET status='completed' WHERE customer_id=$1 AND barber_id=$2`,[customer.profileId,barber.profileId]);
    await service.deleteAccount({actor:admin,profileId:customer.profileId,role:'customer'});
    await service.deleteAccount({actor:admin,profileId:barber.profileId,role:'barber'});
  });

  await t.test("service/booking ownership anomaliyasi deletionni rollback qiladi", async () => {
    const target = await createAccount("barber", 5);
    const other = await createAccount("barber", 6);
    const customer = await createAccount("customer", 7);
    const targetService = await createService(target.profileId);
    await pool.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,'2030-01-03 09:00+00',30,'cancelled')",
      [customer.profileId, other.profileId, targetService]);
    await assert.rejects(service.deleteAccount({ actor: admin, profileId: target.profileId, role: "barber" }),
      (error) => error instanceof AccountDeletionError && error.code === "booking_service_ownership_mismatch");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [target.userId])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=ANY($1::int[])", [[other.userId, customer.userId]])).rows[0].n, 2);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM barbers WHERE id=ANY($1::int[])", [[target.profileId, other.profileId]])).rows[0].n, 2);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE customer_id=$1 AND barber_id=$2 AND service_id=$3", [customer.profileId, other.profileId, targetService])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM services WHERE id=$1 AND barber_id=$2", [targetService, target.profileId])).rows[0].n, 1);
  });

  await t.test("booking target barberga tegishli, ammo service boshqa barberniki bo'lsa deletion rollback qiladi", async () => {
    const target = await createAccount("barber", 21);
    const other = await createAccount("barber", 22);
    const customer = await createAccount("customer", 23);
    const otherService = await createService(other.profileId);
    const booking = await pool.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,'2030-01-07 09:00+00',30,'pending') RETURNING id",
      [customer.profileId, target.profileId, otherService]);
    await assert.rejects(service.deleteAccount({ actor: admin, profileId: target.profileId, role: "barber" }),
      (error) => error instanceof AccountDeletionError && error.code === "booking_service_ownership_mismatch");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=ANY($1::int[])", [[target.userId, other.userId, customer.userId]])).rows[0].n, 3);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE id=$1 AND customer_id=$2 AND barber_id=$3 AND service_id=$4", [booking.rows[0].id, customer.profileId, target.profileId, otherService])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM services WHERE id=$1 AND barber_id=$2", [otherService, other.profileId])).rows[0].n, 1);
  });

  for (const [label, n, failureSql] of [
    ["booking deletionidan so'ng", 8, "DELETE FROM bookings"],
    ["telefon artefaktlarining bir qismi o'chirilgandan keyin", 18, "DELETE FROM registration_otp_history"],
    ["user qatori o'chirilgandan keyin", 24, "DELETE FROM users"],
  ]) {
    await t.test(`o'chirish xato ${label} yuz berganda to'liq rollback qilinadi`, async (t) => {
      const fixture = { customer: null, barber: null, serviceId: null, n };
      t.after(() => cleanupRollbackFixture(fixture));
      fixture.customer = await createAccount("customer", n);
      fixture.barber = await createAccount("barber", n + 1);
      fixture.serviceId = await createService(fixture.barber.profileId);
      const { customer, barber, serviceId } = fixture;
      await pool.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,$4,30,'completed')",
        [customer.profileId, barber.profileId, serviceId, new Date(Date.UTC(2030, 0, 4, 8 + n % 8))]);
      await addPhoneArtifacts(customer, n);
      const faultyPool = { connect: async () => {
        const client = await pool.connect();
        return { query: async (sql, args) => {
          const result = await client.query(sql, args);
          if (!faultInjected && sql.includes(failureSql)) { faultInjected = true; throw new Error("injected test failure"); }
          return result;
        }, release: () => client.release() };
      } };
      let faultInjected = false;
      await assert.rejects(createAccountDeletionService(faultyPool).deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" }), /injected test failure/);
      assert.equal(faultInjected, true);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1 AND phone=$2", [customer.userId, customer.phone])).rows[0].n, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE id=$1 AND user_id=$2", [customer.profileId, customer.userId])).rows[0].n, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE customer_id=$1 AND service_id=$2", [customer.profileId, serviceId])).rows[0].n, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM pending_registrations WHERE phone=$1", [customer.phone])).rows[0].n, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM registration_otp_history WHERE phone=$1", [customer.phone])).rows[0].n, 1);
      await assert.rejects(pool.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash','customer')", [customer.phone]), { code: "23505" });
    });
  }

  await t.test("parallel admin deletionda bittasi o'chiradi, ikkinchisi 404 oladi", async () => {
    const customer = await createAccount("customer", 10);
    const results = await Promise.allSettled([
      service.deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" }),
      service.deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected.reason instanceof AccountDeletionError);
    assert.equal(rejected.reason.status, 404);
  });

  async function approvedBarber(n) {
    const barber = await createAccount("barber", n);
    await pool.query("UPDATE barbers SET verification_status='approved' WHERE id=$1", [barber.profileId]);
    return barber;
  }

  async function assertBarberGraphRemoved(barber) {
    for (const [table, column] of [["users", "id"], ["barbers", "id"], ["services", "barber_id"],
      ["barber_working_hours", "barber_id"], ["barber_telegram_links", "barber_id"],
      ["barber_telegram_link_tokens", "barber_id"], ["bookings", "barber_id"]]) {
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`,
        [table === "users" ? barber.userId : barber.profileId])).rows[0].n, 0, `${table} has no deleted barber data`);
    }
  }

  async function runBarberMutationRace(barber, mutation) {
    const [mutationResult, deletionResult] = await Promise.all([
      mutation(), service.deleteAccount({ actor: admin, profileId: barber.profileId, role: "barber" }),
    ]);
    assert.ok([200, 201, 404].includes(mutationResult.statusCode), `safe controller result: ${mutationResult.statusCode}`);
    assert.deepEqual(deletionResult, { userId: barber.userId, profileId: barber.profileId, role: "barber" });
    await assertBarberGraphRemoved(barber);
  }

  await t.test("haqiqiy addService barber deletion bilan parallel ishlaydi", async () => {
    const barber = await approvedBarber(30);
    await runBarberMutationRace(barber, () => invoke(addService,
      { user: { role: "barber", profileId: barber.profileId }, body: { name: "Parallel add", price: 10, duration_minutes: 20 } }, pool));
  });

  await t.test("haqiqiy refreshServiceData barber deletion bilan parallel ishlaydi", async () => {
    const barber = await approvedBarber(31);
    const serviceId = await createService(barber.profileId);
    await runBarberMutationRace(barber, () => invoke(refreshServiceData,
      { user: { role: "barber", profileId: barber.profileId }, params: { id: String(serviceId) },
        body: { name: "Parallel update", price: 12, duration_minutes: 25 } }, pool));
  });

  await t.test("haqiqiy deleteService barber deletion bilan parallel ishlaydi", async () => {
    const barber = await approvedBarber(32);
    const serviceId = await createService(barber.profileId);
    await runBarberMutationRace(barber, () => invoke(deleteService,
      { user: { role: "barber", profileId: barber.profileId }, params: { id: String(serviceId) } }, pool));
  });

  await t.test("haqiqiy setWorkingHours barber deletion bilan parallel ishlaydi", async () => {
    const barber = await approvedBarber(33);
    await runBarberMutationRace(barber, () => invoke(setWorkingHours,
      { user: { role: "barber", profileId: barber.profileId }, body: { working_hours: [
        { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
      ] } }, pool));
  });

  await t.test("haqiqiy Telegram linking barber deletion bilan parallel ishlaydi", async () => {
    const barber = await createAccount("barber", 34);
    const telegram = createTelegramLinkService({ pool, env: { TELEGRAM_BOT_USERNAME: "ustara_bot" } });
    const results = await Promise.allSettled([
      telegram.start({ role: "barber", id: barber.userId, profileId: barber.profileId, sessionVersion: 0 }),
      service.deleteAccount({ actor: admin, profileId: barber.profileId, role: "barber" }),
    ]);
    assert.equal(results[1].status, "fulfilled");
    if (results[0].status === "rejected") assert.equal(results[0].reason.status, 401);
    await assertBarberGraphRemoved(barber);
  });

  await t.test("haqiqiy customer profile update deletion bilan parallel ishlaydi", async () => {
    const customer = await createAccount("customer", 39);
    const [updateResult, deletionResult] = await Promise.all([
      invoke(refreshCustomerData, { user: { role: "customer", profileId: customer.profileId },
        params: { id: String(customer.profileId) }, body: { firstName: "Concurrent", lastName: "Update" } }, pool),
      service.deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" }),
    ]);
    assert.ok([200, 404].includes(updateResult.statusCode), `safe profile update result: ${updateResult.statusCode}`);
    assert.deepEqual(deletionResult, { userId: customer.userId, profileId: customer.profileId, role: "customer" });
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [customer.userId])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE id=$1", [customer.profileId])).rows[0].n, 0);
  });

  async function createBookingFixture(customer, barber, n) {
    await pool.query("UPDATE barbers SET verification_status='approved' WHERE id=$1", [barber.profileId]);
    const serviceId = await createService(barber.profileId);
    const utc = new Date(Date.UTC(2099, 0, 1 + n, 5, 0));
    await pool.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,$2,'00:00','23:59')",
      [barber.profileId, utc.getUTCDay()]);
    return { serviceId, bookingTime: utc.toISOString() };
  }

  await t.test("haqiqiy booking creation barber deletion bilan parallel bo'lsa orphan booking qolmaydi", async () => {
    const barber = await createAccount("barber", 35), customer = await createAccount("customer", 36);
    const fixture = await createBookingFixture(customer, barber, 35);
    const [bookingResult, deletionResult] = await Promise.allSettled([
      invoke(createBooking, { user: { role: "customer", accountId: customer.userId, profileId: customer.profileId },
        body: { barber_id: barber.profileId, service_id: fixture.serviceId, booking_time: fixture.bookingTime } }, pool, async () => {}),
      service.deleteAccount({ actor: admin, profileId: barber.profileId, role: "barber" }),
    ]);
    assert.equal(bookingResult.status,'fulfilled');
    assert.ok([201, 400, 404].includes(bookingResult.value.statusCode), `safe booking result: ${bookingResult.value.statusCode}`);
    if(bookingResult.value.statusCode===201){
      assert.equal(deletionResult.status,'rejected');
      assert.equal(deletionResult.reason.code,'active_bookings');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE barber_id=$1',[barber.profileId])).rows[0].n,1);
    }else{
      assert.equal(deletionResult.status,'fulfilled');
      await assertBarberGraphRemoved(barber);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [customer.userId])).rows[0].n, 1);
  });

  await t.test("haqiqiy booking creation customer deletion bilan parallel bo'lsa customer-siz booking qolmaydi", async () => {
    const customer = await createAccount("customer", 37), barber = await createAccount("barber", 38);
    const fixture = await createBookingFixture(customer, barber, 37);
    const [bookingResult, deletionResult] = await Promise.allSettled([
      invoke(createBooking, { user: { role: "customer", accountId: customer.userId, profileId: customer.profileId },
        body: { barber_id: barber.profileId, service_id: fixture.serviceId, booking_time: fixture.bookingTime } }, pool, async () => {}),
      service.deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" }),
    ]);
    assert.equal(bookingResult.status,'fulfilled');
    assert.ok([201, 400, 404].includes(bookingResult.value.statusCode), `safe booking result: ${bookingResult.value.statusCode}`);
    if(bookingResult.value.statusCode===201){
      assert.equal(deletionResult.status,'rejected');assert.equal(deletionResult.reason.code,'active_bookings');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM users WHERE id=$1',[customer.userId])).rows[0].n,1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE customer_id=$1',[customer.profileId])).rows[0].n,1);
    }else{
      assert.equal(deletionResult.status,'fulfilled');
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [customer.userId])).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE id=$1", [customer.profileId])).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE customer_id=$1", [customer.profileId])).rows[0].n, 0);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM barbers WHERE id=$1", [barber.profileId])).rows[0].n, 1);
  });

  await t.test("booking creation va barber deletion advisory lock bilan ketma-ketlanadi", async () => {
    const barber = await createAccount("barber", 11), customer = await createAccount("customer", 12);
    const serviceId = await createService(barber.profileId);
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT pg_advisory_xact_lock($1)", [barber.profileId]);
      await writer.query("SELECT id FROM barbers WHERE id=$1 FOR SHARE", [barber.profileId]);
      await writer.query("SELECT id FROM services WHERE id=$1 FOR SHARE", [serviceId]);
      await writer.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,'2030-01-05 09:00+00',30,'completed')",
        [customer.profileId, barber.profileId, serviceId]);
      const deletion = service.deleteAccount({ actor: admin, profileId: barber.profileId, role: "barber" });
      await new Promise((resolve) => setTimeout(resolve, 40));
      await writer.query("COMMIT");
      await deletion;
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE barber_id=$1", [barber.profileId])).rows[0].n, 0);
    } finally { await writer.query("ROLLBACK").catch(() => {}); writer.release(); }
  });

  await t.test("booking INSERT va customer deletion FK lock bilan ketma-ketlanadi", async () => {
    const customer = await createAccount("customer", 13), barber = await createAccount("barber", 14);
    const serviceId = await createService(barber.profileId);
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,'2030-01-06 09:00+00',30,'completed')",
        [customer.profileId, barber.profileId, serviceId]);
      const deletion = service.deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" });
      await new Promise((resolve) => setTimeout(resolve, 40));
      await writer.query("COMMIT");
      await deletion;
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE customer_id=$1", [customer.profileId])).rows[0].n, 0);
    } finally { await writer.query("ROLLBACK").catch(() => {}); writer.release(); }
  });

  await t.test("profile UPDATE va account deletion bir xil user/profile row lock bilan ketma-ketlanadi", async () => {
    const customer = await createAccount("customer", 40);
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("UPDATE customers SET first_name='Concurrent update' WHERE id=$1", [customer.profileId]);
      const deletion = service.deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" });
      await new Promise((resolve) => setTimeout(resolve, 40));
      await writer.query("COMMIT");
      await deletion;
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [customer.userId])).rows[0].n, 0);
    } finally { await writer.query("ROLLBACK").catch(() => {}); writer.release(); }
  });

  await t.test("profile DELETE/INSERT va account deletionda eskirgan profile ID 404 qaytaradi", async () => {
    const customer = await createAccount("customer", 20);
    const writer = await pool.connect();
    let replacementId;
    try {
      await writer.query("BEGIN");
      await writer.query("DELETE FROM customers WHERE id=$1", [customer.profileId]);
      replacementId = (await writer.query("INSERT INTO customers(user_id,first_name,last_name) VALUES($1,'Replacement','Profile') RETURNING id", [customer.userId])).rows[0].id;
      const deletion = service.deleteAccount({ actor: admin, profileId: customer.profileId, role: "customer" });
      await new Promise((resolve) => setTimeout(resolve, 40));
      await writer.query("COMMIT");
      await assert.rejects(deletion, (error) => error instanceof AccountDeletionError && error.status === 404);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [customer.userId])).rows[0].n, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE id=$1 AND user_id=$2", [replacementId, customer.userId])).rows[0].n, 1);
    } finally { await writer.query("ROLLBACK").catch(() => {}); writer.release(); }
  });

  await t.test("service, schedule va Telegram write deletion bilan row/advisory lock orqali ketma-ketlanadi", async () => {
    for (const n of [15, 16, 17]) {
      const barber = await createAccount("barber", n);
      const writer = await pool.connect();
      try {
        await writer.query("BEGIN");
        if (n < 17) {
          await writer.query("SELECT pg_advisory_xact_lock($1)", [barber.profileId]);
          await writer.query("SELECT id FROM barbers WHERE id=$1 FOR SHARE", [barber.profileId]);
          if (n === 15) await writer.query("INSERT INTO services(barber_id,name,price,duration_minutes) VALUES($1,'Concurrent service',10,20)", [barber.profileId]);
          else await writer.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,2,'09:00','17:00')", [barber.profileId]);
        } else {
          await writer.query("SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id WHERE b.id=$1 FOR UPDATE OF b", [barber.profileId]);
          await writer.query("INSERT INTO barber_telegram_links(barber_id,chat_id,linked_at) VALUES($1,$2,now())", [barber.profileId, 910017]);
        }
        const deletion = service.deleteAccount({ actor: admin, profileId: barber.profileId, role: "barber" });
        await new Promise((resolve) => setTimeout(resolve, 40));
        await writer.query("COMMIT");
        await deletion;
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM barbers WHERE id=$1", [barber.profileId])).rows[0].n, 0);
      } finally { await writer.query("ROLLBACK").catch(() => {}); writer.release(); }
    }
  });
});
