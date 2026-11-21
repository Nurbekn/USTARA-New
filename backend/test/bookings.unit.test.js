const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validDate, parseBookingTime } = require("../utils/bookingTime");
const M = 60000;
const day = "2030-01-07";
const at = (hhmm, date = day) => new Date(`${date}T${hhmm}:00+05:00`).toISOString();
const active = (row) => ["pending", "confirmed"].includes(row.status);
let current;
const dbPath = require.resolve("../db");
assert.equal(require.cache[dbPath], undefined, "never load real db.js or dotenv");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { query: (...args) => current.query(...args), connect: () => current.connect() } };
// Exercise the real post-COMMIT notifier with a mock transport; never contact
// Telegram or read the bot secret from this test process's environment.
let deliveries = [], deliveryErrors = [], failDelivery = false;
const notifierModule = require("../services/telegramBookingNotifications");
const realNotifier = notifierModule.createBookingNotifier;
notifierModule.createBookingNotifier = (options) => realNotifier({ ...options,
  api: async (method, body) => { if (failDelivery) throw Error("private-token-and-provider-url"); deliveries.push({ method, body }); },
  logger: { error: (...args) => deliveryErrors.push(args) },
});
const { createBookingStatusService } = require("../services/bookingStatusService");
const { createUpdateHandler } = require("../telegram/handler");
const controller = require("../controllers/bookingsController");
const { setWorkingHours, setBookingAcceptance } = require("../controllers/barbersController");

