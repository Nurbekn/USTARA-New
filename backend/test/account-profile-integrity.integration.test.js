const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseAllowedSessionUsers, testTarget } = require("./helpers/testDatabaseTarget");

const enabled = process.env.USTARA_ACCOUNT_INTEGRITY_TESTS === "I_AUTHORIZE_TEST_DATABASE";
const phone = (n) => `+99890000${String(n).padStart(5, "0")}`;

test("PostgreSQL account/profile integrity constraints and deferred triggers", { skip: !enabled }, async (t) => {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test talab qilinadi");
  const allowedUsers = parseAllowedSessionUsers(process.env.USTARA_ACCOUNT_INTEGRITY_TEST_USERS,
    "USTARA_ACCOUNT_INTEGRITY_TEST_USERS");
  testTarget(process.env.USTARA_TEST_DATABASE_URL, "Account integrity test database", allowedUsers);
  const { createAccountIntegrityHarness } = require("./helpers/accountIntegrityHarness");
  const harness = await createAccountIntegrityHarness();
  t.after(() => harness.close());
  const pool = harness.pool;

  async function create(role, n, profileRole = role, specialty = "barber") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash',$2) RETURNING id", [phone(n), role]);
      const table = profileRole === "customer" ? "customers" : "barbers";
      const args = profileRole === "customer"
        ? [user.rows[0].id, "First", `Last${n}`]
        : [user.rows[0].id, "First", `Last${n}`, specialty];
      await client.query(`INSERT INTO ${table}(user_id,first_name,last_name${profileRole === "barber" ? ",specialty" : ""}) VALUES($1,$2,$3${profileRole === "barber" ? ",$4" : ""})`, args);
      await client.query("COMMIT");
      return user.rows[0].id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  await t.test("customer account va profile bitta transactionda yaratiladi", async () => {
    const userId = await create("customer", 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE user_id=$1", [userId])).rows[0].n, 1);
  });
  await t.test("barber account va profile bitta transactionda yaratiladi", async () => {
    const userId = await create("barber", 2, "barber", "stylist");
    assert.equal((await pool.query("SELECT specialty FROM barbers WHERE user_id=$1", [userId])).rows[0].specialty, "stylist");
  });
  await t.test("profilesiz user COMMIT qilinmaydi", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash','customer')", [phone(3)]);
      await assert.rejects(client.query("COMMIT"), { code: "23514" });
      await client.query("ROLLBACK");
    } finally { client.release(); }
  });
  await t.test("noto'g'ri role profile va ikkala profile bir accountga rad etiladi", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const u = await client.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash','customer') RETURNING id", [phone(4)]);
      await assert.rejects(client.query("INSERT INTO barbers(user_id,first_name,last_name,specialty) VALUES($1,'F','L','barber')", [u.rows[0].id]), { code: "23503" });
      await client.query("ROLLBACK");
    } finally { client.release(); }
    const customerId = await create("customer", 5);
    await assert.rejects(pool.query("INSERT INTO barbers(user_id,first_name,last_name,specialty) VALUES($1,'F','L','barber')", [customerId]), { code: "23503" });
    const barberId = await create("barber", 13);
    await assert.rejects(pool.query("INSERT INTO customers(user_id,first_name,last_name) VALUES($1,'F','L')", [barberId]), { code: "23503" });
  });
  await t.test("profile alohida o'chirilsa COMMIT rad etiladi", async () => {
    const userId = await create("customer", 6);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM customers WHERE user_id=$1", [userId]);
      await assert.rejects(client.query("COMMIT"), { code: "23514" });
      await client.query("ROLLBACK");
    } finally { client.release(); }
  });
  await t.test("users.role UPDATE rad etiladi", async () => {
    const userId = await create("customer", 7);
    await assert.rejects(pool.query("UPDATE users SET role='barber' WHERE id=$1", [userId]), { code: "23514" });
  });
  await t.test("NULL, blank va Unicode White_Space ismlar rad etiladi", async () => {
    const invalidNames = [[null, "Last"], ["First", null], ["", "Last"], ["First", ""],
      ["\u00a0\u2003\ufeff", "Last"], ["First", "\u00a0\u2003\ufeff"]];
    let n = 40;
    for (const role of ["customer", "barber"]) for (const [first, last] of invalidNames) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const user = await client.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash',$2) RETURNING id", [phone(n++), role]);
        const table = role === "customer" ? "customers" : "barbers";
        const columns = `user_id,first_name,last_name${role === "barber" ? ",specialty" : ""}`;
        const values = role === "barber" ? "$1,$2,$3,'barber'" : "$1,$2,$3";
        await assert.rejects(client.query(`INSERT INTO ${table}(${columns}) VALUES(${values})`, [user.rows[0].id, first, last]),
          { code: first === null || last === null ? "23502" : "23514" });
        await client.query("ROLLBACK");
      } finally { client.release(); }
    }
  });
  await t.test("noto'g'ri specialty rad etiladi", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash','barber') RETURNING id", [phone(11)]);
      await assert.rejects(client.query("INSERT INTO barbers(user_id,first_name,last_name,specialty) VALUES($1,'F','L','nail-tech')", [user.rows[0].id]), { code: "23514" });
      await client.query("ROLLBACK");
    } finally { client.release(); }
    const barberId = await create("barber", 14);
    await assert.rejects(pool.query("UPDATE barbers SET specialty=NULL WHERE user_id=$1", [barberId]), { code: "23502" });
  });

  await t.test("profile user_id transfer COMMIT old va new accountning yakuniy holatini tekshiradi", async () => {
    const oldUser = await create("customer", 25), newUser = await create("customer", 26);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM customers WHERE user_id=$1", [newUser]);
      await client.query("UPDATE customers SET user_id=$2 WHERE user_id=$1", [oldUser, newUser]);
      await client.query("INSERT INTO customers(user_id,first_name,last_name) VALUES($1,'Replacement','Old')", [oldUser]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE user_id=$1", [oldUser])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE user_id=$1", [newUser])).rows[0].n, 1);
  });
  await t.test("parallel profile insertlar parent user lock orqali seriallanadi", async () => {
    const first = await pool.connect(), second = await pool.connect();
    try {
      await first.query("BEGIN");
      const user = await first.query("INSERT INTO users(phone,password,role) VALUES($1,'test-hash','customer') RETURNING id", [phone(27)]);
      const userId = user.rows[0].id;
      await first.query("INSERT INTO customers(user_id,first_name,last_name) VALUES($1,'First','Last12')", [userId]);
      await second.query("BEGIN");
      const rejected = second.query("INSERT INTO barbers(user_id,first_name,last_name,specialty) VALUES($1,'F','L','barber')", [userId]);
      await first.query("COMMIT");
      await assert.rejects(rejected, { code: "23503" });
      await second.query("ROLLBACK");
    } finally { first.release(); second.release(); }
  });
});
