import { profileName } from "../../../utils/profileName.js";
import { formatDate, formatMoney } from "../../../utils/format.js";
import { barberPhone, bookingSalon } from "./navigation.js";
import { parseLateNotice } from "./lateNoticeV169.js";
import { parseCheckIn } from "./checkInV170.js";

/**
 * Customer booking API boundary. No demo records or local status transitions.
 * Booking: { id, status, startsAt: ISO timestamp with timezone, timezone?,
 * barber: {id, first_name, last_name, avatarPhoto?, avatar?, phone?, telegram?},
 * salon: {name?, address?, location?: {lat,lng}},
 * services: [{id?, name, price?, durationMinutes?}], totalPrice?, durationMinutes?,
 * canCancel: boolean, cancellationPolicy?: {text?, deadline?: ISO timestamp, fee?},
 * history?: [{status, at: ISO timestamp, note?}], rejectionReason? }.
 * The server must authorize cancellation, check deadlines and return the updated
 * booking. A production cancellation request should be idempotent on the server.
 */
async function customerApi() {
  // Pure display helpers are also imported outside Vite. Load browser session
  // and transport only when an API operation actually runs.
  const [{ getSession }, { request }] = await Promise.all([
    import('../../auth/utils/session.js'), import('../../../api/client.js'),
  ]);
  const session = getSession();
  if (session?.role !== 'customer' || !session.token) {
    throw Object.assign(new Error('Customer hisobi orqali qayta tizimga kiring.'), { status: 401 });
  }
  return { request, session, assertCurrentSession() {
    const current = getSession();
    if (current?.role !== 'customer' || current.token !== session.token ||
        current.profileId !== session.profileId || current.accountId !== session.accountId) {
      throw Object.assign(new Error('Akkaunt o‘zgardi. Bronlarni qayta yuklang.'), {
        status: 409, code: 'session_changed',
      });
    }
  } };
}
function bookingId(value) {
  const id = /^\d+$/.test(String(value)) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw Object.assign(new Error('Bron topilmadi'), { status: 404 });
  return id;
}
export function cancellationPolicyFromRow(row) {
  const cutoff = row.cancellation_cutoff_minutes;
  if (cutoff == null) return { text: row.cancellation_policy_text || 'Bekor qilish muddati belgilanmagan.', fee: 0 };
  const n = Number(cutoff), start = Date.parse(row.booking_time);
  if (!Number.isInteger(n) || n < 0 || n > 10080 || !Number.isFinite(start)) throw new Error('Bronni bekor qilish qoidalari noto‘g‘ri.');
  return { text: row.cancellation_policy_text || `Bron boshlanishidan ${n} daqiqa avval bekor qiling.`,
    deadline: new Date(start - n * 60000).toISOString(), fee: 0 };
}
function fromBackend(row, customerId) {
  if (!row || !Number.isInteger(row.id) || row.id <= 0
    || !Number.isInteger(row.barber_id) || row.barber_id <= 0
    || !Number.isInteger(row.service_id) || row.service_id <= 0
    || !Object.hasOwn(STATUSES, row.status) || timestamp(row.booking_time) == null
    || !Number.isInteger(row.duration_minutes) || row.duration_minutes <= 0) throw new Error('Serverdan booking ma’lumotlari olinmadi.');
  if (row.customer_id !== customerId) throw Object.assign(new Error('Bu bron sizning hisobingizga tegishli emas.'), { status: 403 });
  // #52: A receipt cannot display a conflicting server-computed end time.
  // The booking status can be stale, but start/duration/end must agree.
  const startMs = timestamp(row.booking_time);
  const calculatedEnd = startMs + row.duration_minutes * 60000;
  const confirmedEnd = row.booking_end == null ? calculatedEnd : timestamp(row.booking_end);
  if (!Number.isSafeInteger(calculatedEnd) || confirmedEnd !== calculatedEnd)
    throw new Error('Bronning boshlanish va tugash vaqtlari bir-biriga mos emas.');
  // A customer booking view must not carry the customer's private contact field,
  // even if an upstream API accidentally adds it to a booking row.
  // Never spread raw API objects into UI state: future backend fields may
  // contain private contacts, authentication metadata, or internal notes.
  const publicBookingFields = {
    id: row.id, customer_id: row.customer_id, barber_id: row.barber_id,
    service_id: row.service_id, status: row.status,
    ...(typeof row.created_at === 'string' ? {created_at: row.created_at} : {}),
  };
  if (row.services != null && !Array.isArray(row.services))
    throw new Error('Serverdan xizmatlar ro‘yxati noto‘g‘ri qaytdi.');
  const services = row.services?.length ? row.services.map(item => {
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 ||
        typeof item.name !== 'string' || !Number.isFinite(Number(item.price)) || Number(item.price) < 0 ||
        !Number.isSafeInteger(item.duration_minutes) || item.duration_minutes <= 0)
      throw new Error('Serverdan xizmatlar ro‘yxati noto‘g‘ri qaytdi.');
    return { id: item.id, name: item.name, price: Number(item.price),
      durationMinutes: item.duration_minutes };
  }) : [{ id: row.service_id, name: row.service_name, durationMinutes: row.duration_minutes }];
  const confirmedTotal = row.total_price == null ? null : Number(row.total_price);
  if (row.total_price != null && (!Number.isFinite(confirmedTotal) || confirmedTotal < 0))
    throw new Error('Bron narxi serverdan noto‘g‘ri qaytdi.');
  return {
    ...publicBookingFields, isDemo: false, startsAt: row.booking_time,
    endsAt: row.booking_end || new Date(confirmedEnd).toISOString(),
    timezone: 'Asia/Tashkent', durationMinutes: row.duration_minutes,
    barber: { id: row.barber_id, first_name: row.barber_first_name, last_name: row.barber_last_name,
      ...(barberPhone(row) ? { phone: barberPhone(row) } : {}) },
    ...(bookingSalon(row) ? { salon: bookingSalon(row) } : {}),
    services,
    ...(confirmedTotal == null ? {} : { totalPrice: confirmedTotal }),
    lateNotice: parseLateNotice(row.late_notice),
    checkIn: parseCheckIn(row.check_in),
    canCancel: ['pending', 'confirmed'].includes(row.status),
    cancellationPolicy: cancellationPolicyFromRow(row), history: [],
  };
}
export async function loadCustomerBookings({ signal } = {}) {
  signal?.throwIfAborted();
  const { request, session, assertCurrentSession } = await customerApi();
  const rows = await request('GET', '/api/bookings', { token: session.token, signal });
  signal?.throwIfAborted();
  assertCurrentSession();
  if (!Array.isArray(rows)) throw new Error('Serverdan bronlar ro‘yxati olinmadi.');
  return normalizeBookings(rows.map((row) => fromBackend(row, session.profileId)));
}
export async function loadCustomerBooking(id, { signal } = {}) {
  const target = bookingId(id);
  const { request, session, assertCurrentSession } = await customerApi();
  const row = await request('GET', `/api/bookings/${target}`, { token: session.token, signal });
  signal?.throwIfAborted();
  assertCurrentSession();
  const booking = fromBackend(row, session.profileId);
  if (booking.id !== target) throw new Error('Serverdan boshqa booking qaytdi.');
  return normalizeBookings([booking])[0];
}
export async function cancelCustomerBooking(id, { signal } = {}) {
  const target = bookingId(id);
  const { request, session, assertCurrentSession } = await customerApi();
  const result = await request('PUT', `/api/bookings/${target}`, {
    body: { status: 'cancelled' }, token: session.token, signal,
  });
  assertCurrentSession();
  return validateCancellation(fromBackend(result?.data, session.profileId), target);
}
// v101: do not request new availability until cancellation is actually confirmed.
// The same customer session is checked again after every asynchronous lookup.
export async function loadCancellationAlternatives(booking, { signal, nowMs } = {}) {
  signal?.throwIfAborted();
  const { session, assertCurrentSession } = await customerApi();
  const [{ loadAvailableSlots }, { collectCancellationAlternatives }] = await Promise.all([
    import('../barber/availableSlots.js'), import('./cancellationAlternatives.js'),
  ]);
  assertCurrentSession();
  signal?.throwIfAborted();
  const outcome = await collectCancellationAlternatives(booking, {
    signal, nowMs, fetchSlots: async (query) => {
      assertCurrentSession();
      const result = await loadAvailableSlots({ ...query, token: session.token });
      assertCurrentSession();
      return result;
    },
  });
  assertCurrentSession();
  return outcome;
}