// Models transactions with a mutex; NOT a PostgreSQL lock/concurrency test.
function fixture(bookings = []) {
  deliveries = []; deliveryErrors = []; failDelivery = false;
  let state = { bookings, links: [], canonicalRole: "barber", acceptingBookings: true, services: [{ id: 3, barber_id: 2, duration_minutes: 30 }, { id: 4, barber_id: 2, duration_minutes: 15 }],
    barber: "approved", barberDeactivated: false, hours: Array.from({ length: 7 }, (_, day_of_week) => ({ barber_id: 2, day_of_week, start_time: "09:00:00", end_time: "18:00:00" })) };
  let tail = Promise.resolve(), clock = at("08:00"), nextId = 10;
  const calls = [], rows = (r) => ({ rows: structuredClone(r), rowCount: r.length });
  function query(local, q, args) {
    const [a,b,c,d,e] = args;
    if (q.startsWith("SELECT b.id,b.booking_time,b.duration_minutes,t.chat_id")) {
      const booking = local.bookings.find((r) => r.id === a && r.status === b);
      const link = booking && local.links.find((l) => l.barber_id === booking.barber_id);
      if (!link) return rows([]);
      const service = local.services.find((v) => v.id === booking.service_id);
      return rows([{ ...booking, chat_id: link.chat_id, first_name: "Ali", last_name: "Valiyev", service_name: service.name || "Soch olish" }]);
    }
    if (q.startsWith("SELECT t.barber_id FROM barber_telegram_links")) {
      assert.ok(q.includes("u.role='barber'")); return rows(local.links.filter((l) => l.chat_id === a));
    }
    if (q.startsWith("SELECT barber_id FROM barber_telegram_links")) {
      assert.ok(q.includes("FOR SHARE")); return rows(local.links.filter((l) => l.barber_id === a && l.chat_id === b));
    }
    if (q.startsWith("SET LOCAL")) return rows([]);
    if (q.startsWith("SELECT to_regclass('booking_services')")) return rows([{ ready: false }]);
    if (q.startsWith("SELECT user_id FROM customers")) return a === 1 ? rows([{ user_id: 11 }]) : rows([]);
    if (q.startsWith("SELECT id FROM users WHERE id=$1 AND role='customer'")) return a === 11 ? rows([{ id: 11 }]) : rows([]);
    if (q.startsWith("SELECT clock_timestamp")) return rows([{ now: clock }]);
    if (q.startsWith("UPDATE barbers SET accepting_bookings=")) {
      if (b !== 2) return rows([]);
      local.acceptingBookings = a;
      return rows([{ accepting_bookings: local.acceptingBookings }]);
    }
    if (q.startsWith("SELECT user_id FROM barbers WHERE id=$1")) return rows(a === 2 ? [{ user_id: 22 }] : []);
    if (q.startsWith("SELECT id FROM users WHERE id=$1 AND deactivated_at IS NULL"))
      return rows(a === 22 && !local.barberDeactivated ? [{ id: 22 }] : []);
    if (q.includes("FROM barbers")) return rows(a === 2 && (!q.includes("JOIN users") || local.canonicalRole === "barber")
      ? [{ id: 2, verification_status: local.barber, accepting_bookings: local.acceptingBookings, now: clock }] : []);
    if (q.includes("FROM services")) return rows(local.services.filter((s) => s.id === a && s.barber_id === b));
    if ((q.startsWith("SELECT (") || q.startsWith("SELECT start_time") || q.startsWith("SELECT s.start_time")) && q.includes("FROM ustara_effective_day_schedule")) {
      const date = b.length === 10 ? b : new Date(Date.parse(b) + 5 * 60 * M).toISOString().slice(0, 10);
      const dow = new Date(date + "T00:00:00Z").getUTCDay();
      const hours = local.hours.find((h) => h.barber_id === a && h.day_of_week === dow);
      if (!hours) return rows([]);
      if (q.includes(" AS fits")) {
        const start = Date.parse(at(hours.start_time.slice(0, 5), date));
        const end = Date.parse(at(hours.end_time.slice(0, 5), date));
        return rows([{ fits: Date.parse(b) >= start && Date.parse(b) + c * M <= end }]);
      }
      return rows([{ ...hours, now_minutes: (Date.parse(clock) - Date.parse(at("00:00", date))) / M }]);
    }
    if (q.startsWith("SELECT") && q.includes(" AS start_minutes")) {
      assert.ok(q.includes("status IN ('pending','confirmed')"));
      assert.ok(q.includes("duration_minutes")); assert.ok(!q.includes("JOIN services"));
      assert.ok(q.includes("::timestamp AT TIME ZONE 'Asia/Tashkent'"));
      const midnight = Date.parse(at("00:00", b));
      return rows(local.bookings.filter((r) => r.barber_id === a && active(r)
        && Date.parse(r.booking_time) < midnight + 1440 * M && Date.parse(r.booking_time) + r.duration_minutes * M > midnight)
        .map((r) => ({ start_minutes: (Date.parse(r.booking_time) - midnight) / M,
          end_minutes: (Date.parse(r.booking_time) + r.duration_minutes * M - midnight) / M })));
    }
    if (q.startsWith('SELECT b.id FROM bookings b') && q.includes('ustara_effective_day_schedule')) {
      // Return only existing active bookings that would no longer fit the
      // newly saved weekly schedule. Overrides are covered by separate tests.
      const conflicts = local.bookings.filter(r => r.barber_id === a && active(r) &&
        Date.parse(r.booking_time) + r.duration_minutes * M > Date.parse(clock))
        .filter(r => {
          const start = new Date(Date.parse(r.booking_time) + 5 * 60 * M);
          const date = start.toISOString().slice(0,10);
          if (b && !b.includes(date)) return false;
          const dow = new Date(date+'T00:00:00Z').getUTCDay();
          const h = local.hours.find(h => h.barber_id === a && h.day_of_week === dow);
          return !h || r.booking_time < at(h.start_time.slice(0,5),date)
            || Date.parse(r.booking_time)+r.duration_minutes*M > Date.parse(at(h.end_time.slice(0,5),date));
        });
      return rows(conflicts.slice(0,1).map(r => ({ id:r.id })));
    }
    if (q.startsWith("SELECT id,booking_time")) {
      assert.ok(q.includes("status IN ('pending','confirmed')")); assert.ok(!q.includes("JOIN services"));
      return rows(local.bookings.filter((r) => r.barber_id === a && active(r)
        && Date.parse(r.booking_time) < Date.parse(c) && Date.parse(r.booking_time) + r.duration_minutes * M > Date.parse(b))
        .map((r) => ({ ...r, booking_end: new Date(Date.parse(r.booking_time) + r.duration_minutes * M).toISOString() })));
    }
    if (q.startsWith("SELECT id FROM bookings WHERE customer_id=$1")) {
      return rows(local.bookings.filter((r) => r.customer_id === a && active(r)
        && Date.parse(r.booking_time) < Date.parse(c)
        && Date.parse(r.booking_time) + r.duration_minutes * M > Date.parse(b)));
    }
    if (q.startsWith("INSERT INTO bookings")) {
      assert.ok(q.includes("duration_minutes"));
      const row = { id: nextId++, customer_id: a, barber_id: b, service_id: c, booking_time: d, duration_minutes: e, status: "confirmed" };
      local.bookings.push(row); return rows([row]);
    }
    if (q.startsWith("SELECT barber_id FROM bookings") || q.startsWith("SELECT bookings.id")) {
      if (q.startsWith("SELECT bookings.id")) { assert.ok(q.includes("FOR UPDATE OF bookings")); assert.ok(!q.includes("JOIN services")); }
      const owner = q.includes('AND bookings.barber_id=$2') || q.includes('AND barber_id=$2') ? 'barber_id' : 'customer_id';
      return rows(local.bookings.filter((r) => r.id === a && r[owner] === b));
    }
    if (q.startsWith("UPDATE bookings SET status =")) {
      const owner = q.includes("customer_id") ? "customer_id" : "barber_id";
      const row = local.bookings.find((r) => r.id === b && r[owner] === c && r.status === d);
      if (!row) return rows([]); row.status = a; return rows([row]);
    }
    if (q.startsWith("DELETE FROM barber_working_hours")) { local.hours = local.hours.filter((h) => h.barber_id !== a); return rows([]); }
    if (q.startsWith("INSERT INTO barber_working_hours")) { local.hours.push({ barber_id: a, day_of_week: b, start_time: c, end_time: d }); return rows([]); }
    throw Error("Unsupported booking mock SQL");
  }
  const pool = { calls, fault: null, afterLock: null, get state() { return state; }, clock(v) { clock = v; },
    async query(sql, args = []) { const q = sql.replace(/\s+/g, " ").trim(); calls.push(q); return query(state, q, args); },
    async connect() {
      let local, unlock, began = false, ended = false;
      return { release() { assert.ok(!began || ended); }, async query(sql, args = []) {
        const q = sql.replace(/\s+/g, " ").trim(); calls.push(q);
        if (pool.fault && q.includes(pool.fault)) { pool.fault = null; throw Error("injected storage failure"); }
        if (q.startsWith("BEGIN")) { const before = tail; tail = new Promise((r) => { unlock = r; }); await before;
          local = structuredClone(state); began = true; return rows([]); }
        if (q === "COMMIT" || q === "ROLLBACK") { if (q === "COMMIT") state = local; ended = true; unlock(); return rows([]); }
        assert.ok(began);
        if (q.includes("pg_advisory_xact_lock")) { assert.ok(Number.isInteger(args[0]) && args[0] > 0); if (pool.afterLock) pool.afterLock(local); return rows([]); }
        return query(local, q, args);
      } };
    },
  }; current = pool; return pool;
}
const existing = (status = "pending", extra = {}) => ({ id: 1, customer_id: 1, barber_id: 2, service_id: 3,
  booking_time: at("10:00"), duration_minutes: 30, status, ...extra });
