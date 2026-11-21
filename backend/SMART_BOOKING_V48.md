# Smart Booking v48 — delivery consistency

A terminal Smart Booking offer transition must cancel unsent Telegram offer notifications **in the same PostgreSQL transaction**. All new paths reuse `cancelPendingOfferNotices(client, openingId)`. This updates only `smart_booking_telegram_outbox.status='pending'`; it does not attempt to recall already sent or uncertain messages. The helper uses the opening id to cover legacy stale notices tied to the opening, not merely the most recent offer.

Covered paths: worker slot closes, pending offer expiry, accepted grace expiry/closed, stale or conflicting customer decision, and barber cancel or cancelled-state replay. Errors roll back the entire transaction. The confirmed booking data remains untouched. This is a unit-tested code change, **not a real DB integration pass**. See `docs/USTARA_V48_TEST_RUNBOOK.md`.
