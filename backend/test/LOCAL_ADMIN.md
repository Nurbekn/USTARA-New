# Local Admin API — short PostgreSQL integration

## Run and scope

From backend, after explicit permission to create temporary local test rows:

```
USTARA_LOCAL_ADMIN_WRITE_TESTS=I_AUTHORIZE_TEST_DATA node test/local-admin.integration.test.js
```

Without opt-in the module skips. It reuses only localBarber/localBooking safety,
actual Express-app setup, fixture creation, redaction and exact-ID cleanup. No
existing Authentication/Booking/Barber test suite is loaded or rerun. The shared
artifact directory prefix remains ustara-local-booking-; report.module identifies
Admin API. No production source/helper changes were needed.

Set `USTARA_TEST_DATABASE_URL` to disposable local `ustara_test_db`. The shared
helper validates local host/socket, database and session user before writes and
cleanup; no test writes to `ustara_db`. PostgreSQL 18.6 in a registered running
local cluster is required. Production mode and unrelated database/search-path
overrides are refused.
Existing configured admin login/password are read privately and compared by the
actual createAdminLogin implementation. Values never enter argv or reports.
JWT signing uses the shared helper's process-only test secret; the returned token
is verified cryptographically and then passed through actual auth middleware.
The real active admin_accounts singleton is SELECTed, never INSERTed/UPDATEd/
DELETEd. No admin credentials, schema, migration or .env file is changed.

## Actual endpoints

| Endpoint | Request | Actual response |
| --- | --- | --- |
| POST /api/admin/login | {login,password} | 200 {message,token,role:"admin"}; wrong password 401 {message} |
| GET /api/barbers/pending | Bearer admin JWT | 200 array of pending profiles: id,first_name,last_name,phone,created_at,verification_status |
| PATCH /api/barbers/:id/verify | {status:"approved"|"rejected"}, Bearer admin JWT | 200 {message,barber:{id,first_name,last_name,verification_status}} |

Approval lives on the barber router, not an invented /api/admin/approval path.
Admin has global moderation authority and no per-barber ownership boundary in the
current implementation. Scenario 9 therefore tests the requested alternative:
nonexistent ID -> 404, and invalid status -> 400. It does not falsely require an
admin to be forbidden from moderating a different valid barber.

## Executed results

Historical run against the former local `ustara_db`, PostgreSQL 18.6:
**10 scenarios PASS, 0 FAIL**. These results do not validate the current test target.
Node reports 11 passed including parent. **12 real HTTP requests**:

| # | Scenario | Expected / observed | Result |
| --- | --- | --- | --- |
| 1 | Correct configured admin login; singleton ID/admin role/2-hour JWT | 200 | PASS |
| 2 | Wrong password, no JWT issued | 401 | PASS |
| 3 | Admin JWT reads protected pending list | 200 | PASS |
| 4 | Customer JWT reads protected list | 403 | PASS |
| 5 | Barber JWT reads protected list | 403 | PASS |
| 6 | No JWT reads protected list | 401 | PASS |
| 7 | Admin approves exact run-owned pending barber | 200; DB approved | PASS |
| 8 | Admin rejects another exact run-owned pending barber | 200; DB rejected | PASS |
| 9 | Nonexistent barber ID / invalid approval status | 404 / 400; DB unchanged | PASS |
| 10 | Customer and barber cannot approve/reject | 403 / 403; DB pending | PASS |

No unexpected backend issue was found. No business logic fix was attempted.
Real SMS and Telegram were not invoked. This is not coverage of OTP/reset unblock,
admin rate-limit escalation, sustained load or other admin operations.

## Limiter isolation and cleanup

Admin login necessarily writes login_attempt_limits. Its singleton-admin account
key is fixed, so it cannot be made unique by submitting a different login string.
Before any login, the test requires that both exact admin-scope primary keys
(account SHA256(singleton-admin), IP SHA256(127.0.0.1)) are absent. If either exists,
the test stops without resetting or restoring that existing protection state.
Other backend sessions are refused during setup, and the shared local integration
advisory gate excludes concurrent test modules.

Only the two initially absent, run-created composite keys are deleted in cleanup.
No existing limiter row is reset or deleted. Test fixtures are one customer and
three new pending barbers with canonical users; moderation touches only recorded
profile IDs. Exact-ID cleanup removed 1 customer, 3 barbers and 4 users. All owned
IDs are absent afterward; 2 run-created limiter rows were removed as well.

Before/after checks all PASS:

- singleton admin row unchanged;
- migration history unchanged;
- schema/columns/constraints/indexes/manifest comments unchanged;
- every pre-existing table-row fingerprint unchanged;
- all run-owned fixture rows removed.

Identity sequences advance normally and are not reset. No broad cleanup predicate,
schema drop, migration replay, admin-row edit or production connection is used.
Report redaction occurs before the first write: login/password/token/phone and
profile name values are replaced in copied request/response records; in-memory
responses still support actual assertions. Saved report contains no JWT string.

## Files and evidence

New files only:

- backend/test/local-admin.integration.test.js
- backend/test/LOCAL_ADMIN.md

Detailed redacted request/response, DB assertions, fixture ledger and cleanup:
/tmp/ustara-local-booking-o7Dfex/report.json.
Full human-readable results:
/tmp/ustara-local-booking-o7Dfex/RESULTS.md.