async function call(action, overrides = {}) {
  const req = { user: { role: "customer", accountId: 11, profileId: 1 }, params: { id: "1" },
    query: { barber_id: "2", service_id: "3", date: day },
    body: { barber_id: 2, service_id: 3, booking_time: at("10:00") }, ...overrides };
  const res = { statusCode: 200, status(v) { this.statusCode = v; return this; }, json(value) { this.body = value; return this; } };
  await action(req, res); return res;
}

test("calendar and explicit time-zone validation never depend on the Node local zone", () => {
  assert.equal(validDate("2030-02-30"), false); assert.equal(validDate("2032-02-29"), true);
  assert.equal(parseBookingTime("2030-01-07T10:00:00+05:00"), parseBookingTime("2030-01-07T05:00:00Z"));
  for (const value of ["2030-02-30T10:00Z", "2030-01-07T10:00", "2030-01-07", null, "2030-01-07T25:00Z"]) assert.ok(Number.isNaN(parseBookingTime(value)));
});

test("only pending and confirmed occupy slots; other final statuses release them", async () => {
  for (const status of ["pending", "confirmed", "completed", "cancelled", "rejected"]) {
    const f = fixture([existing(status)]); const result = await call(controller.getAvailableSlots);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.slots.some((r) => r.start === "10:00"), !["pending", "confirmed"].includes(status));
    assert.ok(result.body.slots.some((r) => r.start === "10:30"), "touching endpoints do not overlap");
    assert.equal(f.calls.at(-1), "ROLLBACK", "read-only snapshot is closed");
  }
});

test('anonymous availability shows open slots without exposing booked intervals or customers', async () => {
  fixture([existing('confirmed')]);
  const result = await call(controller.getAvailableSlots, { user: undefined });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.slots.some(slot => slot.start === '10:00'), false);
  assert.equal('busy' in result.body, false);
  assert.equal('customer_id' in result.body, false);
});

test('logged-in customer and unrelated barber cannot reveal occupancy, owner may', async () => {
  fixture([existing('confirmed')]);
  for (const user of [
    {role:'customer',profileId:1,accountId:11},
    {role:'barber',profileId:99},
    {role:'admin',profileId:1},
    undefined,
  ]) {
    const result=await call(controller.getAvailableSlots,{user});
    assert.equal(result.statusCode,200);
    assert.equal('busy' in result.body,false,JSON.stringify(user));
    assert.equal(result.body.slots.some(slot=>slot.start==='10:00'),false);
  }
  const own=await call(controller.getAvailableSlots,{user:{role:'barber',profileId:2}});
  assert.equal(own.statusCode,200);
  assert.deepEqual(own.body.busy[0],{start:'10:00',end:'10:30'});
});

test("duration comes from selected service and is snapshotted; later service changes never extend old booking", async () => {
  const f = fixture(); const created = await call(controller.createBooking, { body: { barber_id: 2, service_id: 3, booking_time: at("10:00"), duration_minutes: 1 } });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body)); assert.equal(created.body.data.duration_minutes, 30);
  f.state.services[0].duration_minutes = 90;
  const result = await call(controller.getAvailableSlots, { query: { barber_id: "2", service_id: "4", date: day } });
  assert.equal(result.body.duration, 15); assert.ok(result.body.slots.some((s) => s.start === "10:30"));
  assert.equal(f.state.bookings[0].duration_minutes, 30);
  const adjacent = await call(controller.createBooking, { body: { barber_id: 2, service_id: 4, booking_time: at("10:30") } });
  assert.equal(adjacent.statusCode, 201);
});

