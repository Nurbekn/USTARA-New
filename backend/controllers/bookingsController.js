const { fitsBooking, dayHours, withBreakBusy } = require('../services/calendarSchedule');
const pool = require("../db");
const {isPgConnectionBroken}=require('../utils/pgConnectionHealth');
const { BookingSelectionError, serviceIds, multiSchemaReady, attachBookingServices } = require('../services/bookingSelection');
const { createMultiBooking, multiSlots } = require('../services/multiBooking');
const { createBookingStatusService, BookingStatusError } = require("../services/bookingStatusService");
const { createBookingNotifier } = require("../services/telegramBookingNotifications");
const bookingStatus = createBookingStatusService({ pool });
const notifyBooking = createBookingNotifier({ pool });
const {bookingRequest,fingerprint,replayBooking,saveBookingRequest,requireIdempotencySchema} = require('../services/bookingIdempotency');
const { validDate, parseBookingTime, minutes, timeString } = require("../utils/bookingTime");
const { slotCandidates } = require("../services/slotGrid");
const { notifyAfterCommit } = require("../services/bookingNotificationAfterCommit");
const { bookingDbConflict } = require("../services/bookingDbConflicts");
const { checkExpectedCancellationPolicy } = require("../services/cancellationTerms");
const { modifyCustomerBooking, modificationSlots } = require('../services/bookingModification');
const { recoverBooking } = require('../services/bookingRecovery');

// A GET does not submit or retry a booking. A missing key can still be
// in flight; callers must not infer that a second POST is safe.
async function getBookingRecovery(req,res,_next,database=pool) {
  // Even denial and temporary-failure responses concern a private account.
  res.set('Cache-Control','no-store');
  try {
    const found=await recoverBooking(database,req.user,req.params.requestId);
    return res.status(200).json(found);
  } catch(error) {
    if(error instanceof BookingSelectionError)
      return res.status(error.status).json({message:error.message,code:error.code});
    console.error('Booking recovery lookup failed',{code:error.code||'unknown'});
    return res.status(503).json({message:'Bron holatini tekshirib bo‘lmadi.',code:'recovery_unavailable'});
  }
}

