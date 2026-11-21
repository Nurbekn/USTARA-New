// #6/#99: the customer must confirm exactly the quote that was displayed.
// This is only a UI guard: the server still validates current price, policy,
// duration, slot ownership and idempotency inside the booking transaction.
export const CONFIRMATION_QUOTE_MAX_AGE_MS = 120_000;
const INT4_MAX = 2147483647;
const id = value => Number.isSafeInteger(value) && value > 0 && value <= INT4_MAX;
const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value);
const price = value => /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(value)) && Number(value) > 0;
function payload(input, now) {
  const { barberId, serviceIds, date, selected, quote, duration, policy, quoteReceivedAt, serviceName } = input || {};
  if (!id(barberId) || !Array.isArray(serviceIds) || !serviceIds.length || serviceIds.length > 20
    || new Set(serviceIds).size !== serviceIds.length || !serviceIds.every(id)
    || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date + 'T00:00:00Z'))
    || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date
    || !selected || selected.available !== true || !time(selected.time) || selected.time === '24:00'
    || !time(selected.endTime) || !price(quote)
    || !Number.isSafeInteger(duration) || duration <= 0 || duration > 1200 || duration % 5 !== 0
    || typeof serviceName !== 'string' || !serviceName.trim()
    || !policy || !(policy.cutoff_minutes === null || (Number.isSafeInteger(policy.cutoff_minutes)
      && policy.cutoff_minutes >= 0 && policy.cutoff_minutes <= 10080))
    || (policy.text !== null && policy.text !== undefined && (typeof policy.text !== 'string' || policy.text.length > 280))
    || !Number.isSafeInteger(quoteReceivedAt) || !Number.isSafeInteger(now)
    || quoteReceivedAt > now || now - quoteReceivedAt > CONFIRMATION_QUOTE_MAX_AGE_MS) return null;
  const start = Number(selected.time.slice(0, 2)) * 60 + Number(selected.time.slice(3));
  const end = Number(selected.endTime.slice(0, 2)) * 60 + Number(selected.endTime.slice(3));
  if (start % 5 || end % 5 || end - start !== duration) return null;
  return Object.freeze({
    barberId, serviceIds: Object.freeze([...serviceIds]), date,
    time: selected.time, endTime: selected.endTime, price: String(quote), duration,
    serviceName, policyCutoff: policy.cutoff_minutes, policyText: policy.text || null,
    quoteReceivedAt,
  });
}
export function captureBookingConfirmation(input, now = Date.now()) {
  return payload(input, now);
}
export function isBookingConfirmationCurrent(snapshot, input, now = Date.now()) {
  const fresh = payload(input, now);
  return !!(snapshot && fresh && snapshot.barberId === fresh.barberId
    && snapshot.date === fresh.date && snapshot.time === fresh.time
    && snapshot.endTime === fresh.endTime && snapshot.price === fresh.price
    && snapshot.duration === fresh.duration && snapshot.serviceName === fresh.serviceName
    && snapshot.policyCutoff === fresh.policyCutoff && snapshot.policyText === fresh.policyText
    && snapshot.quoteReceivedAt === fresh.quoteReceivedAt
    && snapshot.serviceIds.length === fresh.serviceIds.length
    && snapshot.serviceIds.every((id, i) => id === fresh.serviceIds[i]));
}
