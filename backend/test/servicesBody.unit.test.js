const { test, after } = require("node:test");
const assert = require("node:assert/strict");

// Controller regression tests with an injected query double: never load db.js or dotenv.
const query = () => { throw new Error("Unexpected database query"); };
const dbPath = require.resolve("../db");
assert.equal(require.cache[dbPath], undefined);
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { query: (...args) => query(...args) } };
const { addService, refreshServiceData, deleteService } = require("../controllers/servicesController");
after(() => { delete require.cache[dbPath]; });

function response() {
  return { statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

function testPool(clientQuery) {
  return { connect: async () => ({ query: clientQuery, release() {} }) };
}

for (const [name, handler] of [["create", addService], ["update", refreshServiceData]]) {
  for (const [label, body] of [["missing", undefined], ["null", null], ["string", "invalid"],
    ["number", 42], ["boolean", false], ["array", []]]) {
    test(`${name}: ${label} body returns 400 invalid_body before any query`, async () => {
      let calls = 0;
      const database = testPool(async () => { calls++; throw new Error("Invalid body must not reach database"); });
      const req = { user: { role: "barber", profileId: 23 }, params: { id: "34" } };
      if (label !== "missing") req.body = body;
      const res = response();
      await handler(req, res, undefined, database);
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { message: "So'rov ma'lumotlari obyekt bo'lishi kerak", code: "invalid_body" });
      assert.equal(calls, 0);
    });
  }

  test(`${name}: transaction follows advisory, barber row and service lock order`, async () => {
    const service = { id: 34, barber_id: 23, name: "Soch olish", price: "50000.00", duration_minutes: 30 };
    const calls = [];
    const database = testPool(async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT id,verification_status FROM barbers/.test(sql)) {
        assert.deepEqual(params, [23]);
        return { rows: [{ id: 23, verification_status: "approved" }], rowCount: 1 };
      }
      if (/INSERT INTO services/.test(sql)) {
        assert.deepEqual(params, ["Soch olish", 50000, 30, 23]);
        return { rows: [service], rowCount: 1 };
      }
      if (/UPDATE services/.test(sql)) {
        assert.match(sql, /WHERE id = \$4 AND barber_id=\$5/);
        assert.deepEqual(params, ["Soch olish", 50000, 30, 34, 23]);
        return { rows: [service], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const res = response();
    await handler({ user: { role: "barber", profileId: 23 }, params: { id: "34" },
      body: { name: " Soch olish ", price: 50000, duration_minutes: 30 } }, res, undefined, database);
    assert.deepEqual(calls.map(({ sql }) => sql), [
      "BEGIN", "SET LOCAL lock_timeout='5s'", "SELECT pg_advisory_xact_lock($1)",
      "SELECT id,verification_status FROM barbers WHERE id=$1 FOR SHARE",
      name === "create"
        ? "INSERT INTO services (name, price, duration_minutes, barber_id)\n       VALUES ($1, $2, $3, $4)\n       RETURNING *"
        : "UPDATE services\n       SET name = $1, price = $2, duration_minutes = $3\n       WHERE id = $4 AND barber_id=$5\n       RETURNING *",
      "COMMIT",
    ]);
    assert.equal(res.statusCode, name === "create" ? 201 : 200);
    assert.deepEqual(res.body, { message: name === "create" ? "Xizmat yaratildi" : "Xizmat ma'lumotlari yangilandi", data: service });
  });
}

test("service delete follows the same barber locks and commits only after delete", async () => {
  const calls = [];
  const database = testPool(async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT id,verification_status FROM barbers/.test(sql)) {
      assert.deepEqual(params, [23]);
      return { rows: [{ id: 23, verification_status: "approved" }], rowCount: 1 };
    }
    if (/DELETE FROM services/.test(sql)) {
      assert.deepEqual(params, [34, 23]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const res = response();
  await deleteService({ user: { role: "barber", profileId: 23 }, params: { id: "34" } }, res, undefined, database);
  assert.deepEqual(calls.map(({ sql }) => sql), [
    "BEGIN", "SET LOCAL lock_timeout='5s'", "SELECT pg_advisory_xact_lock($1)",
    "SELECT id,verification_status FROM barbers WHERE id=$1 FOR SHARE",
    "DELETE FROM services WHERE id = $1 AND barber_id=$2", "COMMIT",
  ]);
  assert.equal(res.statusCode, 200);
});

test("service update rolls back on storage error", async () => {
  const calls = [];
  const database = testPool(async (sql) => {
    calls.push(sql);
    if (/SELECT id,verification_status FROM barbers/.test(sql)) return { rows: [{ id: 23, verification_status: "approved" }], rowCount: 1 };
    if (/UPDATE services/.test(sql)) throw new Error("injected failure");
    return { rows: [], rowCount: 1 };
  });
  const res = response();
  const priorError = console.error;
  console.error = () => {};
  try {
    await refreshServiceData({ user: { role: "barber", profileId: 23 }, params: { id: "34" },
      body: { name: "Name", price: 5, duration_minutes: 30 } }, res, undefined, database);
  } finally { console.error = priorError; }
  assert.equal(res.statusCode, 500);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test('duration faqat 5–60 daqiqa va 5 daqiqalik qadamda qabul qilinadi', async () => {
  for (const duration_minutes of [0,1,4,6,61,65,90]) {
    const res = response();let calls = 0;
    await addService({ user: { role: 'barber', profileId: 23 }, body: { name: 'Soch', price: 10000, duration_minutes } }, res, undefined, testPool(async () => { calls++;throw Error('query'); }));
    assert.equal(res.statusCode,400);assert.equal(calls,0);
  }
  for (const duration_minutes of [5,60]) {
    const res = response();
    await addService({ user: { role: 'barber', profileId: 23 }, body: { name: 'Soch', price: 10000, duration_minutes } }, res, undefined, testPool(async sql => sql.includes('SELECT id,verification_status') ? { rows: [{ id: 23, verification_status: 'approved' }], rowCount:1 } : { rows:[{ id: 1, duration_minutes }], rowCount:1 }));
    assert.equal(res.statusCode,201);
  }
});
