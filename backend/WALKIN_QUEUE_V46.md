# Walk-in queue v46 — lifecycle and ownership

1. Signed-in barber ID must match `barbers.user_id` in both read and write handlers. Write path holds `FOR SHARE OF b,u` **before** advisory barber lock until commit, to serialize with account deactivation.
2. `callNext`: after queue status `waiting → called`, the same transaction cancels provisional, unconfirmed Smart Booking offers and pending Telegram offer outbox, reopens openings. Replayed current call performs the same idempotent cleanup without duplicate event or notification.
3. `finish`: on `served/missed/left`, provisional offers are cancelled, queue-call outbox pending/processing is cancelled, subscriptions/invites removed; confirmed bookings never touched.
4. All cleanup is in the same transaction, failures lead to rollback. Unknown in-flight Telegram messages cannot be revoked after a network send.
5. v46 unit + optional strict local DB staging, see `docs/USTARA_V46_TEST_RUNBOOK.md`. Not production-ready until real tests.
