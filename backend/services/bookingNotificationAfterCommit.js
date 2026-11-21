'use strict';
// Bookings are committed before attempting any external Telegram delivery.
// A transient bot failure must NOT turn a successful booking into HTTP 500.
async function notifyAfterCommit(notifier, bookingId, event) {
  try {
    await notifier(bookingId, event);
    return true;
  } catch {
    // Never log provider response bodies: they may contain secrets.
    console.error('Post-commit booking notification failed; booking remains committed.');
    return false;
  }
}
module.exports = { notifyAfterCommit };
