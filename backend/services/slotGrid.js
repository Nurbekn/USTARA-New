'use strict';

// One source of truth for single- and multi-service availability. The public
// booking API only accepts start times on five-minute boundaries.
const STEP_MINUTES = 5;
function slotCandidates({ workStart, workEnd, duration, nowMinutes, busy = [] }) {
  if (![workStart, workEnd, duration, nowMinutes].every(Number.isFinite)
      || !Number.isInteger(duration) || duration <= 0 || duration % STEP_MINUTES !== 0
      || workStart < 0 || workEnd > 1440 || workStart >= workEnd
      || !Array.isArray(busy) || busy.some(({start, end}) =>
        !Number.isFinite(start) || !Number.isFinite(end) || start >= end)) {
    throw new TypeError('Slot uchun ish vaqti, davomiylik yoki band vaqt noto‘g‘ri');
  }
  const slots = [];
  // Start at the first real five-minute boundary inside the working hours,
  // even when legacy schedules were entered at e.g. 09:03.
  for (let start = Math.ceil(workStart / STEP_MINUTES) * STEP_MINUTES;
    start + duration <= workEnd; start += STEP_MINUTES) {
    const end = start + duration;
    const collides = busy.some((item) => start < item.end && end > item.start);
    slots.push({ start, end, available: start > nowMinutes && !collides });
  }
  return slots;
}
module.exports = { STEP_MINUTES, slotCandidates };
