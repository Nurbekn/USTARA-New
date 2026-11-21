# Local booking API / PostgreSQL integration

## Execution and safety

Run from backend only after explicit authorization to write temporary test rows:

```
USTARA_LOCAL_BOOKING_WRITE_TESTS=I_AUTHORIZE_TEST_DATA node test/local-booking.integration.test.js
```

Without the flag the module skips. It is separate from the ordinary npm test
runner and never creates schema or runs migrations. Set `USTARA_TEST_DATABASE_URL`
to a disposable local `ustara_test_db`. URL target, local host/socket, database
name and session user are checked before writes and again before cleanup;
production mode and unrelated schema/app URL overrides are rejected. PostgreSQL
18.6 must match a running registered local cluster. Secrets are never printed.

Fixtures use new random phones and Booking/Test<run> names, real bcrypt password
hashes, canonical users/profile FKs, two customers, two approved barbers, one pending
barber, four services and weekly schedules. JWTs use a process-only key; actual
Express authentication middleware validates identities against PostgreSQL. This
is booking fixture provisioning, not a repeated registration/login test. The 19
existing authentication scenarios were not rerun.

Copies of this test and the local-auth helper serialize through the same session
advisory lock. Within a run, parallel API/callback actions use real independent
PostgreSQL connections; a separate connection holds the real per-barber advisory
lock until both workers are observed waiting, including chained waiters. No SQL,
clock, booking controller or status service is mocked. Pool sessions use UTC while
booking calendar/schedule expectations use Asia/Tashkent explicitly.

## Actual endpoints and formats

All website calls use the existing Express router, not a test-only API.

| Method / path | Request | Actual response |
| --- | --- | --- |
| GET /api/bookings/available-slots | query barber_id, service_id, date=YYYY-MM-DD; Bearer fixture JWT | 200: date, duration, working, slots:[{start,end}], busy:[{start,end}]; recommendedSlots when working |
| POST /api/bookings | JSON barber_id:number, service_id:number, booking_time:ISO with Z/offset | 201: {message,data:{id,customer_id,barber_id,service_id,booking_time,duration_minutes,status,created_at}} |
| GET /api/bookings | Bearer customer JWT | 200: array of own bookings with split customer/barber names, service_name, booking_time, duration_minutes, booking_end, status, created_at |
| GET /api/bookings/:id | numeric booking ID, Bearer owner JWT | 200: booking read fields including snapshot-based booking_end; 404 for another owner |
| PUT /api/bookings/:id | JSON {status:"confirmed"|"rejected"|"cancelled"|"completed"}; Bearer owner JWT | 200: {message,data:<stored booking>}; rejected actions: {message} |
| DELETE /api/bookings/:id | Bearer owner JWT | 200: {message}; row remains with cancelled status; repeated cancellation 404 |

Observed statuses: available-slots 200/400/401/403/404; create
201/400/401/403/404/409; single read 200/404; list 200; status PUT
200/400/401/403/404; legacy DELETE 200/404. These are expected outcomes, not
unexpected backend errors. Request bodies never include or persist bearer tokens
in the report. All fixtures/IDs and booking-only request/response values are
recorded in a private /tmp report; passwords and JWTs remain memory-only.

## Executed results — 2026-11-14

Historical run against the former `ustara_db` target, PostgreSQL 18.6:
**19 scenarios PASS, 0 FAIL**. It does not validate the current test target. Node counts
20 tests including the parent. **78 HTTP requests**; no skipped runtime cases.