test("work boundaries, full service length, days off, past dates and cross-midnight intervals", async () => {
  const f = fixture();
  let result = await call(controller.getAvailableSlots);
  assert.deepEqual(result.body.slots.at(-1), { start: "17:30", end: "18:00" });
  f.clock(at("10:00")); result = await call(controller.getAvailableSlots);
  assert.equal(result.body.slots[0].start, "10:05");
  assert.equal((await call(controller.createBooking, { body: { barber_id: 2, service_id: 3, booking_time: at("17:45") } })).statusCode, 400);
  assert.equal((await call(controller.createBooking, { body: { barber_id: 2, service_id: 3, booking_time: at("09:00") } })).statusCode, 400);
  f.state.hours = []; result = await call(controller.getAvailableSlots);
  assert.equal(result.body.working, false); assert.deepEqual(result.body.slots, []);
  const overnight = fixture([existing("pending", { booking_time: at("23:30", "2030-01-06"), duration_minutes: 600 })]);
  result = await call(controller.getAvailableSlots);
  assert.equal(result.body.slots.some((s) => s.start === "09:00"), false);
  assert.ok(result.body.slots.some((s) => s.start === "09:30"));
  assert.equal('busy' in result.body, false, 'customer cannot inspect other customers booking blocks');
  const ownerView = await call(controller.getAvailableSlots, {user:{role:'barber',profileId:2}});
  assert.deepEqual(ownerView.body.busy[0], { start: "00:00", end: "09:30" });
  assert.equal(overnight.state.bookings.length, 1);
});

test("creation rechecks service ownership, barber approval, permissions and the clock after waiting", async () => {
  const f = fixture();
  assert.equal((await call(controller.createBooking, { user: { role: "barber", profileId: 2 } })).statusCode, 403);
  assert.equal((await call(controller.createBooking, { body: { barber_id: 2, service_id: 999, booking_time: at("10:00") } })).statusCode, 404);
  f.state.barber = "pending"; assert.equal((await call(controller.createBooking)).statusCode, 403); f.state.barber = "approved";
  f.afterLock = () => f.clock(at("10:01")); assert.equal((await call(controller.createBooking)).statusCode, 400);
  assert.equal(f.state.bookings.length, 0);
  assert.equal((await call(controller.getAvailableSlots, { query: { barber_id: "2", service_id: "3", date: "2030-02-30" } })).statusCode, 400);
});

test("parallel same-instant creates have one winner under modeled serialization; overlap and rollback are enforced", async () => {
  const f = fixture();
  const results = await Promise.all([call(controller.createBooking), call(controller.createBooking, { body: { barber_id: 2, service_id: 3, booking_time: "2030-01-07T10:00:00+05:00" } })]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409]); assert.equal(f.state.bookings.length, 1);
  const lockedAt = f.calls.findIndex((q) => q.includes("pg_advisory_xact_lock"));
  assert.ok(lockedAt < f.calls.findIndex((q) => q.includes("FROM services")));
  assert.equal((await call(controller.createBooking, { body: { barber_id: 2, service_id: 4, booking_time: at("10:15") } })).statusCode, 409);
  const failed = fixture(); failed.fault = "INSERT INTO bookings";
  assert.equal((await call(controller.createBooking)).statusCode, 500); assert.equal(failed.state.bookings.length, 0);
  assert.ok(failed.calls.includes("ROLLBACK"));
});

test("barber confirms/rejects own pending bookings; customers only cancel; terminal states cannot reactivate", async () => {
  let f = fixture([existing()]);
  assert.equal((await call(controller.refreshStatus, { body: { status: "rejected" } })).statusCode, 403);
  assert.equal((await call(controller.refreshStatus, { user: { role: "barber", profileId: 99 }, body: { status: "rejected" } })).statusCode, 404);
  assert.equal((await call(controller.refreshStatus, { user: { role: "barber", profileId: 2 }, body: { status: "rejected" } })).statusCode, 200);
  assert.equal(f.state.bookings[0].status, "rejected");
  assert.equal((await call(controller.refreshStatus, { user: { role: "barber", profileId: 2 }, body: { status: "confirmed" } })).statusCode, 400);
  f = fixture([existing()]);
  assert.equal((await call(controller.refreshStatus, { user: { role: "barber", profileId: 2 }, body: { status: "confirmed" } })).statusCode, 200);
  assert.equal(f.state.bookings[0].status, "confirmed");
  assert.equal((await call(controller.refreshStatus, { body: { status: "cancelled" } })).statusCode, 200);
});

test("completion uses stored duration, not edited service duration", async () => {
  const f = fixture([existing("confirmed")]); f.state.services[0].duration_minutes = 120; f.clock(at("10:45"));
  const result = await call(controller.refreshStatus, { user: { role: "barber", profileId: 2 }, body: { status: "completed" } });
  assert.equal(result.statusCode, 200); assert.equal(f.state.bookings[0].status, "completed");
});

test("schedule replacement takes the existing barber advisory lock before changing any day", async () => {
  const f = fixture();
  const result = await call(setWorkingHours, { user: { role: "barber", profileId: 2 },
    body: { working_hours: [{ day_of_week: 1, start_time: "10:00", end_time: "16:00" }] } });
  assert.equal(result.statusCode, 200);
  const lock = f.calls.findIndex((q) => q.includes("pg_advisory_xact_lock"));
  const deletion = f.calls.findIndex((q) => q.startsWith("DELETE FROM barber_working_hours"));
  assert.ok(lock >= 0 && lock < deletion);
});

