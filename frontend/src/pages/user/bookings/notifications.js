import { barberName, dateLabel } from './model.js';

const STATUS_LABEL = Object.freeze({
  pending: 'Bron so‘rovingiz yuborildi',
  confirmed: 'Broningiz tasdiqlandi',
  completed: 'Tashrif yakunlandi',
  cancelled: 'Bron bekor qilindi',
  rejected: 'Bron rad etildi',
});

// This is a booking-status inbox, not a fabricated push-event history.
// All records come from the authenticated customer's booking API.
export function bookingStatusItems(bookings, maxItems = 8) {
  if (!Array.isArray(bookings)) return [];
  return bookings
    .filter((b) => b && Number.isSafeInteger(b.id) && STATUS_LABEL[b.status] && typeof b.startsAt === 'string')
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .slice(0, maxItems)
    .map((booking) => ({
      id: booking.id,
      title: STATUS_LABEL[booking.status],
      detail: `${barberName(booking)} · ${dateLabel(booking.startsAt, booking.timezone)}`,
      url: `/user/bookings?booking=${booking.id}`,
    }));
}
