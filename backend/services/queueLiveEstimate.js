'use strict';
// Walk-in tickets have no selected service. Show a rough RANGE, never a booked appointment time.
const roundUp5 = value => Math.ceil(value / 5) * 5;
const roundDown5 = value => Math.floor(value / 5) * 5;
function typicalMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(90, Math.max(5, roundUp5(n)));
}
function estimateWait(position, hasCalled, typical = 20) {
  if (!Number.isSafeInteger(position) || position < 1) return null;
  const mins = typicalMinutes(typical);
  const ahead = position - 1;
  const min = roundDown5(ahead * mins * 0.75);
  const max = roundUp5((ahead + 1 + (hasCalled ? 1 : 0)) * mins * 1.5);
  // A very long queue cannot be estimated credibly from average service times.
  // Keep the waiting count but do not advertise a days-long numeric ETA.
  if (!Number.isSafeInteger(max) || max > 24 * 60) return null;
  return { min_minutes: min, max_minutes: max, approximate: true };
}
module.exports = { estimateWait, typicalMinutes };
