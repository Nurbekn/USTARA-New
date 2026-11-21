# Local Barber API PostgreSQL integration

## Run and safety

From backend, only after explicit authorization to create temporary test rows:

```
USTARA_LOCAL_BARBER_WRITE_TESTS=I_AUTHORIZE_TEST_DATA node test/local-barber.integration.test.js
```

Without the flag, this file skips. Set `USTARA_TEST_DATABASE_URL` to disposable
local `ustara_test_db`; the shared helper verifies host/socket, database and
session user before writes and cleanup. No test writes to `ustara_db`. PostgreSQL
18.6 and a running registered local cluster are required. No schema/migration
or `.env` changes occur. The actual Express app, routes,
controllers, services, identity middleware and pg.Pool are used. Fixtures have
new random phones, canonical user/profile links, real bcrypt hashes and
process-only JWTs. Approved fixture barbers are provisioned directly; no existing
admin account or real user's credentials are used.

localBarber reuses only the existing safety/helper code, not the authentication
or booking test suites. Shared-helper temporary directories retain the
ustara-local-booking- prefix; the report module explicitly identifies Barber API.
The authentication 19-case suite and booking 19-case suite were not rerun.

## Actual routes and contracts

| Endpoint | Request | Actual successful response |
| --- | --- | --- |
| GET /api/barbers/me | Bearer barber JWT | {barber:{id,first_name,last_name,phone,verification_status,created_at}} |
| GET /api/barbers/:id | approved profile ID; intentionally public | {id,first_name,last_name,phone,created_at}; pending profile 404 |
| PUT /api/barbers/:id | own profile ID; first_name,last_name or firstName,lastName; optional unchanged phone | {message,data:{id,first_name,last_name,created_at,phone}} |
| POST /api/services | {name:string,price:number,duration_minutes:integer} | 201 {message,data:<service row>} |
| GET /api/services?barber_id=:id | authenticated user, explicit barber_id | [{id,name,price,duration_minutes,barber_id}] |
| GET /api/services/:id | authenticated user | full service row |
| PUT /api/services/:id | all name,price,duration_minutes fields; owning approved barber | {message,data:<updated service row>} |
| DELETE /api/services/:id | owning approved barber | {message}; booked service 409 via FK |
| PUT /api/barbers/working-hours | {working_hours:[{day_of_week:0..6,start_time:"HH:MM",end_time:"HH:MM"}]} | {message} |
| GET /api/barbers/working-hours | own barber JWT | [{day_of_week,start_time:"HH:MM:SS",end_time:"HH:MM:SS"}] |
| POST /api/barbers/telegram/start | own barber JWT; no target barber/chat field | {botUrl,token,expiresAt} |
| GET /api/barbers/telegram/status | own barber JWT | {botUrl,linked,linkedAt} |
| DELETE /api/barbers/telegram | own barber JWT | {linked:false} |

Service NUMERIC price is returned as a JSON string by pg, while requests require
a JSON number. Profile updates support only split names; extra ownership,
specialty and verification fields are ignored. Phone changes need separate OTP.
Schedule PUT replaces the full week, not a single-day patch. Omitting a weekday
makes it a day off; an entirely empty week currently returns 400. The schedule
and Telegram self routes derive identity only from JWT: body/query barber_id
cannot redirect them. Public profile/service reads are not incorrectly tested
as forbidden private endpoints.

For booking snapshot preservation, one POST /api/bookings and one
GET /api/bookings/available-slots are used as dependent fixtures, not a rerun of
the previous booking suite.

## Executed results — 2026-11-14

Historical run against the former local `ustara_db`, PostgreSQL 18.6.
These results do not validate the current test target: **22 scenarios: 19 PASS, 3 FAIL.**
**109 real HTTP requests**, 11 real bot-handler consume attempts through a mock
sendMessage transport, no skipped runtime scenarios. Node includes a failed parent:
19 passed / 4 failed of 23 total. The suite exits nonzero; failures are not hidden.

| Scenario | Result |
| --- | --- |
| Own profile/canonical identity, approved public vs pending self profile | PASS |
| Snake/camel names, preserved phone/specialty/verification/owner | PASS |
| Required/invalid names, overlong names, OTP-less phone change rejection | PASS |
| Other-owner/customer/missing/invalid/mismatched-profile JWT guards | PASS |
| Real service CRUD and owner-derived barber_id | PASS |
| Missing fields, empty names, nonpositive/string price, invalid duration | PASS |
| Foreign/customer/pending-barber service write restrictions; allowed customer reads | PASS |
| Service name beyond VARCHAR(50) | FAIL: HTTP 500 instead of client error |
| Service price beyond NUMERIC(10,2) | FAIL: HTTP 500 instead of client error |
| Service duration beyond INTEGER | FAIL: HTTP 500 instead of client error |
| Whole-week replacement/read and omitted weekday off | PASS |
| Invalid times, ordering, duplicates, empty week; previous schedule retained | PASS |
| Self schedule ownership, customer/pending restrictions, tainted selector ignored | PASS |
| Service edit preserves booking snapshot; delete blocked with 409 | PASS |
| Concurrent profile changes save one coherent name pair | PASS |
| Concurrent service updates and update/delete race preserve row integrity | PASS |
| Hashed random five-minute link token and non-leaking status | PASS |
| Token rotation, expiry, malformed/replayed tokens, consume-once and linked restart | PASS |
| Linking role and foreign-profile ownership restrictions | PASS |
| Unlink/relink, chat uniqueness and failed-insert transaction rollback | PASS |
| Parallel consumption of one token permits one association | PASS |
| Unlink revokes outstanding token even without active chat | PASS |