//Barcha bookinglarni olish
async function getBooking(req, res) {
  if (typeof res.set === "function") res.set("Cache-Control", "no-store");
  // A missing or malformed JWT-derived profile ID is not a valid owner scope.
  // Do not run a broad booking SELECT even if the auth middleware changes.
  if (!['customer', 'barber'].includes(req.user?.role))
    return res.status(403).json({message: "Bu amal uchun ruxsat yo'q"});
  if (!Number.isSafeInteger(req.user?.profileId) || req.user.profileId <= 0 || req.user.profileId > 2147483647)
    return res.status(403).json({message: 'Bronlarga kirish uchun profilni qayta tasdiqlang.'});
  try {
    let query;
    let params;

    if (req.user.role === "customer") {
      query = `
        SELECT
          bookings.id,
          bookings.customer_id,
          bookings.barber_id,
          bookings.service_id,
          customers.first_name AS customer_first_name,
          customers.last_name AS customer_last_name,
          barbers.first_name AS barber_first_name,
          barbers.last_name AS barber_last_name,
          barbers.salon_name AS barber_salon_name,
          barbers.address AS barber_address,
          barbers.latitude AS barber_latitude,
          barbers.longitude AS barber_longitude,
          (SELECT u.phone FROM users u WHERE u.id=barbers.user_id AND u.role='barber') AS barber_phone,
          services.name AS service_name,
          bookings.booking_time,
          bookings.duration_minutes,
          bookings.cancellation_cutoff_minutes,bookings.cancellation_policy_text,
          (to_jsonb(bookings)->>'total_price')::numeric AS total_price,
          bookings.booking_time + bookings.duration_minutes * INTERVAL '1 minute' AS booking_end,
          bookings.status,
          (SELECT jsonb_build_object('minutes', ln.minutes_late, 'reportedAt', ln.created_at)
             FROM booking_late_notices ln WHERE ln.booking_id=bookings.id) AS late_notice,
          (SELECT jsonb_build_object('requestedAt', ci.requested_at, 'confirmedAt', ci.confirmed_at)
           FROM booking_checkins ci WHERE ci.booking_id=bookings.id) AS check_in,
          bookings.created_at
        FROM bookings
        JOIN customers ON bookings.customer_id = customers.id
        JOIN barbers ON bookings.barber_id = barbers.id
        LEFT JOIN services ON bookings.service_id = services.id
        WHERE bookings.customer_id = $1
        ORDER BY bookings.id DESC
      `;
      params = [req.user.profileId];
    } else if (req.user.role === "barber") {
      query = `
        SELECT
          bookings.id,
          bookings.customer_id,
          bookings.barber_id,
          bookings.service_id,
          customers.first_name AS customer_first_name,
          (SELECT u.phone FROM users u WHERE u.id=customers.user_id AND u.role='customer') AS customer_phone,
          customers.last_name AS customer_last_name,
          barbers.first_name AS barber_first_name,
          barbers.last_name AS barber_last_name,
          services.name AS service_name,
          bookings.booking_time,
          bookings.duration_minutes,
          bookings.cancellation_cutoff_minutes,bookings.cancellation_policy_text,
          (to_jsonb(bookings)->>'total_price')::numeric AS total_price,
          bookings.booking_time + bookings.duration_minutes * INTERVAL '1 minute' AS booking_end,
          bookings.status,
          (SELECT jsonb_build_object('minutes', ln.minutes_late, 'reportedAt', ln.created_at)
             FROM booking_late_notices ln WHERE ln.booking_id=bookings.id) AS late_notice,
          (SELECT jsonb_build_object('requestedAt', ci.requested_at, 'confirmedAt', ci.confirmed_at)
           FROM booking_checkins ci WHERE ci.booking_id=bookings.id) AS check_in,
          bookings.created_at
        FROM bookings
        JOIN customers ON bookings.customer_id = customers.id
        JOIN barbers ON bookings.barber_id = barbers.id
        LEFT JOIN services ON bookings.service_id = services.id
        WHERE bookings.barber_id = $1
        ORDER BY bookings.id DESC
      `;
      params = [req.user.profileId];
    } else {
      return res.status(403).json({
        message: "Bu amal uchun ruxsat yo'q",
      });
    }
    const result = await pool.query(query, params);
    return res.json(await attachBookingServices(result.rows, pool));
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Bitta bookingni ID orqali olish
async function getBookingById(req, res) {
  if (typeof res.set === "function") res.set("Cache-Control", "no-store");
  if (!['customer','barber','admin'].includes(req.user?.role))
    return res.status(403).json({message: "Bu amal uchun ruxsat yo'q"});
  if (req.user.role !== 'admin' && (!Number.isSafeInteger(req.user.profileId) ||
      req.user.profileId <= 0 || req.user.profileId > 2147483647))
    return res.status(403).json({message: 'Bronlarga kirish uchun profilni qayta tasdiqlang.'});
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }
    let result;
    if (req.user.role === "admin") {
      result = await pool.query(
        `SELECT
        bookings.id,
        bookings.customer_id,
        bookings.barber_id,
        bookings.service_id,
        customers.first_name AS customer_first_name,
          customers.last_name AS customer_last_name,
        barbers.first_name AS barber_first_name,
          barbers.last_name AS barber_last_name,
        services.name AS service_name,
        bookings.booking_time,
        bookings.duration_minutes,
          bookings.cancellation_cutoff_minutes,bookings.cancellation_policy_text,
          (to_jsonb(bookings)->>'total_price')::numeric AS total_price,
        bookings.booking_time + bookings.duration_minutes * INTERVAL '1 minute' AS booking_end,
        bookings.status,
        (SELECT jsonb_build_object('minutes', ln.minutes_late, 'reportedAt', ln.created_at)
         FROM booking_late_notices ln WHERE ln.booking_id=bookings.id) AS late_notice,
          (SELECT jsonb_build_object('requestedAt', ci.requested_at, 'confirmedAt', ci.confirmed_at)
           FROM booking_checkins ci WHERE ci.booking_id=bookings.id) AS check_in,
        bookings.created_at
      FROM bookings
      JOIN customers ON bookings.customer_id=customers.id
      JOIN barbers ON bookings.barber_id=barbers.id
      LEFT JOIN services ON bookings.service_id=services.id
      WHERE bookings.id=$1
      `,
        [id],
      );
    } else if (req.user.role === "customer") {
      result = await pool.query(
        `SELECT
        bookings.id,
        bookings.customer_id,
        bookings.barber_id,
        bookings.service_id,
        customers.first_name AS customer_first_name,
          customers.last_name AS customer_last_name,
        barbers.first_name AS barber_first_name,
          barbers.last_name AS barber_last_name,
          barbers.salon_name AS barber_salon_name,
          barbers.address AS barber_address,
          barbers.latitude AS barber_latitude,
          barbers.longitude AS barber_longitude,
          (SELECT u.phone FROM users u WHERE u.id=barbers.user_id AND u.role='barber') AS barber_phone,
        services.name AS service_name,
        bookings.booking_time,
        bookings.duration_minutes,
          bookings.cancellation_cutoff_minutes,bookings.cancellation_policy_text,
          (to_jsonb(bookings)->>'total_price')::numeric AS total_price,
        bookings.booking_time + bookings.duration_minutes * INTERVAL '1 minute' AS booking_end,
        bookings.status,
        (SELECT jsonb_build_object('minutes', ln.minutes_late, 'reportedAt', ln.created_at)
         FROM booking_late_notices ln WHERE ln.booking_id=bookings.id) AS late_notice,
          (SELECT jsonb_build_object('requestedAt', ci.requested_at, 'confirmedAt', ci.confirmed_at)
           FROM booking_checkins ci WHERE ci.booking_id=bookings.id) AS check_in,
        bookings.created_at
        FROM bookings
        JOIN customers ON bookings.customer_id=customers.id
        JOIN barbers ON bookings.barber_id=barbers.id
        LEFT JOIN services ON bookings.service_id=services.id
        WHERE bookings.id=$1
        AND bookings.customer_id=$2
        `,
        [id, req.user.profileId],
      );
    } else if (req.user.role === "barber") {
      result = await pool.query(
        `SELECT
      bookings.id,
      bookings.customer_id,
      bookings.barber_id,
      bookings.service_id,
      customers.first_name AS customer_first_name,
          (SELECT u.phone FROM users u WHERE u.id=customers.user_id AND u.role='customer') AS customer_phone,
          customers.last_name AS customer_last_name,
      barbers.first_name AS barber_first_name,
          barbers.last_name AS barber_last_name,
      services.name AS service_name,
      bookings.booking_time,
      bookings.duration_minutes,
          bookings.cancellation_cutoff_minutes,bookings.cancellation_policy_text,
          (to_jsonb(bookings)->>'total_price')::numeric AS total_price,
      bookings.booking_time + bookings.duration_minutes * INTERVAL '1 minute' AS booking_end,
      bookings.status,
      (SELECT jsonb_build_object('minutes', ln.minutes_late, 'reportedAt', ln.created_at)
       FROM booking_late_notices ln WHERE ln.booking_id=bookings.id) AS late_notice,
          (SELECT jsonb_build_object('requestedAt', ci.requested_at, 'confirmedAt', ci.confirmed_at)
           FROM booking_checkins ci WHERE ci.booking_id=bookings.id) AS check_in,
      bookings.created_at
    FROM bookings
    JOIN customers ON bookings.customer_id = customers.id
    JOIN barbers ON bookings.barber_id = barbers.id
    LEFT JOIN services ON bookings.service_id = services.id
    WHERE bookings.id = $1
      AND bookings.barber_id = $2`,
        [id, req.user.profileId],
      );
    } else {
      return res.status(403).json({
        message: "Bu amal uchun ruxsat yo'q",
      });
    }
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Booking topilmadi",
      });
    }
    return res.json((await attachBookingServices(result.rows, pool))[0]);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
