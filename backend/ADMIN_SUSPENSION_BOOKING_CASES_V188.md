# USTARA v188 — suspended-account booking follow-up

This is an **operator work queue**, not a delivery system. Suspending a customer or barber does **not** cancel or move existing bookings and does **not** send SMS or Telegram. The Admin must separately contact the affected party through a permitted channel and follow the consent-based booking cancellation or reschedule flow.

## How it works

1. An authorized Admin suspends an account using the existing v187 route. Its transaction now writes audit entry + one follow-up case for each active/pending future booking. If the case INSERT fails, the suspension transaction rolls back rather than silently omitting the queue.
2. The new migration backfills cases for currently suspended accounts that have active bookings and a prior `suspend` audit event. It does not change booking rows.
3. Admin opens **Suspend bronlar / Suspended bookings** in the Admin panel. The list shows only booking ID/time/status, case status, and which *role* needs contact. No name, phone, token, contact handle or private notes appear in this queue.
4. `review` records that an operator inspected the case. `attempt` records an **attempt** using one of `phone`, `telegram`, or `other`. It is **not proof of message delivery**. `close` requires a prior review/attempt and is rejected while the booking remains `pending`/`confirmed` **and** the affected account remains suspended. Operators must resolve/confirm the booking through existing consent-based booking workflows or restore the account before closing.
5. Every case action is revision-guarded and appended to an audit log. After an unknown response/timeout, refresh before attempting again. No automatic retry of mutations.

## API (Admin only)

- `GET /api/admin/suspension-cases?status=open&page=1` — statuses `open`, `pending`, `reviewed`, `attempted`, `closed`; 50 per page, max page 100; read-only, no-store.
- `PATCH /api/admin/suspension-cases/:id`:
  - `{ "action":"review", "expectedRevision":0 }`
  - `{ "action":"attempt", "channel":"phone", "expectedRevision":1 }`
  - `{ "action":"close", "expectedRevision":2 }`

All mutation responses explicitly have `notificationsSent:false` and `bookingsChanged:false`.

## Data and rollout safety

- New SQL file: `database/migrations/20261231_admin_suspension_booking_cases.sql` (60th forward migration). Previous migrations are unchanged.
- Case and case-event tables hold operation metadata only; no message body, phone number, location, or private booking notes. Existing bookings remain untouched.
- No live database connection or migration execution occurred in this build. **First apply to isolated/staging PostgreSQL**, inspect migrations and foreign keys, then test Admin login, suspend, case creation, concurrent Admin actions, booking status transitions, and privacy. Do not apply directly to live data without backup and approval.
- Cases for bookings created *after* the suspend snapshot (if another workflow bypasses suspended-account checks) are not automatically reconciled. Add a guarded reconciliation/booking commit fence before production use.
- Closing a case logs operator workflow completion; it does not prove the other party received any notice. End-to-end SMS/Telegram delivery/acknowledgement is **not implemented**.
- This feature **does not** make the whole product production-ready. Full dependency-installed backend tests, PostgreSQL integration tests and browser E2E/build remain necessary.
