// v101 — #105: display-only alternatives AFTER a confirmed cancellation.
// Nothing here creates or reserves a booking. A fresh server quote is required
// when the customer chooses a time in the ordinary booking flow.
const MAX_ID = 2147483647;
const positiveId = id => Number.isSafeInteger(id) && id > 0 && id <= MAX_ID;
const dateDay = str => Date.parse(`${str}T00:00:00.000Z`);
const tashkentDay = ms => {
  const shifted = new Date(ms + 5 * 60 * 60 * 1000);
  if (!Number.isFinite(shifted.getTime())) throw new Error('Hozirgi vaqt yaroqsiz.');
  return shifted.toISOString().slice(0, 10);
};
// Do not interpret a browser-local timestamp as an appointment in Tashkent.
const explicitInstant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const day = value.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00.000Z`);
  // JS Date.parse can silently roll e.g. February 31st into March.
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day
      || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59
      || (value[16] === ':' && Number(value.slice(17, 19)) > 59)) return NaN;
  return Date.parse(value);
};
const timeMinutes = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;


export function alternativeSelection(booking) {
  const barberId = booking?.barber?.id;
  const services = booking?.services;
  if (!positiveId(barberId) || !Array.isArray(services) || services.length < 1 || services.length > 20) return null;
  const serviceIds = services.map(item => item?.id);
  if (serviceIds.some(id => !positiveId(id)) || new Set(serviceIds).size !== serviceIds.length) return null;
  return { barberId, serviceIds };
}

export function alternativeDates(booking, nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) throw new Error('Hozirgi vaqt yaroqsiz.');
  const original = explicitInstant(booking?.startsAt);
  if (!Number.isFinite(original)) return [];
  // Keep suggestions close to the cancelled appointment, but never in the past.
  const start = Math.max(dateDay(tashkentDay(original)), dateDay(tashkentDay(nowMs)));
  return Array.from({ length: 3 }, (_, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
}

export function alternativeBookingUrl(booking) {
  const selection = alternativeSelection(booking);
  return selection
    ? `/user/barbers/${selection.barberId}?services=${encodeURIComponent(selection.serviceIds.join(','))}`
    : '/user/explore';
}

// Discovery option ONLY after a cancelled or rejected booking. It does not transfer a
// booking, carry private client data or promise equivalent services/availability.
export function alternativeBarbersDiscoveryUrl(booking) {
  return ['cancelled', 'rejected'].includes(booking?.status) ? '/user/explore?type=barbers' : null;
}

export async function collectCancellationAlternatives(booking, { fetchSlots, signal, nowMs = Date.now(), limit = 6 } = {}) {
  if (typeof fetchSlots !== 'function') throw new TypeError('fetchSlots is required');
  const selection = alternativeSelection(booking);
  if (!selection) return { slots: [], unavailable: true, reason: 'service_unavailable' };
  // API consumers must not search replacement slots for an active, un-cancelled booking.
  if (booking?.status != null && booking.status !== 'cancelled')
    return { slots: [], unavailable: true, reason: 'not_cancelled' };
  const dates = alternativeDates(booking, nowMs);
  if (!dates.length) return { slots: [], unavailable: true, reason: 'date_unavailable' };
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 12) throw new Error('Limit noto‘g‘ri.');
  const slots = []; let succeeded = 0; let failed = 0;
  for (const date of dates) {
    signal?.throwIfAborted();
    let result;
    try {
      result = await fetchSlots({ ...selection, date, signal });
    } catch (error) {
      // Never conceal session failures or cancellation, even if a prior day worked.
      if (signal?.aborted || error?.name === 'AbortError' || [401, 403].includes(error?.status) || error?.code === 'session_changed') throw error;
      failed++;
      continue;
    }
    signal?.throwIfAborted(); // A resolved transport can race with a logout/unmount.
    if (!result || result.date !== date || typeof result.working !== 'boolean'
        || (result.accepting_bookings !== undefined && typeof result.accepting_bookings !== 'boolean')
        || !Array.isArray(result.slots) || result.slots.length > 288
        || (result.duration !== undefined && (!Number.isSafeInteger(result.duration)
          || result.duration < 5 || result.duration > 1200 || result.duration % 5 !== 0))) {
      failed++;
      continue;
    }
    succeeded++;
    if (result.working && result.accepting_bookings !== false) {
      // An API can return slots out of order; suggestions must be the nearest first.
      for (const slot of [...result.slots].sort((a, b) => timeMinutes(a?.time) - timeMinutes(b?.time))) {
        if (slot?.available === false) continue;
        const time = slot?.time;
        const startMinute = timeMinutes(time);
        if (!Number.isFinite(startMinute) || startMinute % 5 !== 0) continue;
        // If a response includes an end or duration, it must describe that same slot.
        if (slot.endTime !== undefined) {
          const endMinute = slot.endTime === '24:00' ? 1440 : timeMinutes(slot.endTime);
          if (!Number.isFinite(endMinute) || endMinute <= startMinute || endMinute % 5 !== 0
              || (result.duration !== undefined && endMinute - startMinute !== result.duration)) continue;
        }
        const instant = Date.parse(`${date}T${time}:00+05:00`);
        // The exact cancelled start is not an "alternative", even if newly freed.
        if (!Number.isFinite(instant) || instant <= nowMs || instant === explicitInstant(booking.startsAt)) continue;
        if (!slots.some(item => item.date === date && item.time === time)) slots.push({ date, time });
        if (slots.length >= limit) break;
      }
    }
    if (slots.length >= limit) break;
  }
  signal?.throwIfAborted();
  if (succeeded === 0 && failed > 0) throw new Error('Bo‘sh vaqtlarni tekshirib bo‘lmadi.');
  return { slots, unavailable: false, checkedDays: succeeded, partial: failed > 0 };
}