//Bo'sh slots
async function getAvailableSlots(req, res) {
  // Availability is a short-lived quote, never a reservation or cached promise.
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  if (req.query.service_ids !== undefined) {
    try { return res.json(await multiSlots(pool, req.query)); }
    catch (error) { return res.status(error instanceof BookingSelectionError ? error.status : 500).json({ message: error instanceof BookingSelectionError ? error.message : 'Bo‘sh vaqtlar yuklanmadi.', code: error instanceof BookingSelectionError ? error.code : undefined }); }
  }
  let client;
  let started = false;
  let broken = false;
  try {
    const barberId = Number(req.query.barber_id);
    const serviceId = Number(req.query.service_id);
    const { date } = req.query;

    if (
      !Number.isInteger(barberId) ||
      barberId <= 0 || barberId > 2147483647 ||
      !Number.isInteger(serviceId) ||
      serviceId <= 0 || serviceId > 2147483647 ||
      !validDate(date)
    ) {
      return res.status(400).json({
        message: "barber_id,service_id yoki date noto'gri",
      });
    }
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    started = true;
    await client.query("SET LOCAL statement_timeout='15s'");
    const barberResult = await client.query(
      "SELECT verification_status,accepting_bookings FROM barbers WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=barbers.user_id AND u.deactivated_at IS NOT NULL)",
      [barberId],
    );
    if (barberResult.rowCount == 0) {
      return res.status(404).json({
        message: "Barber topilmadi",
      });
    }
    if (barberResult.rows[0].verification_status !== "approved") {
      return res.status(403).json({
        message: "Bu barber hozircha xizmat ko'rsata olmaydi",
      });
    }
    const serviceResult = await client.query(
      `SELECT duration_minutes
      FROM services
      WHERE id=$1 AND barber_id=$2 AND COALESCE((to_jsonb(services)->>'is_active')::boolean,TRUE)`,
      [serviceId, barberId],
    );
    if (serviceResult.rowCount === 0) {
      return res.status(404).json({
        message: "Xizmat topilmadi",
      });
    }
    const duration = Number(serviceResult.rows[0].duration_minutes);
    if (!Number.isInteger(duration) || duration <= 0 || duration % 5 !== 0) throw new Error("Invalid service duration");

    if (barberResult.rows[0].accepting_bookings !== true) {
      return res.json({
        date,
        duration,
        working: false,
        accepting_bookings: false,
        slots: [],
        recommendedSlots: [],
        busy: [],
      });
    }

    // ish jadval olish shu kunni
    const workingHoursResult = await dayHours(client,barberId,date);
    if (workingHoursResult.rowCount === 0) {
      return res.json({
        date,
        duration,
        working: false,
        slots: [],
        busy: [],
      });
    }
    //Shu kundagi bekor qilinmagan bronlarni olish
    const { start_time, end_time } = workingHoursResult.rows[0];
    const workStart = minutes(start_time);
    const workEnd = minutes(end_time);
    if (workStart >= workEnd) throw new Error("Invalid working hours");
    const nowMinutes = Number(workingHoursResult.rows[0].now_minutes);
    if (!Number.isFinite(nowMinutes)) throw new Error("Invalid database clock");
    // Offsets are relative to the selected Tashkent midnight, not HOUR/MINUTE:
    // bookings crossing midnight retain their full interval instead of wrapping.
    const busyResult = await client.query(
      `SELECT
        EXTRACT(EPOCH FROM ((booking_time AT TIME ZONE 'Asia/Tashkent')-$2::date))/60 AS start_minutes,
        EXTRACT(EPOCH FROM (((booking_time + duration_minutes * INTERVAL '1 minute')
          AT TIME ZONE 'Asia/Tashkent')-$2::date))/60 AS end_minutes
       FROM bookings
       WHERE barber_id=$1 AND status IN ('pending','confirmed')
         AND booking_time < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Tashkent')
         AND booking_time + duration_minutes * INTERVAL '1 minute' > ($2::date::timestamp AT TIME ZONE 'Asia/Tashkent')
       ORDER BY booking_time`,
      [barberId, date],
    );
    const reservedBusy = busyResult.rows.map((booking) => ({
      start: Number(booking.start_minutes),
      end: Number(booking.end_minutes),
    }));
    const busy = withBreakBusy(reservedBusy, workingHoursResult.rows[0]);
    const slots = slotCandidates({ workStart, workEnd, duration, nowMinutes, busy })
      .filter((slot) => slot.available);
    const formattedSlots = slots.map((slot) => ({
      start: timeString(slot.start),
      end: timeString(slot.end),
    }));
    const recommendedSlots = slots.filter((slot) => {
      const nextStart = slot.end;
      const nextEnd = nextStart + duration;

      const fitsWorkHours = nextEnd <= workEnd;

      const conflictsWithBooking = busy.some((booking) => {
        return nextStart < booking.end && nextEnd > booking.start;
      });

      return fitsWorkHours && !conflictsWithBooking;
    });
    return res.json({
      date,
      duration,
      working: true,
      slots: formattedSlots,
      recommendedSlots: recommendedSlots.map((slot) => ({
        start: timeString(slot.start),
        end: timeString(slot.end),
      })),
      // Only the owner barber may see occupied time intervals. A signed-in
      // customer must get the same privacy-preserving view as a guest (#173).
      ...(req.user?.role === 'barber' && Number(req.user.profileId) === barberId
        ? { busy: busy.map((booking) => ({
            start: timeString(Math.max(0, Math.floor(booking.start))),
            end: timeString(Math.min(1440, Math.ceil(booking.end))),
          })) }
        : {}),
    });
  } catch (error) {
    if(isPgConnectionBroken(error)) broken=true;
    console.error("getAvailableSlots xatosi:", error.code||'error');

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  } finally {
    if (client) {
      if (started) {
        try { await client.query("ROLLBACK"); } catch { broken = true; }
      }
      client.release(broken);
    }
  }
}
// Yangi booking yaratish
async function createBooking(req, res, _next, database = pool, bookingNotifier = notifyBooking) {
  let client;
  let transactionStarted = false;
  let commitStarted = false;
  let broken = false;
  try {
    // 1. Faqat mijoz bron yaratishi mumkin
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Faqat mijozlar bron yaratishi mumkin",
      });
    }
    const requestId = bookingRequest(req.body);
    if (requestId) await requireIdempotencySchema(database);
    if (req.body?.service_ids !== undefined) {
      const ids = serviceIds(req.body.service_ids);
      if (await multiSchemaReady(database)) {
        const booking = await createMultiBooking(database, req.user, req.body);
        if (!booking.replayed) await notifyAfterCommit(bookingNotifier, booking.id, 'confirmed');
        return res.status(booking.replayed ? 200 : 201).json({ message: booking.replayed ? 'Avvalgi bron holati olindi' : 'Bron tasdiqlandi', data: booking });
      }
      if (ids.length > 1) return res.status(503).json({ message: 'Ko‘p xizmatli bron hali yoqilmagan. Hozircha bitta xizmat tanlang.', code: 'migration_required' });
      req.body = { ...req.body, service_id: ids[0] };
    }
    // 2. Ma'lumotlarni olish
    const { barber_id, service_id, booking_time } = req.body || {};
    // Once booking_services migration is installed, use exactly the same
    // atomic price/duration snapshot path for one and multiple services.
    if (Number.isInteger(service_id) && service_id > 0 && await multiSchemaReady(database)) {
      const booking = await createMultiBooking(database, req.user, {
        ...req.body, service_ids: [service_id],
      });
      if (!booking.replayed) await notifyAfterCommit(bookingNotifier, booking.id, 'confirmed');
      return res.status(booking.replayed ? 200 : 201).json({ message: booking.replayed ? 'Avvalgi bron holati olindi' : 'Bron tasdiqlandi', data: booking });
    }
    const customer_id = req.user.profileId;
    // 3. ID larni tekshirish
    if (!Number.isSafeInteger(customer_id) || customer_id <= 0 || customer_id > 2147483647) {
      return res.status(400).json({
        message: "Customer ID noto'g'ri",
      });
    }
    if (!Number.isSafeInteger(barber_id) || barber_id <= 0 || barber_id > 2147483647) {
      return res.status(400).json({
        message: "Barber ID noto'g'ri",
      });
    }
    if (!Number.isSafeInteger(service_id) || service_id <= 0 || service_id > 2147483647) {
      return res.status(400).json({
        message: "Service ID noto'g'ri",
      });
    }
    // Older schemas cannot save a price/duration snapshot. Do not silently
    // accept a quoted selection and then write a different legacy booking.
    if (req.body?.expected_total_price != null || req.body?.expected_duration_minutes != null) {
      return res.status(503).json({ code: 'migration_required',
        message: 'Bron narxi va davomiyligini tekshirish uchun database migratsiyasi kerak.' });
    }
    // Require an explicit UTC offset/Z; never let Node or PostgreSQL infer
    // different time zones for the same incoming string.
    const newStart = parseBookingTime(booking_time);
    if (!Number.isFinite(newStart)) {
      return res.status(400).json({ message: "Booking vaqti ISO formatida Z yoki UTC offset bilan berilishi kerak" });
    }
    if (newStart % 300000 !== 0) return res.status(400).json({message: 'Bron vaqti 5 daqiqalik qadamga mos bo‘lishi kerak.'});
    const canonicalTime = new Date(newStart).toISOString();
    const signature = requestId ? fingerprint(barber_id, [service_id], canonicalTime) : null;
    // 5. Transaction boshlash
    client = await database.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    // Lock the customer before the barber. Account deletion locks the customer
    // profile before deleting bookings; taking this lock first avoids an FK
    // insert/delete cycle while the booking waits for the barber advisory lock.
    const customerProfile = await client.query(
      "SELECT user_id FROM customers WHERE id=$1 FOR UPDATE",
      [customer_id],
    );
    if (!customerProfile.rowCount || customerProfile.rows[0].user_id !== req.user.accountId) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }
    const customerAccount = await client.query(
      "SELECT id FROM users WHERE id=$1 AND role='customer' AND deactivated_at IS NULL FOR SHARE",
      [req.user.accountId],
    );
    if (!customerAccount.rowCount) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }
    const replay = await replayBooking(client, customer_id, requestId, signature);
    if (replay) {
      commitStarted = true; await client.query('COMMIT'); commitStarted = false; transactionStarted = false;
      return res.status(200).json({message: 'Avvalgi bron holati olindi', data: replay});
    }
    // Then use the shared barber protocol: advisory lock, barber row, service row.
    await client.query("SELECT pg_advisory_xact_lock($1)", [barber_id]);
    // Sartarosh tasdiqlanganini check qilish
    const barberCheck = await client.query(
      `SELECT verification_status,accepting_bookings,cancellation_cutoff_minutes,cancellation_policy_text,clock_timestamp() AS now
      FROM barbers
      WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=barbers.user_id AND u.deactivated_at IS NOT NULL) FOR SHARE
      `,
      [barber_id],
    );
    if (barberCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        message: "Sartarosh topilmadi",
      });
    }
    if (barberCheck.rows[0].verification_status !== "approved") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        message: "Bu sartarosh hali tasdiqlanmagan",
      });
    }
    const expectedTerms = checkExpectedCancellationPolicy(req.body, barberCheck.rows[0]);
    if (!expectedTerms.ok) {
      await client.query('ROLLBACK'); transactionStarted = false;
      return res.status(expectedTerms.status).json({ code: expectedTerms.code, message: expectedTerms.message });
    }
    // Serialize account pause with a new booking: barber row was locked first.
    // A separate user FOR SHARE lock verifies status after any concurrent pause.
    const barberOwner = await client.query('SELECT user_id FROM barbers WHERE id=$1', [barber_id]);
    const activeBarber = await client.query('SELECT id FROM users WHERE id=$1 AND deactivated_at IS NULL FOR SHARE', [barberOwner.rows[0].user_id]);
    if (!activeBarber.rowCount) {
      await client.query('ROLLBACK'); transactionStarted = false;
      return res.status(409).json({ code: 'barber_deactivated', message: 'Sartaroshning akkaunti vaqtincha faolsiz.' });
    }
    if (barberCheck.rows[0].accepting_bookings !== true) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(409).json({
        message: "Sartarosh hozir yangi bronlarni qabul qilmayapti",
        code: "bookings_paused",
      });
    }
    // Recheck after the advisory-lock wait using the database clock.
    if (newStart <= new Date(barberCheck.rows[0].now).getTime()) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(400).json({ message: "Bron vaqti o'tib ketgan" });
    }
    // 7. Xizmat ushbu barberga tegishli ekanini tekshirish
    const serviceCheck = await client.query(
      `SELECT id, duration_minutes
       FROM services
       WHERE id = $1 AND barber_id = $2 AND COALESCE((to_jsonb(services)->>'is_active')::boolean,TRUE) FOR SHARE`,
      [service_id, barber_id],
    );
    if (serviceCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        message: "Bu xizmat ushbu barberga tegishli emas",
      });
    }
    const duration = Number(serviceCheck.rows[0].duration_minutes);
    if (!Number.isInteger(duration) || duration <= 0 || duration % 5 !== 0) {
      throw new Error("Xizmat davomiyligi noto'g'ri");
    }
    const newEnd = newStart + duration * 60 * 1000;
    // Barberning ish jadvalini tekshirish
    if (!await fitsBooking(client,barber_id,canonicalTime,duration)) {
      await client.query('ROLLBACK'); transactionStarted = false;
      return res.status(400).json({message: 'Tanaffus, ta’til yoki ish vaqtidan tashqari.',code:'outside_work_hours'});
    }
    // 8. Barberning mavjud bronlarini tekshirish
    const bookingTimeCheck = await client.query(
      `SELECT id,booking_time,booking_time + duration_minutes * INTERVAL '1 minute' AS booking_end
       FROM bookings
       WHERE barber_id=$1 AND status IN ('pending','confirmed')
         AND booking_time < $3::timestamptz
         AND booking_time + duration_minutes * INTERVAL '1 minute' > $2::timestamptz`,
      [barber_id, canonicalTime, new Date(newEnd).toISOString()],
    );
    // 9. Vaqtlar bir-biriga to'g'ri keladimi?
    const conflict = bookingTimeCheck.rows.some((booking) => {
      const existingStart = new Date(booking.booking_time).getTime();
      const existingEnd = new Date(booking.booking_end).getTime();
      return newStart < existingEnd && newEnd > existingStart;
    });
    if (conflict) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        message: "Bu vaqt band",
      });
    }
    // Decision #169: customer may have many bookings but cannot occupy
    // overlapping times at two different barbers. The FOR UPDATE lock on the
    // customer profile serializes concurrent bookings across all barbers.
    const customerBusy = await client.query(
      `SELECT id FROM bookings WHERE customer_id=$1
         AND status IN ('pending','confirmed')
         AND booking_time < $3::timestamptz
         AND booking_time + duration_minutes * INTERVAL '1 minute' > $2::timestamptz
       LIMIT 1`,
      [customer_id, canonicalTime, new Date(newEnd).toISOString()],
    );
    if (customerBusy.rowCount) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(409).json({
        message: "Sizning boshqa bronga vaqtingiz to‘qnashyapti",
        code: "customer_time_conflict",
      });
    }
    const finalClock = await client.query("SELECT clock_timestamp() AS now");
    if (newStart <= new Date(finalClock.rows[0].now).getTime()) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(400).json({ message: "Bron vaqti o'tib ketgan" });
    }
    // 10. Yangi bronni saqlash
    const result = await client.query(
      `INSERT INTO bookings
         (customer_id, barber_id, service_id, booking_time, duration_minutes, status)
       VALUES ($1, $2, $3, $4, $5, 'confirmed')
       RETURNING *`,
      [customer_id, barber_id, service_id, canonicalTime, duration],
    );
    await saveBookingRequest(client, customer_id, requestId, signature, result.rows[0].id);
    // 11. Commit and release before any external Telegram request. Delivery
    // failures are contained by the notifier and never roll back this booking.
    commitStarted = true; await client.query("COMMIT"); commitStarted = false;
    transactionStarted = false;
    client.release(); client = null;
    await notifyAfterCommit(bookingNotifier, result.rows[0].id, 'confirmed');
    return res.status(201).json({
      message: "Bron tasdiqlandi",
      data: result.rows[0],
    });
  } catch (error) {
    // A COMMIT acknowledgement may be lost after the booking was persisted.
    // Never issue ROLLBACK or automatically retry an ambiguous COMMIT.
    if(isPgConnectionBroken(error))broken=true;
    if(commitStarted) {
      broken=true;
      if(typeof res.set==='function')res.set('Cache-Control','no-store');
      return res.status(503).json({code:'booking_result_unknown',
        message:'Bron natijasi noaniq. Bronlar ro‘yxatini yoki qayta tiklash holatini tekshiring; avtomatik takrorlamang.'});
    }
    // An ordinary pre-COMMIT SQL error still needs a rollback. If the socket
    // already failed, the connection remains poisoned even after ROLLBACK.
    if (client && transactionStarted) {
      try { await client.query('ROLLBACK'); }
      catch { broken=true; }
    }
    if (error instanceof BookingSelectionError) return res.status(error.status).json({ message: error.message, code: error.code });
    const conflict = bookingDbConflict(error);
    if (conflict) return res.status(conflict.status).json({ message: conflict.message, code: conflict.code });
    if (error.code === '23503') return res.status(400).json({ message: 'Mijoz, sartarosh yoki xizmat topilmadi' });
    console.error('createBooking failed', { code: error.code || 'unknown' });
    return res.status(500).json({ message: 'Serverda xatolik yuz berdi' });
  } finally {
    if (client) client.release(broken || commitStarted);
  }
}
async function getModifySlots(req, res, _next, database = pool) {
  // No browser or shared proxy should cache customer-specific availability,
  // including validation failures that might otherwise leak across logins.
  res.set('Cache-Control', 'no-store');
  try {
    const raw = req.query.service_ids;
    const ids = raw === undefined ? null :
      (typeof raw === 'string' && /^\d+(?:,\d+){0,19}$/.test(raw) ? raw.split(',').map(Number) : []);
    const slots = await modificationSlots(database, req.user, Number(req.params.id), req.query.date, ids);
    return res.json(slots);
  }
  catch(error) {
    if (error instanceof BookingSelectionError) return res.status(error.status).json({ message:error.message, code:error.code });
    console.error('Booking modification slots failed', { code:error.code || 'unknown' });
    return res.status(500).json({ message:'Bo‘sh vaqtlar yuklanmadi.' });
  }
}