test("barber booking acceptance defaults on, changes only for its owner and validates boolean input", async () => {
  const f = fixture();
  assert.equal(f.state.acceptingBookings, true);
  const disabled = await call(setBookingAcceptance, {
    user: { role: "barber", profileId: 2 }, body: { accepting_bookings: false },
  });
  assert.equal(disabled.statusCode, 200);
  assert.deepEqual(disabled.body.data, { accepting_bookings: false });
  assert.equal(f.state.acceptingBookings, false);
  assert.ok(f.calls.indexOf("SELECT pg_advisory_xact_lock($1)")
    < f.calls.findIndex((query) => query.startsWith("UPDATE barbers SET accepting_bookings=")));

  const customer = await call(setBookingAcceptance, {
    body: { accepting_bookings: true },
  });
  assert.equal(customer.statusCode, 403);
  const otherBarber = await call(setBookingAcceptance, {
    user: { role: "barber", profileId: 99 }, body: { accepting_bookings: true },
  });
  assert.equal(otherBarber.statusCode, 404);
  const invalid = await call(setBookingAcceptance, {
    user: { role: "barber", profileId: 2 }, body: { accepting_bookings: "false" },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(f.state.acceptingBookings, false);
});

test("paused barber has no open slots and cannot receive new bookings; existing bookings remain unchanged", async () => {
  const pending = existing("pending");
  const confirmed = existing("confirmed", { id: 2, booking_time: at("12:00") });
  const f = fixture([pending, confirmed]);
  f.state.acceptingBookings = false;

  const availability = await call(controller.getAvailableSlots);
  assert.equal(availability.statusCode, 200);
  assert.deepEqual(availability.body.slots, []);
  assert.deepEqual(availability.body.recommendedSlots, []);
  assert.equal(availability.body.accepting_bookings, false);

  const booking = await call(controller.createBooking);
  assert.equal(booking.statusCode, 409);
  assert.equal(booking.body.code, "bookings_paused");
  assert.equal(f.state.bookings.length, 2);
  assert.deepEqual(f.state.bookings.map((row) => row.status), ["pending", "confirmed"]);

  const enabled = await call(setBookingAcceptance, {
    user: { role: "barber", profileId: 2 }, body: { accepting_bookings: true },
  });
  assert.equal(enabled.statusCode, 200);
  assert.equal(f.state.acceptingBookings, true);
  f.state.bookings = [];
  assert.equal((await call(controller.createBooking)).statusCode, 201);
});

test("acceptance OFF and booking creation serialize on the existing barber advisory lock", async () => {
  const f = fixture();
  const [closed, created] = await Promise.all([
    call(setBookingAcceptance, {
      user: { role: "barber", profileId: 2 }, body: { accepting_bookings: false },
    }),
    call(controller.createBooking),
  ]);
  assert.equal(closed.statusCode, 200);
  assert.equal(created.statusCode, 409);
  const locks = f.calls.map((query, index) => query.includes("pg_advisory_xact_lock") ? index : -1).filter((index) => index >= 0);
  const update = f.calls.findIndex((query) => query.startsWith("UPDATE barbers SET accepting_bookings="));
  const pausedCheck = f.calls.findIndex((query) => query.includes("SELECT verification_status,accepting_bookings,cancellation_cutoff_minutes,cancellation_policy_text,clock_timestamp()"));
  assert.equal(locks.length, 2);
  assert.ok(locks[0] < update && update < locks[1] && locks[1] < pausedCheck);
  assert.equal(f.state.bookings.length, 0);
});

test("Telegram: auto-confirmed booking notifies barber without approval buttons", async () => {
  const f = fixture(); f.state.links.push({ barber_id: 2, chat_id: "100" });
  const created = await call(controller.createBooking);
  assert.equal(created.statusCode, 201); assert.equal(f.state.bookings.length, 1);
  assert.equal(deliveries.length, 1); const { body } = deliveries[0];
  assert.equal(body.chat_id, "100"); assert.match(body.text, /Ali Valiyev/); assert.match(body.text, /Soch olish/);
  assert.match(body.text, /10:00/); assert.match(body.text, /10:30/); assert.match(body.text, /Asia\/Tashkent/);
  assert.equal(created.body.data.status, 'confirmed');
  assert.equal(body.reply_markup, undefined, 'confirmed bookings do not request extra barber approval');
  assert.ok(f.calls.findIndex((q) => q === "COMMIT") < f.calls.findIndex((q) => q.startsWith("SELECT b.id,b.booking_time")));
});

test("booking locks customer identity before barber advisory, barber row and service row", async () => {
  const f = fixture();
  assert.equal((await call(controller.createBooking)).statusCode, 201);
  const customerLock = f.calls.findIndex((q) => q.startsWith("SELECT user_id FROM customers"));
  const accountLock = f.calls.findIndex((q) => q.startsWith("SELECT id FROM users WHERE id=$1 AND role='customer'"));
  const barberAdvisory = f.calls.findIndex((q) => q.includes("pg_advisory_xact_lock"));
  const barberRow = f.calls.findIndex((q) => q.includes("FROM barbers") && q.includes("FOR SHARE"));
  const serviceRow = f.calls.findIndex((q) => q.includes("FROM services") && q.includes("FOR SHARE"));
  const bookingInsert = f.calls.findIndex((q) => q.startsWith("INSERT INTO bookings"));
  assert.ok(customerLock >= 0 && customerLock < accountLock && accountLock < barberAdvisory);
  assert.ok(barberAdvisory < barberRow && barberRow < serviceRow && serviceRow < bookingInsert);
});

test("Telegram: unlinked barber and API delivery error never undo booking creation", async () => {
  let f = fixture(); let created = await call(controller.createBooking);
  assert.equal(created.statusCode, 201); assert.equal(deliveries.length, 0); assert.equal(f.state.bookings.length, 1);
  f = fixture(); f.state.links.push({ barber_id: 2, chat_id: "100" }); failDelivery = true;
  created = await call(controller.createBooking);
  assert.equal(created.statusCode, 201); assert.equal(f.state.bookings.length, 1); assert.equal(deliveryErrors.length, 1);
  assert.equal(JSON.stringify(deliveryErrors).includes("private-token"), false);
});

function callback(data, extra = {}) {
  return { id: "callback-id", data, from: { id: 100, is_bot: false },
    message: { message_id: 50, chat: { id: 100, type: "private" }, from: { id: 123, is_bot: true } }, ...extra };
}
function bot(f) {
  const responses = [];
  return { responses, handler: createUpdateHandler({ service: {}, username: "ustara_test_bot", botId: 123,
    bookings: createBookingStatusService({ pool: f }), api: async (method, body) => { responses.push({ method, body }); } }) };
}

test("Telegram: own pending booking confirms/rejects through shared service and removes buttons", async () => {
  for (const status of ["confirmed", "rejected"]) {
    const f = fixture([existing()]); f.state.links.push({ barber_id: 2, chat_id: "100" });
    const { handler, responses } = bot(f); await handler({ callback_query: callback(`booking:${status}:1`) });
    assert.equal(f.state.bookings[0].status, status);
    assert.deepEqual(responses.find((r) => r.method === "editMessageReplyMarkup").body.reply_markup, { inline_keyboard: [] });
    assert.equal(responses.at(-1).method, "answerCallbackQuery"); assert.equal(responses.at(-1).body.show_alert, false);
  }
});

test("Telegram: other barber, unlinked chat, missing booking and forged sender cannot review", async () => {
  const f = fixture([existing()]); const { handler, responses } = bot(f);
  await handler({ callback_query: callback("booking:confirmed:1") });
  assert.match(responses.at(-1).body.text, /ruxsat yo‘q/);
  f.state.links.push({ barber_id: 3, chat_id: "100" });
  await handler({ callback_query: callback("booking:confirmed:1") });
  assert.match(responses.at(-1).body.text, /Booking topilmadi/); assert.equal(f.state.bookings[0].status, "pending");
  f.state.links[0].barber_id = 2;
  await handler({ callback_query: callback("booking:confirmed:999") }); assert.match(responses.at(-1).body.text, /Booking topilmadi/);
  const sqlCount = f.calls.length;
  await handler({ callback_query: callback("booking:confirmed:1", { from: { id: 999 } }) });
  assert.equal(f.calls.length, sqlCount); assert.equal(f.state.bookings[0].status, "pending");
  await handler({ callback_query: callback("booking:completed:1") }); assert.equal(f.calls.length, sqlCount);
});

test("Telegram: repeated/parallel conflicting callbacks and website race have one winner in mock serialization", async () => {
  const f = fixture([existing()]); f.state.links.push({ barber_id: 2, chat_id: "100" });
  const { handler, responses } = bot(f);
  await Promise.all(["confirmed", "rejected"].map((status) => handler({ callback_query: callback(`booking:${status}:1`) })));
  const winner = f.state.bookings[0].status; assert.ok(["confirmed", "rejected"].includes(winner));
  assert.equal(responses.filter((r) => r.method === "answerCallbackQuery" && !r.body.show_alert).length, 1);
  assert.ok(responses.some((r) => r.body.text?.includes("allaqachon")));
  await handler({ callback_query: callback("booking:rejected:1") }); assert.equal(f.state.bookings[0].status, winner);
  const fresh = fixture([existing()]); fresh.state.links.push({ barber_id: 2, chat_id: "100" });
  const service = createBookingStatusService({ pool: fresh });
  const outcomes = await Promise.allSettled([
    service.update(1, "confirmed", { role: "barber", profileId: 2 }), service.reviewFromTelegram(1, "rejected", 100),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1); assert.equal(fresh.state.bookings[0].status, "confirmed");
});

test("Telegram: link authorization is rechecked after lock wait and callback failure rolls back", async () => {
  let f = fixture([existing()]); f.state.links.push({ barber_id: 2, chat_id: "100" });
  f.afterLock = (local) => { local.links = []; };
  await assert.rejects(createBookingStatusService({ pool: f }).reviewFromTelegram(1, "confirmed", 100), { code: "forbidden" });
  assert.equal(f.state.bookings[0].status, "pending");
  f = fixture([existing()]); f.state.links.push({ barber_id: 2, chat_id: "100" });
  f.afterLock = (local) => { local.canonicalRole = "customer"; };
  await assert.rejects(createBookingStatusService({ pool: f }).reviewFromTelegram(1, "confirmed", 100), { code: "forbidden" });
  assert.equal(f.state.bookings[0].status, "pending");
  f = fixture([existing()]); f.state.links.push({ barber_id: 2, chat_id: "100" }); f.fault = "UPDATE bookings";
  await assert.rejects(createBookingStatusService({ pool: f }).reviewFromTelegram(1, "confirmed", 100));
  assert.equal(f.state.bookings[0].status, "pending"); assert.ok(f.calls.includes("ROLLBACK"));
});

test("Telegram: failed booking commit sends no message", async () => {
  const f = fixture(); f.state.links.push({ barber_id: 2, chat_id: "100" }); f.fault = "COMMIT";
  assert.equal((await call(controller.createBooking)).statusCode, 500);
  assert.equal(f.state.bookings.length, 0); assert.equal(deliveries.length, 0);
  assert.equal(f.calls.some((q) => q.startsWith("SELECT b.id,b.booking_time")), false);
});

test("Telegram: button-edit failure cannot undo a committed review or leak API errors", async () => {
  const f = fixture([existing()]); f.state.links.push({ barber_id: 2, chat_id: "100" });
  const logs = [], answers = [];
  const handler = createUpdateHandler({ service: {}, username: "ustara_test_bot", botId: 123,
    bookings: createBookingStatusService({ pool: f }), logger: { error: (...args) => logs.push(args) },
    api: async (method, body) => {
      if (method === "editMessageReplyMarkup") throw Error("sensitive-provider-token");
      answers.push(body);
    },
  });
  await handler({ callback_query: callback("booking:confirmed:1") });
  assert.equal(f.state.bookings[0].status, "confirmed"); assert.equal(answers.at(-1).show_alert, false);
  assert.equal(logs.length, 1); assert.equal(JSON.stringify(logs).includes("sensitive"), false);
  await handler({ callback_query: callback("booking:rejected:1") });
  assert.equal(f.state.bookings[0].status, "confirmed"); assert.equal(answers.at(-1).show_alert, true);
});

test('Telegram: cancellation announces the committed status without actionable buttons; delivery failure preserves cancellation', async () => {
  for (const failing of [false, true]) {
    const f = fixture([existing('confirmed')]);
    f.state.links.push({ barber_id: 2, chat_id: '100' });
    failDelivery = failing;
    const result = await call(controller.refreshStatus, { body: { status: 'cancelled' } });
    assert.equal(result.statusCode, 200);
    assert.equal(f.state.bookings[0].status, 'cancelled');
    assert.equal(deliveries.length, failing ? 0 : 1);
    if (!failing) {
      assert.match(deliveries[0].body.text, /bekor qilindi/);
      assert.equal(deliveries[0].body.reply_markup, undefined);
    }
    const repeated = await call(controller.refreshStatus, { body: { status: 'cancelled' } });
    assert.equal(repeated.statusCode, 200);
    assert.equal(repeated.body.data.replayed, true);
    assert.equal(deliveries.length, failing ? 0 : 1);
  }
});


test('decision 169: one customer cannot book overlapping services at different barbers', async () => {
  const f = fixture([{...existing('confirmed'),barber_id:99}]);
  const response = await call(controller.createBooking);
  assert.equal(response.statusCode,409);
  assert.equal(response.body.code,'customer_time_conflict');
  assert.equal(f.state.bookings.length,1);
});

test('request_id collision in a legacy booking always rolls back before pool release', async () => {
  const f = fixture();
  const originalQuery = f.query.bind(f);
  f.query = async (sql, params) => sql.includes("to_regclass('booking_request_keys')")
    ? {rows:[{ready:true}],rowCount:1} : originalQuery(sql,params);
  const originalConnect = f.connect.bind(f);
  let replayAttempted = false;
  f.connect = async () => {
    const client = await originalConnect();
    const originalClientQuery = client.query.bind(client);
    client.query = async (sql,args) => {
      if(sql.includes('SELECT k.fingerprint,b.* FROM booking_request_keys')) {
        replayAttempted = true;
        const {BookingSelectionError}=require('../services/bookingSelection');
        throw new BookingSelectionError(409,'Bu request_id boshqa bron uchun ishlatilgan.','request_id_reused');
      }
      return originalClientQuery(sql,args);
    };
    return client;
  };
  const response = await call(controller.createBooking, {body:{
    barber_id:2,service_id:3,booking_time:at('10:00'),
    request_id:'ab23bc45-1111-4111-8111-1234567890ab',
  }});
  assert.equal(response.statusCode,409);
  assert.equal(response.body.code,'request_id_reused');
  assert.equal(replayAttempted,true);
  assert.ok(f.calls.includes('ROLLBACK'));
  assert.equal(f.state.bookings.length,0);
});


test('new customer exclusion 23P01 from INSERT is a 409 with rollback and no hidden SQL',async()=>{
  const f=fixture();
  const originalConnect=f.connect.bind(f);
  f.connect=async()=>{
    const client=await originalConnect();
    const q=client.query.bind(client);
    client.query=async(sql,args)=>{
      if(sql.includes('INSERT INTO bookings')) throw Object.assign(new Error('private SQL detail'),{
        code:'23P01',constraint:'bookings_customer_time_excl',
      });
      return q(sql,args);
    };
    return client;
  };
  const res=await call(controller.createBooking);
  assert.equal(res.statusCode,409);
  assert.equal(res.body.code,'customer_time_conflict');
  assert.equal(JSON.stringify(res.body).includes('private'),false);
  assert.equal(f.state.bookings.length,0);
  assert.ok(f.calls.includes('ROLLBACK'));
});


test('v16: PUT and legacy DELETE cancel through one idempotent status transition', async () => {
  const f = fixture([existing('confirmed')]);
  f.state.links.push({ barber_id: 2, chat_id: '100' });
  const first = await call(controller.deleteBooking);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.status, 'cancelled');
  assert.equal(f.state.bookings[0].status, 'cancelled');
  assert.equal(deliveries.length, 1);
  const second = await call(controller.refreshStatus, { body: { status: 'cancelled' } });
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.data.replayed, true);
  const third = await call(controller.deleteBooking);
  assert.equal(third.statusCode, 200);
  assert.equal(third.body.data.replayed, true);
  assert.equal(deliveries.length, 1, 'a replay must not deliver a second cancellation');
  assert.equal(f.calls.filter((q) => q.startsWith('UPDATE bookings SET status =')).length, 1);
  assert.ok(f.calls.some((q) => q.includes('pg_advisory_xact_lock')));
});

test('v16: parallel PUT/DELETE cancellation has one writer and one notification', async () => {
  const f = fixture([existing('confirmed')]);
  f.state.links.push({ barber_id: 2, chat_id: '100' });
  const responses = await Promise.all([
    call(controller.deleteBooking),
    call(controller.refreshStatus, { body: { status: 'cancelled' } }),
  ]);
  assert.deepEqual(responses.map((r) => r.statusCode), [200, 200]);
  assert.equal(responses.filter((r) => r.body.data.replayed).length, 1);
  assert.equal(deliveries.length, 1);
  assert.equal(f.calls.filter((q) => q.startsWith('UPDATE bookings SET status =')).length, 1);
});

test('v16: a user may not cancel another customer or a terminal completed booking', async () => {
  let f = fixture([existing('confirmed')]);
  assert.equal((await call(controller.deleteBooking, { user: { role: 'customer', profileId: 999 } })).statusCode, 404);
  assert.equal(f.state.bookings[0].status, 'confirmed');
  f = fixture([existing('completed')]);
  assert.equal((await call(controller.deleteBooking)).statusCode, 400);
  assert.equal(f.state.bookings[0].status, 'completed');
});

test('v16: schedule replacement has finite statement timeout as well as advisory lock', async () => {
  const f = fixture();
  const response = await call(setWorkingHours, {
    user: { role: 'barber', profileId: 2 },
    body: { working_hours: [{ day_of_week: 1, start_time: '09:05', end_time: '17:55' }] },
  });
  assert.equal(response.statusCode, 200);
  assert.ok(f.calls.includes("SET LOCAL statement_timeout='15s'"));
});

test('v16: a committed cancellation stays successful if post-commit details cannot be fetched', async () => {
  const f = fixture([existing('confirmed', { total_price: 50000 })]);
  const original = f.query.bind(f);
  f.query = async (...args) => {
    if (args[0].includes('to_regclass') || args[0].includes('FROM booking_services')) {
      throw Object.assign(new Error('simulated detail read outage'), { code: 'SIMULATED_DETAIL_ERROR' });
    }
    return original(...args);
  };
  const result = await call(controller.refreshStatus, { body: { status: 'cancelled' } });
  assert.equal(result.statusCode, 200);
  assert.equal(f.state.bookings[0].status, 'cancelled');
  assert.equal(result.body.data.snapshot_refresh_required, true);
});

test('v17: stale cancellation policy preview rejects booking before INSERT, with rollback', async () => {
  const f = fixture();
  const result = await call(controller.createBooking, {
    body: { barber_id: 2, service_id: 3, booking_time: at('10:00'),
      expected_cancellation_policy: { cutoff_minutes: 60, text: null } },
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, 'cancellation_policy_changed');
  assert.equal(f.state.bookings.length, 0);
  assert.ok(f.calls.includes('ROLLBACK'));
  assert.equal(f.calls.some(sql => sql.startsWith('INSERT INTO bookings')), false);
  const accepted = await call(controller.createBooking, {
    body: { barber_id: 2, service_id: 3, booking_time: at('10:00'),
      expected_cancellation_policy: { cutoff_minutes: null, text: null } },
  });
  assert.equal(accepted.statusCode, 201);
});

test('v18: weekly schedule cannot remove a future confirmed booking; original hours survive rollback',async()=>{
  const confirmed=existing('confirmed',{id:710,booking_time:at('15:00'),duration_minutes:30});
  const f=fixture([confirmed]);
  const before=structuredClone(f.state.hours);
  const result=await call(setWorkingHours,{
    user:{role:'barber',profileId:2},
    body:{working_hours:[{day_of_week:1,start_time:'09:00',end_time:'14:00'}]},
  });
  assert.equal(result.statusCode,409);
  assert.equal(result.body.code,'existing_booking_conflict');
  assert.deepEqual(f.state.hours,before);
  assert.ok(f.calls.includes('ROLLBACK'));
});