| Scenario | Result |
| --- | --- |
| Working weekday, day off, opening/end boundary, 30 vs 60-minute availability | PASS |
| Past working date and elapsed current-day starts excluded | PASS |
| Invalid calendar/service, foreign service, unapproved barber, anonymous slots | PASS |
| Create, ignored forged customer/duration, UTC/+05 equivalence, snapshot read | PASS |
| Unlinked barber booking without Telegram notification | PASS |
| Invalid/missing/foreign service, pending barber, noncustomer/anonymous create | PASS |
| Day off, outside shift, insufficient remaining time, past/ambiguous time | PASS |
| Pending/confirmed occupancy, duplicate/partial overlap, touching boundaries | PASS |
| Ownership/role, own cancellation, invalid alias/transition, early completion | PASS |
| Rejected releases slot; repeated rejection cannot reactivate | PASS |
| Completed occupancy and actual elapsed-duration completion | PASS |
| Legacy DELETE ownership, retained cancelled history and repeat rejection | PASS |
| Service 60→15 edit preserves old 60-minute snapshot/conflict; new snapshot 15 | PASS |
| Concurrent creates for same barber/slot, one winner, no active overlaps | PASS |
| Concurrent confirm vs reject, one valid resulting transition | PASS |
| Telegram confirm/reject and website share actual stored status | PASS |
| Foreign-owner, spoofed and stale callback rejected | PASS |
| Duplicate parallel Telegram callbacks, one successful transition | PASS |
| Telegram transport error logged; HTTP creation and committed booking survive | PASS |

Completion has two distinct tests: a deliberately prepared future completed row
checks status-based availability filtering; a separate booking is confirmed over
HTTP, then only that owned row's time is moved into the past before completing
over HTTP. No global clock changes or business-rule bypass is claimed. Weekly
schedules and future dates are computed from the real Tashkent database calendar.

## Parallel and transaction evidence

- Same-slot creates: **201 + 409**, exactly one active row; interval-overlap query
  found zero active overlaps for all run-owned barbers.
- Parallel website confirm/reject: **200 + 400**; loser is an invalid transition
  after the winning transition, per the existing API contract.
- Duplicate Telegram confirm: one successful answer and one already-reviewed
  alert; final booking remains confirmed.
- Separate waiting backend PIDs were captured for each pair. Advisory locks and
  normal production BEGIN/COMMIT/ROLLBACK code execute on real PostgreSQL.
- Invalid create requests leave no partial booking at the attempted slot.

## Telegram test transport

Only createTelegramApi's transport is replaced in the test process. The real
notification builder, update handler, callback handler and bookingStatusService
are used. There is no HTTP callback endpoint to invent: callback updates enter
through the actual createUpdateHandler dispatch as they do from the bot worker;
HTTP status for callback-only actions is not applicable. Their API answers and
DB state are recorded separately.

16 sendMessage attempts observed the booking through a separate connection,
proving visibility after COMMIT. Messages include customer/service/time/Tashkent
fields and confirmed/rejected inline actions. Successful callbacks remove buttons.
The one injected transport failure is caught/logged by the real notifier and the
booking stays pending. No external fetch, SMS operation, Telegram API, polling
worker or real linking-token flow ran. Links are run-owned database fixtures.

## Exact-ID cleanup and preservation

Every fixture INSERT RETURNING primary key and every HTTP-created booking ID is
persisted immediately in the private report's ledger. Response-lost children, if
any, are discovered only under newly created customer/barber IDs and added to the
ledger before cleanup. Every cleanup DELETE has an exact primary-key ANY(ID[])
predicate; link cleanup uses exact barber_id PKs. No blanket DELETE, phone-prefix
cleanup, schema drop, migration or admin mutation occurs.

Actual cleanup deleted 18 bookings, 2 Telegram links, 4 services, 6 schedule rows,
2 customer profiles, 3 barber profiles and 5 users. All ledger IDs were absent
after cleanup. All original row fingerprints, singleton admin, migration history,
schema/constraint/index definitions and manifest comments matched the baseline.
Identity sequences advanced normally and were not reset. The /tmp report keeps
nonsecret IDs for review; forced process termination still requires manual review
of that ledger because finally hooks cannot survive SIGKILL.

## Issues, files and limits

No unexpected backend failure was identified in the executed scenarios; no
production business logic was changed. New files only:

- test/local-booking.integration.test.js
- test/helpers/localBooking.js
- test/LOCAL_BOOKING.md

Full actual requests/responses, assertion outcomes, PID evidence, exact ID ledger
and cleanup flags: /tmp/ustara-local-booking-vTt17N/report.json. Human-readable full
results: /tmp/ustara-local-booking-vTt17N/RESULTS.md.

Real Telegram delivery/polling, real SMS, process-crash recovery, sustained load and
noncooperating manual SQL/import writers are not tested. Current overlap protection
is the documented cooperative application advisory lock, not a database exclusion
constraint. These limits are not marked PASS.
