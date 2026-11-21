import { request } from "../../../api/client.js";

// The browser shows a short-lived quote, not a guaranteed reservation. Never
// display a selectable slot or price that fails the server contract (#6/#99).
const PG_INT4_MAX = 2147483647;
const MAX_DAY_SLOTS = 288; // 24 hours in five-minute increments
const positiveId = (id) => Number.isSafeInteger(id) && id > 0 && id <= PG_INT4_MAX;
const minute = (time) => {
  if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(time)) return NaN;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date;
}
function validPrice(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw)) return false;
  const [units, fraction = ''] = raw.split('.');
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0;
}
function validSlot(slot, duration, candidate = false) {
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return false;
  const start = minute(slot.start), end = minute(slot.end);
  return Number.isFinite(start) && Number.isFinite(end)
    && start >= 0 && start < 1440 && start % 5 === 0 && end <= 1440
    && end % 5 === 0 && end - start === duration
    && (!candidate || typeof slot.available === 'boolean');
}
const slotKey = (slot) => `${slot.start}/${slot.end}`;
function validList(slots, duration, candidate = false) {
  return Array.isArray(slots) && slots.length <= MAX_DAY_SLOTS
    && slots.every(slot => validSlot(slot, duration, candidate))
    && new Set(slots.map(slotKey)).size === slots.length;
}
export async function loadAvailableSlots({ barberId, serviceId, serviceIds, date, token, signal }) {
  const ids = serviceIds ?? [serviceId];
  if (!Array.isArray(ids) || !ids.length || ids.length > 20
      || new Set(ids).size !== ids.length || ids.some(id => !positiveId(id))) {
    throw new Error('Xizmatlarni tanlang.');
  }
  serviceId = ids[0];
  if (!positiveId(barberId) || !validDate(date)) throw new Error("Sartarosh, xizmat yoki sana noto‘g‘ri.");
  const query = new URLSearchParams({ barber_id: String(barberId), ...(serviceIds ? { service_ids: ids.join(',') } : { service_id: String(serviceId) }), date });
  const data = await request("GET", `/api/bookings/available-slots?${query}`, { token, signal });
  if (!data || Array.isArray(data) || data.date !== date
    || !Number.isSafeInteger(data.duration) || data.duration <= 0 || data.duration > 1200 || data.duration % 5 !== 0
    || typeof data.working !== 'boolean'
    || (data.accepting_bookings !== undefined && typeof data.accepting_bookings !== 'boolean')
    || (data.service_ids !== undefined && (!Array.isArray(data.service_ids)
      || data.service_ids.length !== ids.length || data.service_ids.some((id, i) => id !== ids[i])))
    || (data.total_price !== undefined && !validPrice(data.total_price))
    || !validList(data.slots, data.duration)) {
    throw new Error("Serverdan bo‘sh vaqtlar olinmadi.");
  }
  const candidates = data.candidates ?? data.slots.map(slot => ({ ...slot, available: true }));
  if (!validList(candidates, data.duration, true)
      || ((!data.working || data.accepting_bookings === false) && (data.slots.length || candidates.length))) {
    throw new Error('Vaqtlar noto‘g‘ri qaytdi.');
  }
  // Public API may omit occupied candidates entirely. Its advertised free
  // candidates must exactly match the authoritative slots returned by server.
  const actual = new Set(data.slots.map(slotKey));
  const reported = candidates.filter(slot => slot.available).map(slotKey);
  if (reported.length !== actual.size || reported.some(key => !actual.has(key))) {
    throw new Error('Vaqtlar noto‘g‘ri qaytdi.');
  }
  // The booking picker is customer-facing. Even if an older API returns
  // unavailable candidates or raw busy ranges, do not forward that private
  // timetable to the view. The server-provided free subset is authoritative.
  const { busy: _privateBusy, candidates: _privateCandidates, ...publicData } = data;
  return { ...publicData, slots: candidates.filter(slot => slot.available).map(slot => ({
    time: slot.start, endTime: slot.end, available: true,
    reason: "Bo‘sh",
  })) };
}

// Each effect owns a subscription. Cleanup suppresses late success AND failure,
// including transports that finish after cancellation.
export function watchAvailableSlots(params, onState) {
  const controller = new AbortController();
  let active = true;
  Promise.resolve().then(async () => {
    if (!active) return;
    onState({ status: "loading" });
    try {
      const data = await loadAvailableSlots({ ...params, signal: controller.signal });
      if (active) onState({ status: "ready", data, receivedAt: Date.now() });
    } catch (error) {
      if (active) onState({ status: "error", error });
    }
  });
  return () => { active = false; controller.abort(); };
}
