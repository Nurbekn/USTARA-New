# USTARA v18 — Calendar & schedule integrity

## What changed

- A verified barber may define **date-specific day off**, **vacation closure for up to 90 dates per request**, or **special opening/closing hours with one optional break** using `GET|PUT /api/barbers/calendar-exceptions` and `DELETE /api/barbers/calendar-exceptions/:date`. The barber owns only their own rows.
- All calendar dates and timestamps use **Asia/Tashkent** local dates, not the browser's device timezone.
- Database migration `20261202_barber_calendar_exceptions.sql` adds the exception table with `CHECK` constraints, unique barber/date key, cascade ownership and `ustara_effective_day_schedule(integer,date)`.
- All three booking paths (single, multi, reschedule/service edit) and all slot-discovery paths consult this function. A special date overrides weekly hours; a closed date returns no work schedule; a break blocks any service overlapping it.
- The current barber weekly schedule replacement and new calendar exception changes run under a barber-scoped transaction advisory lock. They **roll back on an active appointment that would become invalid**; response is 409 `existing_booking_conflict`. No silent cancellation/retiming.
- Public availability still shows only availability, not the names of customers. New calendar editing is barber-only.

## Important limits / unverified assumptions

- **Recurring weekly breaks**, several independent breaks in one day, and automatic rebooking/notification of displaced clients are NOT implemented. One-off breaks only. A barber with an existing booking must contact customer and reschedule/cancel it before closing that slot.
- Code-level conflict checks share the advisory lock across app booking writers; direct uncoordinated SQL writes are outside that lock. Existing database overlap constraints still apply. A robust live PostgreSQL concurrency E2E test remains necessary.
- Previous migrations #1–#30 and this #31 **were not run on a live database in this build environment**. Run the forward migration in a separately approved *test database* with backup before deploying; never run a fresh bootstrap against a live database. `bootstrap/verify.sql` checks the new schema and migration inventory on a truly fresh test schema.
- Web unit tests do NOT replace mobile browser, real Telegram and PostgreSQL integration tests.

## Tests

From the unpacked ZIP, after installing dependencies independently:

```sh
cd backend && npm test
cd ../frontend && npm test
node node_modules/vite/bin/vite.js build
cd ../backend && node scripts/audit-phase1.js
```

Do not package `.env`, API keys, credentials, `node_modules` or `frontend/dist`.
