// v160: read-only barber day timeline. All clock values are Asia/Tashkent
// wall-clock strings already normalized by the authenticated booking store.
const DATE = /^(20\d{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const STATUSES = new Set(['pending','confirmed','completed','cancelled','rejected']);

export function validTimelineDay(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year,month,day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year,month-1,day);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value;
}

export function shiftTimelineDay(value, days) {
  if (!validTimelineDay(value) || !Number.isInteger(days) || Math.abs(days) > 366) return null;
  const [year,month,day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year,month-1,day+days)).toISOString().slice(0,10);
  return validTimelineDay(next) ? next : null;
}

function safeTitle(value, fallback) {
  return typeof value === 'string' && value.trim() && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim() : fallback;
}

export function buildBookingTimeline(bookings, selectedDay) {
  if (!validTimelineDay(selectedDay)) throw new Error('Invalid timeline day');
  if (!Array.isArray(bookings)) return { items:[], invalidCount:0, sourceValid:false };
  const items = [], seen = new Set();
  let invalidCount = 0;
  for (const booking of bookings) {
    if (!booking || booking.date !== selectedDay) continue;
    const match = typeof booking.time === 'string' ? CLOCK.exec(booking.time) : null;
    if (!Number.isSafeInteger(booking.id) || booking.id <= 0 || seen.has(booking.id)
      || !STATUSES.has(booking.status) || !match || !Number.isInteger(booking.duration)
      || booking.duration < 1 || booking.duration > 1440) {
      invalidCount++;
      continue;
    }
    seen.add(booking.id);
    const start = Number(match[1])*60 + Number(match[2]);
    const end = start + booking.duration;
    items.push({
      id:booking.id, status:booking.status, startMinutes:start,
      startsAt:booking.time,
      endsAt:`${String(Math.floor((end%1440)/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`,
      nextDay:end>=1440,
      customer:safeTitle(booking.customer,'Mijoz'),
      service:safeTitle(booking.service,'Xizmat'),
    });
  }
  items.sort((a,b)=>a.startMinutes-b.startMinutes || a.id-b.id);
  return {items,invalidCount,sourceValid:true};
}