## Confirmed backend findings (not fixed)

All three failures are in POST /api/services / addService:

| Payload change (other fields valid) | Expected | Actual / DB result |
| --- | --- | --- |
| name: "A" repeated 51 times | 4xx validation response | 500; no new service row |
| price: 100000000 | 4xx validation response | 500; no new service row |
| duration_minutes: 2147483648 | 4xx validation response | 500; no new service row |

The existing schema has name VARCHAR(50), price NUMERIC(10,2), and duration_minutes
INTEGER (database/schema.sql:46-48). These are schema limits, not invented new
business rules. servicesController.js:12 only checks name type/nonblank;
:18 only checks finite positive price; :24-27 only checks integer/positive duration.
Values reach INSERT at :60-64 and the generic catch at :71-76 returns 500.
Database integrity holds, but caller-invalid input is reported as a server failure.

Recommended follow-up, **not implemented**: validate these actual schema bounds
before INSERT/UPDATE (name at most 50 Unicode characters, positive NUMERIC(10,2)
range, positive PostgreSQL INTEGER range); return an appropriate 400 validation
message. Handle known input-range SQL errors safely as a fallback and retain 500
for unexpected failures. The PUT validators have analogous missing upper bounds
by code inspection, but the three oversized runtime requests tested POST only.
Do not weaken constraints, truncate/clamp silently or change test expectations
to accept 500. No production fix or large refactor was attempted.

## Parallel / transaction evidence

A separate connection holds the real target row FOR UPDATE. Both participants'
PostgreSQL PIDs and blocking chains are observed before release:

- Two profile PUTs: 200/200, final first/last names form one complete submitted pair.
- Two service PUTs: 200/200, final name/price/duration form one complete payload.
- Service PUT vs DELETE: observed 200/200, final row absent. Current contract also
  permits PUT 404 if DELETE wins first; no unimplemented version check is assumed.
- One token consumed for two chats: exactly one success, one invalid_link; one link
  row and no pending token remain.

A duplicate-chat INSERT causes the real transaction to roll back: the original
chat owner remains, the second barber has no link, and its token stays usable for
a different free chat. This is an expected uniqueness rejection, not a FAIL.

## Telegram mock and secret handling

Start/status/unlink are actual HTTP endpoints. Consumption has **no HTTP endpoint**;
it enters the real createUpdateHandler via /start <token>, using the actual
createTelegramLinkService and PostgreSQL transactions. Service outcomes and
mock sendMessage results are recorded separately, not assigned invented HTTP
statuses. The fake bot username is process-only. No real bot token or provider
API is used; external fetch is disabled.

Tokens/JWTs/passwords are memory-only. Before the shared helper writes a response,
localBarber deep-redacts capability fields and phones in a separate report copy.
Raw response objects remain available for assertions but never go to the log.
The saved report contains zero plain 64-hex capability strings. Expiry preparation
changes created_at/expires_at together only for an owned barber's token, preserving
the five-minute CHECK; database time is not mocked.

## Cleanup and fingerprints

Every fixture/API-created service and current schedule/link row is recorded by
exact primary-key ID under newly created owner profiles. Token cleanup uses its
exact barber_id primary keys, stored separately. Deleted/replaced rows remain in
the ledger for audit; missing IDs are safe no-ops. No prefix/blanket DELETE is used.
The shared session advisory gate prevents concurrent local test modules from
interfering with baseline fingerprints; parallel operations inside the run remain
real independent connections.

Cleanup deleted the remaining 1 booking, 1 link, 2 services, 3 schedule rows,
1 customer, 3 barbers and 4 users. Tokens had already been consumed/revoked;
explicit token-ID cleanup confirmed zero remaining owned rows. All owned ledger
IDs were absent afterward. Existing-row, singleton-admin, migration-history and
schema/constraint/index/comment fingerprints all matched the baseline. Identity
sequences advanced normally and were not reset. No existing user was edited.

## Files and evidence

Only new files:

- backend/test/local-barber.integration.test.js
- backend/test/helpers/localBarber.js
- backend/test/LOCAL_BARBER.md

Full redacted per-request responses, DB assertions, ID ledger, PID evidence,
Telegram outcomes and cleanup: /tmp/ustara-local-booking-64zzzd/report.json.
Full human-readable report: /tmp/ustara-local-booking-64zzzd/RESULTS.md.

No business logic, schema, migration or .env changes. Previous auth/booking suites
were not rerun. Untested: real Telegram polling/provider transport, admin actions,
forced process death/recovery and sustained load. Entire-week-off support is not
implemented by the current API contract and was not falsely marked PASS.
