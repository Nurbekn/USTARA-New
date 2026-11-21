# v16 — Cancellation idempotency va jadval tranzaksiya chegarasi

## Amalda o‘zgargan qoidalar

* `PUT /api/bookings/:id` with `{ "status": "cancelled" }` and legacy `DELETE /api/bookings/:id` now share the same `bookingStatusService.change` flow.
* Both require an authenticated `customer` or `barber` owning the booking. Other accounts get 404; admin and unrelated accounts cannot cancel through these routes.
* `pending` and `confirmed` can be cancelled; `completed` and `rejected` remain terminal. An already `cancelled` booking returns HTTP 200 with `data.replayed = true`; no extra SQL UPDATE and no second Telegram notification. Other invalid transitions continue returning 400.
* The service holds a per-barber PostgreSQL advisory transaction lock and `FOR UPDATE OF bookings` row lock, so parallel PUT/DELETE attempts cannot each issue a cancellation update.
* Failures to load details **after COMMIT** return a successful cancellation with `snapshot_refresh_required` rather than a misleading error. Telegram delivery is still best-effort; it is NOT a reliable outbox.
* Barber weekly schedule replacement now has `statement_timeout='15s'` as well as `lock_timeout='5s'`.

## Still intentionally NOT implemented

* A barber-defined cancellation cutoff/deadline, possible no-show fee policy, or cancel reason/audit history. There are **no online payments**. Until a policy is explicitly implemented and validated, cancellation remains limited by existing active status/ownership, not a newly invented cutoff.
* Booking refunds (no online payments), external real PostgreSQL/browser/Telegram E2E, holiday/break management.
* Existing confirmed bookings are NOT silently cancelled when a barber changes weekly working hours. Further schedule conflict rules remain work for a later version.

## Verification

Backend `npm test` 342/342; frontend `npm test` 135/135; frontend build PASS; offline audit 185-index/29 migration PASS. These are not proofs of PostgreSQL concurrency or production readiness.
