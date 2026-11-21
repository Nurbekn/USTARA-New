'use strict';
// Customer-only, atomic rescheduling and optional service replacement.
// Lock order: customer profile -> advisory barber -> booking row. The original
// booking remains untouched on any validation, price or collision failure.
const { parseBookingTime, validDate, minutes, timeString } = require('../utils/bookingTime');
const { slotCandidates } = require('./slotGrid');
const { serviceIds, selectedServices, expectedPriceMatches, multiSchemaReady, fail } = require('./bookingSelection');
const { bookingDbConflict } = require('./bookingDbConflicts');
const { fitsBooking, dayHours, withBreakBusy } = require('./calendarSchedule');

function validCustomerActor(actor) {
  const accountId = actor?.accountId ?? actor?.id;
  return actor?.role === 'customer'
    && Number.isSafeInteger(actor.profileId) && actor.profileId > 0 && actor.profileId <= 2147483647
    && Number.isSafeInteger(accountId) && accountId > 0 && accountId <= 2147483647;
}
function modificationInput(id, actor, body) {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw fail(400, 'Bron identifikatori noto‘g‘ri.', 'invalid_booking_id');
  if (!validCustomerActor(actor))
    throw fail(403, 'Faqat bron egasi o‘zgartira oladi.', 'forbidden');
  const time = parseBookingTime(body?.booking_time);
  const expected = parseBookingTime(body?.expected_booking_time);
  if (!Number.isFinite(time) || time % 300000 || !Number.isFinite(expected) || expected % 300000)
    throw fail(400, 'Eski va yangi vaqtni aniq ko‘rsating (5 daqiqalik qadam).', 'invalid_booking_time');
  const editingServices = Object.hasOwn(body || {}, 'service_ids');
  const ids = editingServices ? serviceIds(body.service_ids) : null;
  const expectedIds = editingServices ? serviceIds(body?.expected_service_ids) : null;
  if (editingServices && (body.expected_total_price == null))
    throw fail(400, 'Xizmatlarni o‘zgartirishdan oldin yangilangan narxni tasdiqlang.', 'price_quote_required');
  return { time, expected, editingServices, ids, expectedIds };
}