// Rescheduling and optional service edits are atomic; old slot is retained on failure.
async function modifyBooking(req, res, _next, database = pool, notifier = notifyBooking) {
  try {
    const id = Number(req.params.id);
    const booking = await modifyCustomerBooking(database, req.user, id, req.body);
    if (!booking.replayed) await notifyAfterCommit(notifier, booking.id, 'rescheduled');
    let expanded = booking;
    try {
      expanded = (await attachBookingServices([booking], database))[0];
    } catch (detailsError) {
      // The booking transaction is already COMMITTED. Failure to load display
      // snapshots must not pretend the modification failed or invite retries.
      console.error('Committed booking details unavailable', { code: detailsError.code || 'unknown' });
      expanded = { ...booking, snapshot_refresh_required: true };
    }
    return res.json({ message: booking.replayed ? 'Bronning joriy holati qaytarildi' : 'Bron muvaffaqiyatli o‘zgartirildi', data: expanded });
  } catch (error) {
    if (error instanceof BookingSelectionError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error('Booking modification failed', { code: error.code || 'unknown' });
    return res.status(500).json({ message: 'Bronni o‘zgartirib bo‘lmadi.' });
  }
}

// Booking statusini yangilash

async function refreshStatus(req, res) {
  try {
    const booking = await bookingStatus.update(Number(req.params.id), req.body?.status, req.user);
    if (booking.status === 'cancelled' && !booking.replayed) await notifyAfterCommit(notifyBooking, booking.id, 'cancelled');
    let details = booking;
    if (booking.total_price != null) {
      try { details = (await attachBookingServices([booking], pool))[0]; }
      catch (error) {
        // Status has already COMMITTED; a failed display lookup is not a failed cancellation.
        console.error('Committed booking status details unavailable', { code: error.code || 'unknown' });
        details = { ...booking, snapshot_refresh_required: true };
      }
    }
    return res.json({ message: booking.replayed ? 'Bron avval bekor qilingan' : 'Booking holati yangilandi', data: details });
  } catch (error) {
    if (error instanceof BookingStatusError) return res.status(error.status).json({ message: error.message, code: error.code });
    const conflict = bookingDbConflict(error);
    if (conflict) return res.status(conflict.status).json({ message: conflict.message, code: conflict.code });
    console.error("Booking status update failed");
    return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
}

// Legacy DELETE clients use the exact same authorized, serialized status transition
// as PUT. No separate UPDATE path: cancellation must release occupancy only once.
async function deleteBooking(req, res) {
  return refreshStatus({ ...req, body: { status: 'cancelled' } }, res);
}

module.exports = {
  getBookingRecovery,
  getModifySlots,
  modifyBooking,
  deleteBooking,
  refreshStatus,
  createBooking,
  getBookingById,
  getBooking,
  getAvailableSlots,
};
