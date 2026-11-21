// v86: Trust a booking confirmation only after checking the saved server row.
// This protects the success screen; the server remains authoritative about
// availability, ownership and price within the transaction.
const MAX_ID = 2147483647;
const validId = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_ID;
const validDate = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
const STATUSES = Object.freeze({
  pending: {title:'Bron so‘rovi yuborildi', active:true},
  confirmed: {title:'Bron tasdiqlandi', active:true},
  completed: {title:'Tashrif yakunlangan', active:false},
  cancelled: {title:'Avvalgi bron bekor qilingan', active:false},
  rejected: {title:'Bron rad etilgan', active:false},
});
function cents(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(value))) return null;
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
}
function invalidReceipt() {
  return Object.assign(new Error('Booking javobini qayta ishlashda xatolik yuz berdi. Qayta yuborishdan oldin bronlaringizni tekshiring.'),
    {status:0, code:'booking_confirmation_unverified'});
}
export function verifyBookingReceipt(booking, {
  barberId, serviceIds, serviceId, bookingTime, expectedTotalPrice,
  expectedDurationMinutes, customerProfileId,
} = {}) {
  if (!booking || typeof booking !== 'object' || Array.isArray(booking) ||
      !validId(booking.id) || !validId(booking.barber_id) ||
      !validId(booking.service_id) || !Object.hasOwn(STATUSES, booking.status) ||
      !validDate(booking.booking_time) || !Number.isSafeInteger(booking.duration_minutes) ||
      booking.duration_minutes <= 0 || booking.duration_minutes > 1200 ||
      booking.duration_minutes % 5 !== 0 ||
      (barberId !== undefined && booking.barber_id !== barberId) ||
      (serviceId !== undefined && booking.service_id !== serviceId) ||
      (bookingTime !== undefined && Date.parse(booking.booking_time) !== Date.parse(bookingTime)) ||
      (customerProfileId !== undefined && booking.customer_id !== customerProfileId) ||
      (expectedDurationMinutes !== undefined && booking.duration_minutes !== expectedDurationMinutes) ||
      (booking.total_price != null && (cents(booking.total_price) === null || cents(booking.total_price) <= 0)) ||
      (expectedTotalPrice !== undefined && (booking.total_price == null ||
        cents(booking.total_price) !== cents(expectedTotalPrice)))) {
    throw invalidReceipt();
  }
  if (serviceIds !== undefined && (!Array.isArray(serviceIds) || !serviceIds.length ||
    booking.service_id !== serviceIds[0] ||
    (serviceIds.length > 1 && (!Array.isArray(booking.services) ||
      booking.services.length !== serviceIds.length)))) throw invalidReceipt();
  if (booking.services !== undefined && (!Array.isArray(booking.services) || booking.services.length > 20 ||
    booking.services.some(s => !s || typeof s !== 'object' || !validId(s.id) ||
      (s.name != null && (typeof s.name !== 'string' || s.name.length > 200)) ||
      (s.price != null && cents(s.price) === null)) ||
    new Set(booking.services.map(s => s.id)).size !== booking.services.length)) throw invalidReceipt();
  if (serviceIds && booking.services?.length && (booking.services.length !== serviceIds.length ||
    booking.services.some((s,i) => s.id !== serviceIds[i]))) throw invalidReceipt();
  return booking;
}
export function bookingReceiptView(booking) {
  const row = verifyBookingReceipt(booking);
  const start = Date.parse(row.booking_time);
  const end = start + row.duration_minutes * 60000;
  const status = STATUSES[row.status];
  return {
    title:status.title, active:status.active, id:row.id, start, end,
    duration:row.duration_minutes, amount:row.total_price ?? null,
    serviceNames:Array.isArray(row.services) ? row.services.filter(s=>typeof s.name === 'string' && s.name.trim()).map(s=>s.name.trim()).join(' + ') : '',
  };
}
