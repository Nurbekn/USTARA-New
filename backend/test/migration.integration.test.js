const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Client, Pool } = require("pg");
const bcrypt = require("bcrypt");
const fs = require("node:fs");
const path = require("node:path");
const { assertTestIdentity, dropOwnedSchema, testTarget } = require("./helpers/testDatabaseTarget");

const databaseUrl = process.env.USTARA_TEST_DATABASE_URL;

test("unified account migration va rollback PostgreSQL integratsiyasi", { skip: !databaseUrl }, async (t) => {
  const target = testTarget(databaseUrl);

  const owner = new Pool({ connectionString: databaseUrl, ssl: false });
  const schema = `migration_test_${process.pid}_${Date.now()}`;
  let schemaCreated = false;
  let client;
  t.after(async () => {
    if (global.apiServer) await new Promise((resolve) => global.apiServer.close(resolve));
    const apiPool = require.cache[require.resolve("../db")]?.exports;
    if (apiPool) await apiPool.end();
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve cleanup after an aborted test transaction. */ }
      await client.end();
    }
    try { await dropOwnedSchema(owner, target, schema, schemaCreated); }
    finally { await owner.end(); }
    delete process.env.USTARA_TEST_SEARCH_PATH;
  });
  await assertTestIdentity(owner, target);
  await owner.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  client = new Client({ connectionString: databaseUrl, ssl: false, options: `-c search_path=${schema}` });
  await client.connect();
  await assertTestIdentity(client, target);
  const migration = fs.readFileSync(path.join(__dirname, "../database/migrations/20261113_unified_accounts.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(__dirname, "../database/migrations/20261113_unified_accounts_rollback.sql"), "utf8");

  async function createLegacySchema() {
    await client.query(`
      CREATE TABLE users (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK(role IN ('customer','barber')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE customers (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        phone VARCHAR(20) NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE barbers (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        phone VARCHAR(20) NOT NULL UNIQUE,
        password TEXT NOT NULL,
        verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE services (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        barber_id INTEGER NOT NULL REFERENCES barbers(id),
        name TEXT NOT NULL
      );
      CREATE TABLE barber_working_hours (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        barber_id INTEGER NOT NULL REFERENCES barbers(id),
        day_of_week INTEGER NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        UNIQUE(barber_id,day_of_week)
      );
      CREATE TABLE bookings (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        barber_id INTEGER NOT NULL REFERENCES barbers(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        status TEXT NOT NULL
      );`);
  }

  async function resetSchema() {
    await client.query("DROP TABLE IF EXISTS bookings,barber_working_hours,services,customers,barbers,users CASCADE");
    await client.query("DROP TABLE IF EXISTS ustara_schema_migrations CASCADE");
  }

  await t.test("birinchi migration bcrypt hash va profil IDlarini saqlaydi; ikkinchi ishga tushirish xavfsiz", async () => {
    await createLegacySchema();
    const customerHash = await bcrypt.hash("legacy-customer-password", 10);
    const barberHash = await bcrypt.hash("legacy-barber-password", 10);
    await client.query("INSERT INTO customers(id,name,phone,password) OVERRIDING SYSTEM VALUE VALUES(31,'Old customer','+998911110031',$1)", [customerHash]);
    await client.query("INSERT INTO barbers(id,name,phone,password) OVERRIDING SYSTEM VALUE VALUES(47,'Old barber','+998911110047',$1)", [barberHash]);
    const service = await client.query("INSERT INTO services(barber_id,name) VALUES(47,'Old service') RETURNING id");
    await client.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES(47,2,'09:00','18:00')");
    await client.query("INSERT INTO bookings(customer_id,barber_id,service_id,status) VALUES(31,47,$1,'pending')", [service.rows[0].id]);
    await client.query(migration);

    const mapped = await client.query(`
      SELECT c.id profile_id,u.phone,u.password,u.role
      FROM customers c JOIN users u ON u.id=c.user_id
      WHERE c.id=31
      UNION ALL
      SELECT b.id,u.phone,u.password,u.role
      FROM barbers b JOIN users u ON u.id=b.user_id
      WHERE b.id=47`);
    assert.deepEqual(mapped.rows.map(({ profile_id, phone, password, role }) => ({ profile_id, phone, password, role })), [
      { profile_id: 31, phone: "+998911110031", password: customerHash, role: "customer" },
      { profile_id: 47, phone: "+998911110047", password: barberHash, role: "barber" },
    ]);
    assert.equal((await client.query("SELECT version FROM ustara_schema_migrations")).rows[0].version, "20261113_unified_accounts");

    // Historical predecessor schema: only credential preservation is tested here.
    // Modern HTTP login is tested after OTP + split-profile-name migrations.
    assert.equal(await bcrypt.compare("legacy-customer-password", customerHash), true);
    assert.equal(await bcrypt.compare("legacy-barber-password", barberHash), true);

    await client.query(migration);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 2);
    assert.equal((await client.query("SELECT id FROM customers")).rows[0].id, 31);
    assert.equal((await client.query("SELECT id FROM barbers")).rows[0].id, 47);
    assert.deepEqual((await client.query("SELECT customer_id,barber_id,service_id FROM bookings")).rows[0], {
      customer_id: 31, barber_id: 47, service_id: service.rows[0].id,
    });
    assert.equal((await client.query("SELECT barber_id FROM services")).rows[0].barber_id, 47);
    assert.equal((await client.query("SELECT barber_id FROM barber_working_hours")).rows[0].barber_id, 47);
    await client.query(rollback);
    assert.deepEqual((await client.query("SELECT customer_id,barber_id,service_id FROM bookings")).rows[0], {
      customer_id: 31, barber_id: 47, service_id: service.rows[0].id,
    });
    assert.equal((await client.query("SELECT barber_id FROM services")).rows[0].barber_id, 47);
  });

  await t.test("takroriy customer/barber telefonida migration to'liq rollback bo'ladi", async () => {
    await resetSchema();
    await createLegacySchema();
    await client.query("INSERT INTO customers(name,phone,password) VALUES('Customer duplicate','+998922220022','hash-customer')");
    await client.query("INSERT INTO barbers(name,phone,password) VALUES('Barber duplicate','+998922220022','hash-barber')");
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='customers' AND column_name='user_id'")).rows[0].n, 0);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 0);
    assert.equal((await client.query("SELECT to_regclass('ustara_schema_migrations') AS name")).rows[0].name, null);
  });

  await t.test("mavjud account paroli profildan farq qilsa migration xatosi rollback qiladi", async () => {
    await resetSchema();
    await createLegacySchema();
    await client.query("INSERT INTO customers(id,name,phone,password) OVERRIDING SYSTEM VALUE VALUES(12,'Hash mismatch','+998933330033','old-hash')");
    await client.query("INSERT INTO users(phone,password,role) VALUES('+998933330033','different-hash','customer')");
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT password FROM customers WHERE id=12")).rows[0].password, "old-hash");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='customers' AND column_name='user_id'")).rows[0].n, 0);
  });

  await t.test("role ziddiyati mavjud accountni yoki profil yozuvini o'zgartirmaydi", async () => {
    await resetSchema();
    await createLegacySchema();
    await client.query("INSERT INTO customers(name,phone,password) VALUES('Wrong role','+998955550055','same-hash')");
    await client.query("INSERT INTO users(phone,password,role) VALUES('+998955550055','same-hash','barber')");
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT role FROM users WHERE phone='+998955550055'")).rows[0].role, "barber");
    assert.equal((await client.query("SELECT password FROM customers WHERE phone='+998955550055'")).rows[0].password, "same-hash");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='customers' AND column_name='user_id'")).rows[0].n, 0);
  });

  await t.test("qisman oldindan qo'shilgan user_id va account yozuvini xavfsiz yakunlaydi", async () => {
    await resetSchema();
    await createLegacySchema();
    const hash = await bcrypt.hash("partially-migrated-password", 10);
    await client.query("ALTER TABLE customers ADD COLUMN user_id INTEGER");
    await client.query("ALTER TABLE barbers ADD COLUMN user_id INTEGER");
    await client.query("INSERT INTO customers(id,name,phone,password) OVERRIDING SYSTEM VALUE VALUES(83,'Partial mapping','+998966660083',$1)", [hash]);
    await client.query("INSERT INTO users(phone,password,role) VALUES('+998966660083',$1,'customer')", [hash]);
    await client.query(migration);
    const linked = await client.query("SELECT c.id,c.user_id,u.phone,u.password FROM customers c JOIN users u ON u.id=c.user_id");
    assert.equal(linked.rows[0].id, 83);
    assert.equal(linked.rows[0].phone, "+998966660083");
    assert.equal(linked.rows[0].password, hash);
    assert.ok(linked.rows[0].user_id > 0);
  });

  await t.test("oldindan bog'langan noto'g'ri user_id ziddiyatida migration rollback qiladi", async () => {
    await resetSchema();
    await createLegacySchema();
    await client.query("ALTER TABLE customers ADD COLUMN user_id INTEGER");
    await client.query("INSERT INTO customers(name,phone,password) VALUES('Wrong link','+998977770077','matching-hash')");
    const account = await client.query("INSERT INTO users(phone,password,role) VALUES('+998977770078','matching-hash','customer') RETURNING id");
    await client.query("UPDATE customers SET user_id=$1", [account.rows[0].id]);
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT phone FROM customers")).rows[0].phone, "+998977770077");
    assert.equal((await client.query("SELECT phone FROM users")).rows[0].phone, "+998977770078");
    assert.equal((await client.query("SELECT to_regclass('ustara_schema_migrations') AS name")).rows[0].name, null);
  });

  await t.test("noto'g'ri nomlangan FKni migration o'zgartirmaydi va to'xtaydi", async () => {
    await resetSchema();
    await createLegacySchema();
    await client.query("ALTER TABLE customers ADD COLUMN user_id INTEGER");
    await client.query("ALTER TABLE customers ADD CONSTRAINT customers_user_id_fkey FOREIGN KEY(user_id) REFERENCES barbers(id)");
    await client.query("INSERT INTO users(id,phone,password,role) OVERRIDING SYSTEM VALUE VALUES(9,'+998988880088','fk-hash','customer')");
    await client.query("INSERT INTO barbers(id,name,phone,password) OVERRIDING SYSTEM VALUE VALUES(9,'Wrong FK target','+998988880089','other-hash')");
    await client.query("INSERT INTO customers(name,phone,password,user_id) VALUES('FK conflict','+998988880088','fk-hash',9)");
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    const foreignTarget = await client.query(`
      SELECT confrelid::regclass::text AS target FROM pg_constraint
      WHERE conname='customers_user_id_fkey' AND conrelid='customers'::regclass`);
    assert.equal(foreignTarget.rows[0].target, "barbers");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 1);
  });

  await t.test("noto'g'ri nomlangan UNIQUE indeks migrationni to'xtatadi", async () => {
    await resetSchema();
    await createLegacySchema();
    await client.query("ALTER TABLE customers ADD COLUMN user_id INTEGER");
    await client.query("ALTER TABLE barbers ADD COLUMN user_id INTEGER");
    await client.query("CREATE UNIQUE INDEX customers_user_id_unique ON customers(id)");
    await client.query("INSERT INTO customers(name,phone,password) VALUES('Bad index','+998989990099','index-hash')");
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    const definition = await client.query("SELECT pg_get_indexdef('customers_user_id_unique'::regclass) AS value");
    assert.match(definition.rows[0].value, /\(id\)/);
    assert.equal((await client.query("SELECT to_regclass('ustara_schema_migrations') AS name")).rows[0].name, null);

    await resetSchema();
    await createLegacySchema();
    await client.query("CREATE UNIQUE INDEX users_phone_unique ON users(id)");
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    const userIndex = await client.query("SELECT pg_get_indexdef('users_phone_unique'::regclass) AS value");
    assert.match(userIndex.rows[0].value, /\(id\)/);
  });

  await t.test("users.phone yagonaligi yo'q eski jadvalga to'g'ri UNIQUE indeks qo'shadi", async () => {
    await resetSchema();
    await createLegacySchema();
    await client.query("ALTER TABLE users DROP CONSTRAINT users_phone_key");
    await client.query("INSERT INTO customers(name,phone,password) VALUES('No users index','+998999990099','index-hash')");
    await client.query(migration);
    const uniquePhone = await client.query(`
      SELECT i.indisunique, a.attname
      FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
      WHERE i.indrelid='users'::regclass AND i.indnkeyatts=1 AND i.indnatts=1 AND a.attname='phone'`);
    assert.equal(uniquePhone.rows.some((r) => r.indisunique), true);
  });

  await t.test("credential ustunlarisiz sxemada NOT NULL yo'q bo'lsa migration muvaffaqiyat deb belgilamaydi", async () => {
    await resetSchema();
    await createLegacySchema();
    await client.query("ALTER TABLE customers ADD COLUMN user_id INTEGER");
    await client.query("ALTER TABLE barbers ADD COLUMN user_id INTEGER");
    await client.query("INSERT INTO users(phone,password,role) VALUES('+998990000001','customer-hash','customer'),('+998990000002','barber-hash','barber')");
    await client.query("INSERT INTO customers(name,phone,password,user_id) OVERRIDING SYSTEM VALUE VALUES('Already unified customer','+998990000001','customer-hash',1)");
    await client.query("INSERT INTO barbers(name,phone,password,user_id,verification_status) OVERRIDING SYSTEM VALUE VALUES('Already unified barber','+998990000002','barber-hash',2,'approved')");
    await client.query("ALTER TABLE customers ALTER COLUMN user_id DROP NOT NULL");
    await client.query("ALTER TABLE barbers ALTER COLUMN user_id DROP NOT NULL");
    await client.query("ALTER TABLE customers ADD CONSTRAINT customers_user_id_fkey FOREIGN KEY(user_id) REFERENCES users(id)");
    await client.query("ALTER TABLE barbers ADD CONSTRAINT barbers_user_id_fkey FOREIGN KEY(user_id) REFERENCES users(id)");
    await client.query("CREATE UNIQUE INDEX customers_user_id_unique ON customers(user_id)");
    await client.query("CREATE UNIQUE INDEX barbers_user_id_unique ON barbers(user_id)");
    await client.query("ALTER TABLE customers DROP COLUMN phone, DROP COLUMN password");
    await client.query("ALTER TABLE barbers DROP COLUMN phone, DROP COLUMN password");
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT to_regclass('ustara_schema_migrations') AS name")).rows[0].name, null);
  });

  await t.test("rollback telefon/hashni user_id orqali qaytaradi va profil IDlarini saqlaydi", async () => {
    await resetSchema();
    await createLegacySchema();
    const customerHash = await bcrypt.hash("rollback-customer-password", 10);
    const barberHash = await bcrypt.hash("rollback-barber-password", 10);
    await client.query("INSERT INTO customers(id,name,phone,password) OVERRIDING SYSTEM VALUE VALUES(61,'Rollback customer','+998944440061',$1)", [customerHash]);
    await client.query("INSERT INTO barbers(id,name,phone,password) OVERRIDING SYSTEM VALUE VALUES(72,'Rollback barber','+998944440072',$1)", [barberHash]);
    await client.query(migration);
    await client.query(rollback);
    const restored = await client.query(`
      SELECT c.id,c.phone,c.password FROM customers c WHERE c.id=61
      UNION ALL
      SELECT b.id,b.phone,b.password FROM barbers b WHERE b.id=72`);
    assert.deepEqual(restored.rows, [
      { id: 61, phone: "+998944440061", password: customerHash },
      { id: 72, phone: "+998944440072", password: barberHash },
    ]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM ustara_schema_migrations WHERE version='20261113_unified_accounts'")).rows[0].n, 0);

    // Old backend registration writes only to profile tables.
    const oldCustomerHash = await bcrypt.hash("old-backend-customer", 10);
    const oldBarberHash = await bcrypt.hash("old-backend-barber", 10);
    await client.query("INSERT INTO customers(name,phone,password) VALUES('Legacy signup customer','+998944440073',$1)", [oldCustomerHash]);
    await client.query("INSERT INTO barbers(name,phone,password) VALUES('Legacy signup barber','+998944440074',$1)", [oldBarberHash]);
    const customerLogin = await client.query("SELECT id,password FROM customers WHERE phone=$1", ["+998944440073"]);
    const barberLogin = await client.query("SELECT id,password FROM barbers WHERE phone=$1", ["+998944440074"]);
    assert.equal(await bcrypt.compare("old-backend-customer", customerLogin.rows[0].password), true);
    assert.equal(await bcrypt.compare("old-backend-barber", barberLogin.rows[0].password), true);
    assert.equal((await client.query("SELECT user_id FROM customers WHERE id=$1", [customerLogin.rows[0].id])).rows[0].user_id, null);
    assert.equal((await client.query("SELECT user_id FROM barbers WHERE id=$1", [barberLogin.rows[0].id])).rows[0].user_id, null);

    await client.query("UPDATE customers SET phone='+998944440075',password='updated-by-old-backend' WHERE id=61");
    await client.query(rollback);
    assert.equal((await client.query("SELECT phone,password FROM customers WHERE id=61")).rows[0].phone, "+998944440075");
    assert.equal((await client.query("SELECT password FROM customers WHERE id=61")).rows[0].password, "updated-by-old-backend");
  });
});
