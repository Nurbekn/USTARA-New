// #52/#100: a lost COMMIT acknowledgement does not mean booking failed.
// The idempotency key must be retained and the customer must reconcile the
// original request rather than unknowingly creating a second reservation.
const RECOVERY_CODES = new Set([
  'booking_result_unknown', 'booking_recovery_required',
  'booking_recovery_owner_unknown', 'booking_in_progress',
]);
export const bookingNeedsRecovery = error => !!error && RECOVERY_CODES.has(error.code);
export const bookingRecoveryMessage = error => error?.code === 'booking_result_unknown'
  ? 'Server bron natijasini tasdiqlay olmadi (COMMIT javobi yo‘q). Bron yaratilgan bo‘lishi mumkin. Yangi bron yubormang; «Bron holatini tekshirish» yoki «Bronlarim» orqali oldingi so‘rovni tekshiring.'
  : null;
