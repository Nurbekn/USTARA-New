'use strict';
// PostgreSQL exclusion errors and transaction timeouts may originate in the
// API, background workers or manual bookings. Return a stable, non-leaking 409.
const { BookingSelectionError } = require('./bookingSelection');
function bookingDbConflict(error) {
  // PostgreSQL deadlock and serialization retry are also temporary failures.
  // Both can happen with independent transactions despite application locks.
  if (['55P03', '57014', '40P01', '40001'].includes(error?.code)) {
    return new BookingSelectionError(409, 'Bronlash tizimi vaqtincha band. Qayta urinib ko‘ring.', 'booking_busy');
  }
  if (error?.code !== '23P01') return null;
  if (error.constraint === 'bookings_customer_time_excl') {
    return new BookingSelectionError(409,
      'Sizning boshqa broningiz bilan vaqt to‘qnashyapti.', 'customer_time_conflict');
  }
  // Known barber constraint and unknown 23P01 both fail closed; no PG detail
  // or constraint name is ever included in HTTP response.
  return new BookingSelectionError(409, 'Bu vaqt band.', 'booking_conflict');
}
module.exports = { bookingDbConflict };
