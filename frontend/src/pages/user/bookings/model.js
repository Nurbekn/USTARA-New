import { formatDate, formatMoney } from "../../../utils/format";

/**
 * Customer booking API boundary. No demo records or local status transitions.
 * Booking: { id, status, startsAt: ISO timestamp with timezone, timezone?,
 * barber: {id, firstName, lastName, name?, avatarPhoto?, avatar?, phone?, telegram?},
 * salon: {name?, address?, location?: {lat,lng}},
 * services: [{id?, name, price?, durationMinutes?}], totalPrice?, durationMinutes?,
 * canCancel: boolean, cancellationPolicy?: {text?, deadline?: ISO timestamp, fee?},
 * history?: [{status, at: ISO timestamp, note?}], rejectionReason? }.
 * The server must authorize cancellation, check deadlines and return the updated
 * booking. A production cancellation request should be idempotent on the server.
 */
export async function loadCustomerBookings({ signal } = {}) {
  signal?.throwIfAborted();
  return [];
}
export async function cancelCustomerBooking() {
  throw new Error('Bekor qilish xizmati hali ulanmagan.');
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
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
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
export const barberName = (b) => b.barber?.name || [b.barber?.firstName, b.barber?.lastName].filter(Boolean).join(' ') || 'Barber ma’lumoti kiritilmagan';
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
  return ['pending', 'confirmed'].includes(booking.status) && booking.canCancel === true
    && (!deadline || (timestamp(deadline) != null && timestamp(deadline) > now));
}
export function nearestBooking(bookings, now = Date.now()) {
  return bookings.filter((b) => b.status === 'confirmed' && timestamp(b.startsAt) != null && timestamp(b.startsAt) >= now).sort((a, b) => timestamp(a.startsAt) - timestamp(b.startsAt))[0] || null;
}
export function sortBookings(bookings, now = Date.now()) {
  const upcoming = (b) => ['pending', 'confirmed'].includes(b.status) && timestamp(b.startsAt) != null && timestamp(b.startsAt) >= now;
  return [...bookings].sort((a, b) => Number(upcoming(b)) - Number(upcoming(a)) || (upcoming(a) ? (timestamp(a.startsAt) ?? Infinity) - (timestamp(b.startsAt) ?? Infinity) : (timestamp(b.startsAt) ?? 0) - (timestamp(a.startsAt) ?? 0)));
}
export function validateCancellation(value, id) {
  const booking = normalizeBookings([value])[0];
  if (String(booking.id) !== String(id) || booking.status !== 'cancelled') throw new Error('Server cancellation not confirmed');
  return booking;
}