// Timezone is fixed UTC+05:00 in Asia/Tashkent; use an offset in the API,
// never send a browser-local, timezone-less date.
export function tashkentFields(iso) {
  const value = timestamp(iso);
  if (value == null) throw new Error('Bron vaqti noto‘g‘ri.');
  const parts = new Date(value + 5 * 60 * 60 * 1000).toISOString();
  return { date: parts.slice(0, 10), time: parts.slice(11, 16) };
}
export function rescheduleTime(date, time) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
    || Number(time.slice(3)) % 5 !== 0) throw new Error('Sana va vaqtni 5 daqiqalik qadamda tanlang.');
  const iso = `${date}T${time}:00+05:00`;
  if (tashkentFields(iso).date !== date) throw new Error('Sana noto‘g‘ri.');
  return iso;
}
// Service choices are displayed for convenience. The PATCH endpoint MUST
// recalculate their prices and durations inside its transaction.
export async function loadBookingServiceChoices(booking, { signal } = {}) {
  const barberId = bookingId(booking?.barber?.id);
  const { request, session, assertCurrentSession } = await customerApi();
  const rows = await request('GET', `/api/services?${new URLSearchParams({barber_id: String(barberId)})}`, {
    token: session.token, signal,
  });
  signal?.throwIfAborted();
  assertCurrentSession();
  if (!Array.isArray(rows) || rows.length > 200 || new Set(rows.map(item => item?.id)).size !== rows.length
    || rows.some(item => !item || item.barber_id !== barberId || !Number.isSafeInteger(item.id) || item.id <= 0
    || typeof item.name !== 'string' || !item.name.trim()
    || !Number.isSafeInteger(Number(item.duration_minutes)) || Number(item.duration_minutes) <= 0
    || Number(item.duration_minutes) % 5 !== 0 || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0)) {
    throw new Error('Xizmatlar ro‘yxati noto‘g‘ri qaytdi.');
  }
  return rows.filter(item => item.is_active !== false);
}
export function bookingServiceIds(booking) {
  const ids = booking?.services?.map(service => service.id);
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) return [];
  return ids;
}
export function bookingModificationBody(booking, date, time, serviceIds = null, quote = null) {
  const body = { booking_time:rescheduleTime(date,time), expected_booking_time:booking?.startsAt };
  if (!serviceIds) return body;
  const oldIds = bookingServiceIds(booking);
  if (!oldIds.length || !Array.isArray(serviceIds) || !serviceIds.length || serviceIds.length > 20
    || serviceIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(serviceIds).size !== serviceIds.length)
    throw new Error('Xizmatlarni qayta tanlang.');
  const normalized = String(quote);
  if ((typeof quote !== 'string' && typeof quote !== 'number') ||
    !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0)
    throw new Error('Narxni serverdan qayta tasdiqlang.');
  return { ...body, service_ids:serviceIds, expected_service_ids:oldIds, expected_total_price:quote };
}
// Server availability is advisory: PATCH rechecks all constraints under DB locks.
// Still, never show malformed, overlapping or stale suggestions as selectable.
const fiveMinuteClock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function clockMinutes(value, allowEndOfDay = false) {
  if (allowEndOfDay && value === '24:00') return 1440;
  if (typeof value !== 'string' || !fiveMinuteClock.test(value)) return null;
  const minute = Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return minute % 5 === 0 ? minute : null;
}
export function verifyRescheduleSlots(result, date, previousDuration, replacingServices = false) {
  if (!result || result.date !== date || !Array.isArray(result.slots)
    || result.slots.length > 288
    || !Number.isSafeInteger(result.duration) || result.duration <= 0 || result.duration % 5 !== 0
    || (!replacingServices && result.duration !== previousDuration)
    || (replacingServices && !(typeof result.total_price === 'string'
      && /^(?:0|[1-9]\d{0,9})\.\d{2}$/.test(result.total_price)
      && Number(result.total_price) > 0))
    || typeof result.working !== 'boolean'
    || typeof result.accepting_bookings !== 'boolean'
    || ((!result.working || !result.accepting_bookings) && result.slots.length)) {
    throw new Error('Bo‘sh vaqtlar va narx serverdan noto‘g‘ri qaytdi.');
  }
  const seen = new Set();
  const checked = [];
  for (const slot of result.slots) {
    const start = clockMinutes(slot?.start);
    const end = clockMinutes(slot?.end, true);
    if (start == null || end == null || end <= start || end - start !== result.duration
      || seen.has(start) || Object.keys(slot).some(key => !['start', 'end'].includes(key))) {
      throw new Error('Bo‘sh vaqtlar va narx serverdan noto‘g‘ri qaytdi.');
    }
    seen.add(start);
    checked.push({ start: slot.start, end: slot.end });
  }
  checked.sort((a, b) => a.start.localeCompare(b.start));
  return { ...result, slots: checked };
}
export async function loadRescheduleSlots(booking, date, { signal, serviceIds = null } = {}) {
  const id = bookingId(booking?.id);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T12:00:00+05:00`)) ||
    new Date(Date.parse(`${date}T12:00:00+05:00`) + 5 * 3600000).toISOString().slice(0,10) !== date) {
    throw new Error('Sana noto‘g‘ri.');
  }
  const { request, session, assertCurrentSession } = await customerApi();
  const query = new URLSearchParams({date});
  if (serviceIds) {
    if (!Array.isArray(serviceIds) || !serviceIds.length || serviceIds.length > 20 ||
        serviceIds.some(n => !Number.isSafeInteger(n) || n <= 0 || n > 2147483647) || new Set(serviceIds).size !== serviceIds.length)
      throw new Error('Xizmatlarni qayta tanlang.');
    query.set('service_ids', serviceIds.join(','));
  }
  const result = await request('GET', `/api/bookings/${id}/modify-slots?${query}`, { token:session.token, signal });
  signal?.throwIfAborted();
  assertCurrentSession();
  return verifyRescheduleSlots(result, date, booking.durationMinutes, Boolean(serviceIds));
}
export function validateRescheduleReceipt(result, booking, body, customerId, serviceIds = null, quote = null) {
  const row = result?.data;
  const expected = timestamp(body?.booking_time);
  const validIdentity = Number.isInteger(customerId) && customerId > 0 &&
    row?.id === booking?.id && row.customer_id === customerId &&
    (!booking?.barber?.id || row.barber_id === booking.barber.id);
  const validState = ['pending', 'confirmed'].includes(row?.status) &&
    timestamp(row?.booking_time) != null && timestamp(row.booking_time) === expected &&
    Number.isInteger(row?.duration_minutes) && row.duration_minutes > 0 &&
    row.duration_minutes % 5 === 0;
  // Changing only the appointment time may not silently alter the booked
  // duration or the previously confirmed price in the returned receipt.
  const originalDurationOk = serviceIds != null || booking?.durationMinutes == null
    || row?.duration_minutes === booking.durationMinutes;
  const originalPriceOk = serviceIds != null || !Number.isFinite(booking?.totalPrice)
    || (row?.total_price != null && Number(row.total_price) === booking.totalPrice);
  const validSelection = serviceIds == null || (
    Array.isArray(row?.services) && row.services.length === serviceIds.length &&
    row.services.every((service, index) => service?.id === serviceIds[index]) &&
    typeof row.total_price !== 'undefined' &&
    Number.isFinite(Number(row.total_price)) && Number(row.total_price) === Number(quote)
  );
  if (!validIdentity || !validState || !validSelection || !originalDurationOk || !originalPriceOk
    || result?.data?.snapshot_refresh_required === true) {
    // Transaction may already have COMMITTED. A malformed receipt must never
    // be interpreted as permission to repeat the mutation with a new request.
    throw Object.assign(new Error('Bron natijasi tasdiqlanmadi. Qayta yuborishdan oldin Bronlarimni yangilang.'), {
      status: 409, code: 'booking_confirmation_unknown',
    });
  }
  return row;
}
export async function rescheduleCustomerBooking(booking, date, time, { signal, serviceIds = null, quote = null } = {}) {
  const id = bookingId(booking?.id);
  const { request, session, assertCurrentSession } = await customerApi();
  const body = bookingModificationBody(booking,date,time,serviceIds,quote);
  const result = await request('PATCH', `/api/bookings/${id}/modify`, {
    body, token: session.token, signal,
  });
  assertCurrentSession();
  return validateRescheduleReceipt(result, booking, body, session.profileId, serviceIds, quote);
}
export const STATUSES = {
  pending: { label: 'Kutilmoqda', description: 'Barber tasdiqlashini kutayotgan bronlar' },
  confirmed: { label: 'Tasdiqlangan', description: 'Vaqti belgilangan bronlar' },
  completed: { label: 'Yakunlangan', description: 'Foydalanilgan xizmatlar' },
  cancelled: { label: 'Bekor qilingan', description: 'Mijoz yoki barber bekor qilgan bronlar' },
  rejected: { label: 'Rad etilgan', description: 'Barber qabul qilmagan bronlar' },
};
export const statusInfo = (status) => Object.hasOwn(STATUSES, status) ? STATUSES[status] : { label: 'Noma’lum holat', description: 'Holat ma’lumoti tekshirilishi kerak' };
export const known = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  // Date.parse silently normalizes nonexistent calendar days in some engines.
  const day = value.slice(0, 10);
  const dayMs = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(dayMs) || new Date(dayMs).toISOString().slice(0, 10) !== day) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
export function normalizeBookings(value) {
  if (!Array.isArray(value) || value.some((b) => !b || b.id == null || typeof b.status !== 'string')) throw new Error('Invalid bookings');
  const ids = new Set();
  return value.map((b) => {
    if (ids.has(String(b.id))) throw new Error('Duplicate booking');
    ids.add(String(b.id));
    return { ...b, services: Array.isArray(b.services) ? b.services.filter((s) => s && typeof s === 'object') : [], history: Array.isArray(b.history) ? b.history.filter((h) => h && typeof h === 'object') : [] };
  });
}
export const barberName = (b) => profileName(b.barber) || 'Barber ma’lumoti kiritilmagan';
export const money = (value) => known(value) ? formatMoney(value) : 'Ko‘rsatilmagan';
export function total(booking, field, serviceField = field) {
  if (known(booking[field])) return booking[field];
  return booking.services.length && booking.services.every((s) => known(s[serviceField])) ? booking.services.reduce((sum, s) => sum + s[serviceField], 0) : null;
}
export function dateLabel(value, timezone = 'Asia/Tashkent', time = false) {
  const n = timestamp(value);
  if (n == null) return 'Belgilanmagan';
  if (!time) return formatDate(n, timezone);
  const options = { hour: '2-digit', minute: '2-digit', hour12: false };
  try { return new Intl.DateTimeFormat('uz-UZ', { ...options, timeZone: timezone }).format(n); }
  catch { return new Intl.DateTimeFormat('uz-UZ', { ...options, timeZone: 'Asia/Tashkent' }).format(n); }
}
export function canCancel(booking, now = Date.now()) {
  const deadline = booking.cancellationPolicy?.deadline;
  const start = timestamp(booking?.startsAt);
  // #17: Never show an expired cancellation control merely because a barber
  // has no explicit cutoff policy. The server remains the final authority.
  return ['pending', 'confirmed'].includes(booking.status) && booking.canCancel === true
    && start != null && start > now
    && (!deadline || (timestamp(deadline) != null && timestamp(deadline) > now));
}
// #37: Past pending/confirmed visits have NOT automatically been completed;
// show them in history with their real server status until reconciled.
export function isUpcomingBooking(booking, now = Date.now()) {
  const start = timestamp(booking?.startsAt);
  return ['pending', 'confirmed'].includes(booking?.status) && start !== null && start > now;
}
export function isOverdueBooking(booking, now = Date.now()) {
  const start = timestamp(booking?.startsAt);
  return ['pending', 'confirmed'].includes(booking?.status) && start !== null && start <= now;
}
export function matchesBookingFilter(booking, filter, now = Date.now()) {
  if (filter === 'all') return true;
  if (filter === 'upcoming') return isUpcomingBooking(booking, now);
  if (filter === 'history') return ['completed', 'cancelled', 'rejected'].includes(booking?.status)
    || isOverdueBooking(booking, now);
  return Object.hasOwn(STATUSES, filter) && booking?.status === filter;
}
export function nearestBooking(bookings, now = Date.now()) {
  return bookings.filter((b) => b.status === 'confirmed' && isUpcomingBooking(b, now)).sort((a, b) => timestamp(a.startsAt) - timestamp(b.startsAt))[0] || null;
}
export function sortBookings(bookings, now = Date.now()) {
  const upcoming = (b) => isUpcomingBooking(b, now);
  return [...bookings].sort((a, b) => Number(upcoming(b)) - Number(upcoming(a)) || (upcoming(a) ? (timestamp(a.startsAt) ?? Infinity) - (timestamp(b.startsAt) ?? Infinity) : (timestamp(b.startsAt) ?? 0) - (timestamp(a.startsAt) ?? 0)));
}
export function validateCancellation(value, id) {
  const booking = normalizeBookings([value])[0];
  if (String(booking.id) !== String(id) || booking.status !== 'cancelled') throw new Error('Server cancellation not confirmed');
  return booking;
}
