import { loadAvailableSlots } from './availableSlots.js';

// #92: the overview is informative, never a reservation or a cached quote.
export const WEEK_DAYS = 7;
export const WEEK_MAX_CONCURRENT = 2;
const MAX_ID = 2147483647;
const validId = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_ID;
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
};

export function availabilityWeekDates(dates, index = 0) {
  if (!Array.isArray(dates) || ![0, 1].includes(index)) return [];
  return dates.slice(index * WEEK_DAYS, (index + 1) * WEEK_DAYS);
}

export function availabilityDaySummary(date, data) {
  if (!data || data.date !== date || !Array.isArray(data.slots)) {
    throw new Error('Serverdagi kun ma’lumoti mos emas.');
  }
  if (data.accepting_bookings === false) return { date, status: 'paused' };
  if (!data.working) return { date, status: 'closed' };
  if (!data.slots.length) return { date, status: 'empty' };
  return { date, status: 'available', count: data.slots.length, first: data.slots.map(slot => slot.time).sort()[0] };
}

// Never infer an unverified slot from a different barber, service or week.
// Callers must only reuse these snapshots for a retry within the SAME context.
function validInitialDays(dates, entries) {
  return Array.isArray(entries) && entries.length === WEEK_DAYS && entries.every((entry, index) => {
    if (!entry || entry.date !== dates[index] || !['available', 'closed', 'paused', 'empty', 'error'].includes(entry.status)) return false;
    if (entry.status !== 'available') return true;
    return Number.isSafeInteger(entry.count) && entry.count > 0 && entry.count <= 288
      && typeof entry.first === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.first);
  });
}

/**
 * Seven bounded public GETs. On an explicit failed-day retry, accept only an
 * exact, locally checked prior result and re-query ONLY failed dates. An old
 * request can never publish after cleanup, including after a partial failure.
 * Day-specific selection always fetches a separate current server quote.
 */
export function watchAvailabilityWeek({ barberId, serviceIds, dates, token, loader = loadAvailableSlots, initialDays = null }, onState) {
  if (!Array.isArray(dates) || dates.length !== WEEK_DAYS || !dates.every(validDate)
    || dates.some((date, index) => index > 0 && Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dates[index - 1]}T00:00:00Z`) !== 86400000)) {
    throw new RangeError('Ketma-ket 7 ta haqiqiy sana talab qilinadi.');
  }
  if (!validId(barberId) || !Array.isArray(serviceIds) || !serviceIds.length || serviceIds.length > 20
    || new Set(serviceIds).size !== serviceIds.length || !serviceIds.every(validId)
    || typeof onState !== 'function' || typeof loader !== 'function') {
    throw new TypeError('Sartarosh, xizmat va holat qabul qiluvchisi kerak.');
  }
  if (initialDays !== null && !validInitialDays(dates, initialDays)) {
    throw new TypeError('Faqat mos haftaning tekshirilgan natijasidan qayta sinash mumkin.');
  }
  const controller = new AbortController();
  let active = true;
  let next = 0;
  const days = dates.map((date, index) => initialDays && initialDays[index].status !== 'error'
    ? { ...initialDays[index] } : { date, status: 'loading' });
  const indexes = dates.map((_, index) => index).filter(index => days[index].status === 'loading');
  const publish = () => { if (active) onState({ days: days.map(day => ({ ...day })), complete: days.every(day => day.status !== 'loading') }); };
  Promise.resolve().then(async () => {
    if (!active) return;
    publish();
    const worker = async () => {
      while (active && next < indexes.length) {
        const i = indexes[next++];
        try {
          const data = await loader({ barberId, serviceIds, date: dates[i], token, signal: controller.signal });
          if (!active) return;
          days[i] = availabilityDaySummary(dates[i], data);
        } catch (_error) {
          if (!active) return;
          days[i] = { date: dates[i], status: 'error' };
        }
        publish();
      }
    };
    await Promise.all(Array.from({ length: Math.min(WEEK_MAX_CONCURRENT, indexes.length) }, () => worker()));
  });
  return () => { active = false; controller.abort(); };
}

// The CTA may jump to a verified day, not auto-select a time or create a booking.
export function nextVerifiedAvailableDay(days) {
  if (!Array.isArray(days)) return null;
  const found = days.find(day => day && validDate(day.date) && day.status === 'available'
    && Number.isSafeInteger(day.count) && day.count > 0);
  return found?.date ?? null;
}
