# USTARA v19 — Weekly + dated multiple break rules

- Forward migration `database/migrations/20261203_barber_break_rules.sql` **requires v18**. Install on a controlled test schema before deploying backend. Never run `bootstrap.sql` against an existing production DB.
- The SQL function `ustara_effective_breaks(barber_id, date)` returns ALL intervals clipped to effective day hours: weekly, dated, and the preserved v18 single exception break. Closed days have no slots.
- Availability (`dayHours`, `withBreakBusy`) and write validation (`fitsBooking`) and calendar updates (`invalidActiveBooking`) consume this common function.
- Barber-only endpoints: GET `/api/barbers/break-rules`; PUT `/api/barbers/break-rules/weekly` with `{day_of_week:0..6,breaks:[{start,end}]}`; PUT `/api/barbers/break-rules/dated` with `{date:"YYYY-MM-DD",breaks:[...]}`. Each PUT replaces only that day's rules. `breaks:[]` clears them. Maximum 8 nonoverlapping HH:MM pairs (5-minute aligned) per selected day.
- Schedule changes use barber advisory transaction lock and reject existing active bookings with `409 existing_booking_conflict`; rollback restores old rules. No automatic booking cancellation or repricing.
- **Test limitations:** all unit tests and frontend build passed in v19. No live PostgreSQL, no real concurrency integration or browser E2E. Do not mark migration production-ready without execution and inspection in a safe test DB.