async function modifyCustomerBooking(pool, actor, id, body) {
  const { time, expected, editingServices, ids, expectedIds } = modificationInput(id, actor, body);
  if (!await multiSchemaReady(pool)) throw fail(503, 'Bron o‘zgartirish uchun database migratsiyasi kerak.', 'migration_required');
  const client = await pool.connect();
  let broken = false, commitStarted = false;
  const commit = async () => { commitStarted = true; await client.query('COMMIT'); commitStarted = false; };
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    // Account pause and new bookings use the very same customer-row lock.
    const customer = await client.query('SELECT user_id FROM customers WHERE id=$1 FOR UPDATE', [actor.profileId]);
    if (customer.rows[0]?.user_id !== (actor.accountId ?? actor.id))
      throw fail(401, 'Mijoz sessiyasi yaroqsiz.', 'invalid_session');
    const account = await client.query("SELECT id FROM users WHERE id=$1 AND role='customer' AND deactivated_at IS NULL FOR SHARE", [actor.accountId ?? actor.id]);
    if (!account.rowCount) throw fail(401, 'Mijoz akkaunti faol emas.', 'invalid_session');
    const target = await client.query('SELECT barber_id FROM bookings WHERE id=$1 AND customer_id=$2', [id, actor.profileId]);
    if (!target.rowCount) throw fail(404, 'Bron topilmadi.', 'not_found');
    const barber = target.rows[0].barber_id;
    await client.query('SELECT pg_advisory_xact_lock($1)', [barber]);
    const locked = await client.query('SELECT * FROM bookings WHERE id=$1 AND customer_id=$2 FOR UPDATE', [id, actor.profileId]);
    if (!locked.rowCount) throw fail(404, 'Bron topilmadi.', 'not_found');
    const booking = locked.rows[0];
    if (booking.barber_id !== barber) throw fail(409, 'Bron boshqa sartaroshga ko‘chirilgan.', 'booking_changed');
    if (!['confirmed', 'pending'].includes(booking.status))
      throw fail(409, 'Faqat faol bronni o‘zgartirish mumkin.', 'invalid_booking_status');
    const clock = await client.query('SELECT clock_timestamp() AS now');
    const now = +new Date(clock.rows[0].now);
    const before = +new Date(booking.booking_time);
    // A lost response followed by the same request is safe. Never overwrite a
    // different change that another device committed in the meantime.
    if (before !== expected) {
      if (!editingServices && before === time && time > now) {
        await commit();
        return { ...booking, replayed: true };
      }
      throw fail(409, 'Bron boshqa qurilmada o‘zgargan. Ma’lumotlarni yangilang.', 'booking_changed');
    }
    if (before <= now || time <= now) throw fail(400, 'O‘tgan vaqtdagi bronni ko‘chirish mumkin emas.', 'booking_in_past');
    const owner = await client.query(`SELECT b.verification_status,b.accepting_bookings,u.deactivated_at
      FROM barbers b JOIN users u ON u.id=b.user_id WHERE b.id=$1 AND u.role='barber' FOR SHARE OF b,u`, [barber]);
    if (!owner.rowCount || owner.rows[0].deactivated_at || owner.rows[0].verification_status !== 'approved')
      throw fail(409, 'Sartarosh hozir mavjud emas.', 'barber_unavailable');
    if (!owner.rows[0].accepting_bookings) throw fail(409, 'Sartarosh yangi vaqt qabul qilmayapti.', 'bookings_paused');
    if (editingServices) {
      // The time alone cannot detect another device editing services at the
      // same time. Compare the old service snapshot while the booking is locked.
      const prior = await client.query('SELECT service_id FROM booking_services WHERE booking_id=$1 ORDER BY position', [id]);
      const currentIds = prior.rows.length ? prior.rows.map(row => Number(row.service_id)) : [Number(booking.service_id)];
      if (currentIds.length !== expectedIds.length || currentIds.some((value, index) => value !== expectedIds[index]))
        throw fail(409, 'Xizmatlar boshqa qurilmada o‘zgargan. Bronni yangilang.', 'booking_changed');
    }
    const selection = editingServices ? await selectedServices(client, barber, ids, true) : null;
    if (selection && !expectedPriceMatches(body.expected_total_price, selection.totalPrice))
      throw fail(409, 'Xizmat narxi o‘zgargan. Qayta tasdiqlang.', 'price_changed');
    const duration = selection ? selection.duration : Number(booking.duration_minutes);
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 1200 || duration % 5)
      throw fail(503, 'Bron davomiyligi noto‘g‘ri.', 'invalid_duration');
    const startISO = new Date(time).toISOString(), endISO = new Date(time + duration * 60000).toISOString();
    if (!await fitsBooking(client,barber,startISO,duration)) throw fail(409, 'Yangi vaqt tanaffus yoki ish jadvaliga sig‘maydi.', 'outside_work_hours');
    const conflict = await client.query(`SELECT id FROM bookings WHERE barber_id=$1 AND id<>$4
      AND status IN ('pending','confirmed') AND booking_time < $3::timestamptz
      AND booking_time + duration_minutes * INTERVAL '1 minute' > $2::timestamptz LIMIT 1`,
      [barber, startISO, endISO, id]);
    if (conflict.rowCount) throw fail(409, 'Yangi vaqt band.', 'booking_conflict');
    const customerBusy = await client.query(`SELECT id FROM bookings WHERE customer_id=$1 AND id<>$4
      AND status IN ('pending','confirmed') AND booking_time < $3::timestamptz
      AND booking_time + duration_minutes * INTERVAL '1 minute' > $2::timestamptz LIMIT 1`,
      [actor.profileId, startISO, endISO, id]);
    if (customerBusy.rowCount) throw fail(409, 'Boshqa broningiz bilan vaqt to‘qnashyapti.', 'customer_time_conflict');
    const finalClock = await client.query('SELECT clock_timestamp() AS now');
    if (time <= +new Date(finalClock.rows[0].now)) throw fail(400, 'Yangi vaqt o‘tib ketdi.', 'booking_in_past');
    const updated = await client.query(`UPDATE bookings SET booking_time=$3,duration_minutes=$4,
      service_id=$5,total_price=$6 WHERE id=$1 AND customer_id=$2 AND status IN ('pending','confirmed') RETURNING *`,
      [id, actor.profileId, startISO, duration,
        selection ? ids[0] : booking.service_id, selection ? selection.totalPrice : booking.total_price]);
    if (!updated.rowCount) throw fail(409, 'Bron holati o‘zgargan.', 'booking_changed');
    if (selection) {
      await client.query('DELETE FROM booking_services WHERE booking_id=$1', [id]);
      for (const [index, service] of selection.services.entries()) {
        await client.query(`INSERT INTO booking_services
          (booking_id,position,service_id,service_name,price,duration_minutes)
          VALUES($1,$2,$3,$4,$5,$6)`, [id,index,service.id,service.name,service.price,service.duration_minutes]);
      }
    }
    await commit();
    return { ...updated.rows[0], replayed: false };
  } catch (error) {
    if (commitStarted) broken = true;
    try { await client.query('ROLLBACK'); } catch { broken = true; }
    const conflict = bookingDbConflict(error);
    if (conflict) throw conflict;
    if (error.code === '55P03' || error.code === '57014') throw fail(409, 'Tizim band. Qayta urinib ko‘ring.', 'booking_busy');
    throw error;
  } finally { client.release(broken); }
}
// Availability for editing this particular booking, using its saved duration.
// Unlike generic barber availability, excludes ONLY the customer's own booking.
// No slot is reserved by this read; PATCH must revalidate under locks.
async function modificationSlots(pool, actor, id, date, replacementIds = null) {
  if (!validCustomerActor(actor))
    throw fail(403, 'Faqat bron egasi ko‘ra oladi.', 'forbidden');
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !validDate(date))
    throw fail(400, 'Bron yoki sana noto‘g‘ri.', 'invalid_selection');
  const ids = replacementIds === null ? null : serviceIds(replacementIds);
  const client = await pool.connect(); let broken = false, commitStarted = false;
  const commit = async () => { commitStarted = true; await client.query('COMMIT'); commitStarted = false; };
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    // Middleware authenticated this account before the request. Recheck in the
    // SAME read-only snapshot so a changed/deactivated profile never receives
    // a new appointment quote.
    const accountId = actor.accountId ?? actor.id;
    const ownerAccount = await client.query(`SELECT c.id FROM customers c
      JOIN users u ON u.id=c.user_id
      WHERE c.id=$1 AND c.user_id=$2 AND u.role='customer' AND u.deactivated_at IS NULL`,
      [actor.profileId, accountId]);
    if (!ownerAccount.rowCount) throw fail(401, 'Mijoz sessiyasi yaroqsiz.', 'invalid_session');
    const result = await client.query(`SELECT barber_id,duration_minutes,booking_time,status
      FROM bookings WHERE id=$1 AND customer_id=$2`, [id,actor.profileId]);
    if (!result.rowCount) throw fail(404, 'Bron topilmadi.', 'not_found');
    const booking = result.rows[0];
    let duration = Number(booking.duration_minutes);
    if (!['confirmed','pending'].includes(booking.status) || !Number.isSafeInteger(duration)
      || duration<=0 || duration>1200 || duration%5)
      throw fail(409, 'Bu bronni ko‘chirib bo‘lmaydi.', 'booking_not_editable');
    const clock = await client.query('SELECT clock_timestamp() AS now');
    const currentTime = clock.rows[0]?.now == null ? NaN : +new Date(clock.rows[0].now);
    const bookedTime = booking.booking_time == null ? NaN : +new Date(booking.booking_time);
    if (!Number.isFinite(currentTime) || !Number.isFinite(bookedTime))
      throw fail(503, 'Bronning vaqti tekshirib bo‘lmadi.', 'invalid_booking_time');
    if (bookedTime<=currentTime) throw fail(409,'Bron vaqti o‘tgan.','booking_not_editable');
    // Prevent obsolete day quotes without relying on the browser's timezone.
    const localDay = new Date(currentTime + 5 * 3600000).toISOString().slice(0,10);
    if (date < localDay) throw fail(409, 'Tanlangan kun o‘tib ketgan.', 'booking_date_expired');
    const owner = await client.query(`SELECT b.verification_status,b.accepting_bookings,u.deactivated_at
      FROM barbers b JOIN users u ON u.id=b.user_id WHERE b.id=$1`,[booking.barber_id]);
    const base = {date,duration,working:false,accepting_bookings:false,slots:[]};
    if (!owner.rowCount || owner.rows[0].verification_status!=='approved' || owner.rows[0].deactivated_at || !owner.rows[0].accepting_bookings) {
      // A paused/unapproved barber must not leak a service price quote.
      await commit(); return base;
    }
    // Quote only AFTER the owner has been checked, and keep it advisory.
    const selection = ids ? await selectedServices(client, booking.barber_id, ids) : null;
    if (selection) duration = selection.duration;
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 1200 || duration % 5)
      throw fail(503, 'Bron davomiyligi noto‘g‘ri.', 'invalid_duration');
    const available = { ...base, duration,
      ...(selection ? {total_price:selection.totalPrice} : {}) };
    const hours = await dayHours(client,booking.barber_id,date);
    if (!hours.rowCount) { await commit(); return {...available,accepting_bookings:true}; }
    const occupied = await client.query(`SELECT
      EXTRACT(EPOCH FROM ((booking_time AT TIME ZONE 'Asia/Tashkent')-$2::date))/60 AS start,
      EXTRACT(EPOCH FROM (((booking_time+duration_minutes*INTERVAL '1 minute') AT TIME ZONE 'Asia/Tashkent')-$2::date))/60 AS end
      FROM bookings WHERE (barber_id=$1 OR customer_id=$4) AND id<>$3 AND status IN ('pending','confirmed')
      AND booking_time<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Tashkent')
      AND booking_time+duration_minutes*INTERVAL '1 minute'>($2::date::timestamp AT TIME ZONE 'Asia/Tashkent')`,
      [booking.barber_id,date,id,actor.profileId]);
    const slots = slotCandidates({workStart:minutes(hours.rows[0].start_time),workEnd:minutes(hours.rows[0].end_time),
      duration,nowMinutes:Number(hours.rows[0].now_minutes),
      busy:withBreakBusy(occupied.rows.map(x=>({start:Number(x.start),end:Number(x.end)})), hours.rows[0])})
      .filter(slot=>slot.available).map(slot=>({start:timeString(slot.start),end:timeString(slot.end)}));
    await commit();
    return {...available,working:true,accepting_bookings:true,slots};
  } catch (error) { if (commitStarted) broken = true; try {await client.query('ROLLBACK');}catch{broken=true;}throw bookingDbConflict(error) || error; }
  finally {client.release(broken);}
}
module.exports = { modificationInput, modifyCustomerBooking, modificationSlots };
