# Explicit local authentication integration tests

This module writes temporary, run-owned data only to the local disposable
`ustara_test_db`. Set `USTARA_TEST_DATABASE_URL` in the test process to that
database, then use the exact operator opt-in below. PostgreSQL **18.6** and a
matching running local cluster are required. Run from `backend` only after authorization:

```
USTARA_LOCAL_AUTH_WRITE_TESTS=I_AUTHORIZE_TEST_DATA node test/local-auth.integration.test.js
```

Without the flag the module skips. The helper validates the URL target, local
host/socket, database and session user before writes and rechecks identity before
cleanup. It never targets `ustara_db` and does not read `.env` for DB settings.

The helper rejects production mode and unrelated schema/app URL overrides, and
verifies the live local cluster/version before
writing. It binds the real Express app to a random loopback port, uses real
PostgreSQL pool connections, bcrypt, HMAC/random OTPs and JWT/middleware. Only db.js
connection construction is replaced with the verified real Pool. The dotenv
loader is suppressed during app import because configuration was already loaded
privately. No production source file is edited.

Process-only test JWT/HMAC keys and the existing non-network test SMS adapter are
used. The adapter's send method is observed in memory so password-reset OTPs can
be tested without exposing them through the API. OTPs, passwords, JWTs, tokens and
credential hashes never enter the report. External fetch is disabled and no
Telegram worker or booking operation runs. The transaction rollback case alone
injects a temporary JWT signing exception; all its SQL still executes on PostgreSQL.

Each run allocates previously unused random phone numbers, uses recognizable
Ustara/Test profile names, and reserves separate peer loopback IPs whose limiter
hashes do not exist. Test copies serialize through a common session advisory lock;
parallel request cases inside a run still use independently observed PostgreSQL
backend PIDs. Forwarded IP headers are never trusted. Production localhost limiter
rows are not reused or cleared.

Expiry/cooldown/block tests shift timestamps **only on run-owned fixtures** while
preserving CHECK constraints. The actual database clock, security comparisons,
limits and transaction implementations are not mocked or weakened. These are
prepared expiry-state tests, not real-time waits for hours.

Cleanup runs even on a scenario failure and deletes only reserved test phone rows,
their profiles/session versions and exact run-owned account/IP limiter hashes.
Singleton admin is never modified. Before/after fingerprints compare all original
rows, schema definitions/comments and migration history. Identity sequences may
advance normally; they are never reset (gaps are expected). No schema or migration
runs, and no existing data is backfilled or deleted.

Private artifacts are created under /tmp/ustara-local-auth-*/report.json with
per-scenario PASS/FAIL, every request's endpoint/status and request/response field
types, DB assertion outcomes, parallel PID evidence and cleanup invariants.
No raw request/response bodies or secrets are retained. If the process is forcibly
killed, normal finally cleanup cannot run: retain the report/run identity and
review cleanup rather than issuing broad DELETE statements.

Historical validation on 2026-11-14 used the former local `ustara_db` target and
does not validate the current test database guard. Re-run only against the
disposable `ustara_test_db` before relying on these results.

Historical result: 19 scenarios PASS, 0 FAIL (Node totals: 20 including parent),
147 actual local HTTP calls. Registration start/resend/verify/complete, customer and
barber login, protected profile routes, and password-reset start/resend/verify/
complete exercised real PostgreSQL. Account throttles 5/15/30/60 min and IP throttles
15/30/60 min, permanent wrong-OTP blocks, token replay, password/session revocation,
specialty and atomic/parallel transitions passed. Cleanup/admin/history/schema
and all original-row fingerprints matched. No production backend defect was
identified in these cases.

Not covered: admin login/unblock, real SMS/Telegram providers, proxy deployment,
process-crash recovery, full load testing, separate barber brute-force cases and
reset SMS-send penalty escalation. These are not reported as PASS.
