// TODO: replace local demo reservations with a server-authorized booking API.
import { sampleBarbers, sampleBarberDetails } from '../../home/sampleData';

const KEY = 'ustara-demo-bookings-v1';
const EVENT = 'ustara-demo-bookings-changed';
const DAY = 86400000;
export const BOOKING_DAYS = 14;
export const SLOT_MINUTES = 15;
const ACTIVE = ['pending', 'confirmed'];
const minutes = (time) => time.split(':').reduce((hours, value, index) => index ? hours + Number(value) : Number(value) * 60, 0);
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const overlaps = (a, b, c, d) => a < d && c < b;
export const bookingTimestamp = (date, time) => Date.parse(`${date}T${time}:00+05:00`);

export function tashkentDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function bookingDates(now = Date.now()) {
  const noon = bookingTimestamp(tashkentDate(now), '12:00');
  return Array.from({ length: BOOKING_DAYS }, (_, index) => tashkentDate(noon + index * DAY));
}

export function getDemoBookingsSnapshot() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function readDemoBookings(snapshot = getDemoBookingsSnapshot()) {
  try {
    const parsed = JSON.parse(snapshot);
    return Array.isArray(parsed) ? parsed.filter((item) => item?.isDemo === true && typeof item.id === 'string' && typeof item.viewerId === 'string' && Number.isFinite(Date.parse(item.startsAt)) && Number.isFinite(Date.parse(item.endsAt))) : [];
  } catch { return []; }
}

export function subscribeDemoBookings(listener) {
  const storage = (event) => { if (event.key === KEY || event.key === null) listener(); };
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', storage); };
}

export function dailySlots({ barberId, date, duration, bookings = readDemoBookings(), now = Date.now() }) {
  const details = sampleBarberDetails[barberId];
  if (!details || !Number.isFinite(duration) || duration <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const weekday = (new Date(bookingTimestamp(date, '12:00')).getUTCDay() + 6) % 7;
  const hours = details.hours[weekday];
  if (!hours || hours.isOff) return [];
  const slots = [];
  for (let start = minutes(hours.start); start + duration <= minutes(hours.end); start += SLOT_MINUTES) {
    const time = clock(start);
    const startAt = bookingTimestamp(date, time);
    const endAt = startAt + duration * 60000;
    const busy = details.busyRanges.some((range) => overlaps(start, start + duration, minutes(range.start), minutes(range.end)))
      || bookings.some((booking) => booking.barber?.id === barberId && ACTIVE.includes(booking.status) && overlaps(startAt, endAt, Date.parse(booking.startsAt), Date.parse(booking.endsAt)));
    slots.push({ time, endTime: clock(start + duration), available: startAt > now && !busy, reason: startAt <= now ? 'Vaqti o‘tgan' : busy ? 'Band' : 'Bo‘sh' });
  }
  return slots;
}

function writeBookings(bookings) {
  localStorage.setItem(KEY, JSON.stringify(bookings));
  window.dispatchEvent(new Event(EVENT));
}

async function withBookingLock(action) {
  return typeof navigator !== 'undefined' && navigator.locks?.request ? navigator.locks.request(KEY, action) : action();
}

export async function createDemoBooking({ viewerId, customerName, barberId, serviceIds, date, time }) {
  return withBookingLock(() => {
    const barber = sampleBarbers.find((item) => item.id === barberId);
    const details = sampleBarberDetails[barberId];
    const ids = [...new Set(serviceIds)];
    const services = details?.services.filter((service) => ids.includes(service.id)) || [];
    if (!viewerId || !barber || !services.length || services.length !== ids.length || !bookingDates().includes(date)) throw new Error('Xizmat va sanani qayta tanlang.');
    const duration = services.reduce((sum, service) => sum + service.duration, 0);
    const bookings = readDemoBookings();
    const selected = dailySlots({ barberId, date, duration, bookings }).find((slot) => slot.time === time);
    if (!selected?.available) throw new Error('Bu vaqt hozir band yoki vaqti o‘tgan. Boshqa vaqt tanlang.');
    const startsAt = new Date(bookingTimestamp(date, time)).toISOString();
    const now = new Date().toISOString();
    const booking = {
      id: `demo-${crypto.randomUUID()}`, isDemo: true, viewerId, customerName,
      status: 'pending', startsAt, endsAt: new Date(Date.parse(startsAt) + duration * 60000).toISOString(), timezone: 'Asia/Tashkent',
      barber: { id: barber.id, name: barber.name, avatarPhoto: barber.avatarPhoto || '' },
      salon: { name: barber.salonName, address: barber.address, location: barber.location },
      services: services.map((service) => ({ id: service.id, name: service.name, price: service.price, durationMinutes: service.duration })),
      totalPrice: services.reduce((sum, service) => sum + service.price, 0), durationMinutes: duration,
      date, time, endTime: selected.endTime, canCancel: true,
      cancellationPolicy: { deadline: startsAt, fee: 0, text: 'Namuna bronni boshlanishidan oldin bepul bekor qilishingiz mumkin.' },
      history: [{ status: 'pending', at: now, note: 'Namuna buyurtma brauzerda saqlandi. Haqiqiy ustaga yuborilmagan.' }],
    };
    writeBookings([...bookings, booking]);
    return booking;
  });
}

export async function cancelDemoBooking(id, viewerId) {
  return withBookingLock(() => {
    const bookings = readDemoBookings();
    const booking = bookings.find((item) => item.id === id && item.viewerId === viewerId);
    if (!booking || !ACTIVE.includes(booking.status) || Date.parse(booking.startsAt) <= Date.now()) throw new Error('Bu namuna bronni hozir bekor qilib bo‘lmaydi.');
    const updated = { ...booking, status: 'cancelled', canCancel: false, history: [...(booking.history || []), { status: 'cancelled', at: new Date().toISOString(), note: 'Mijoz namuna bronni bekor qildi.' }] };
    writeBookings(bookings.map((item) => item.id === id ? updated : item));
    return updated;
  });
}
