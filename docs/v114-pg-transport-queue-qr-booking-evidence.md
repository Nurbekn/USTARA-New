# v114 (v113'dan qayta tiklangan) — PostgreSQL pooled transport consistency

## What changed

- One shared bounded error classifier: `pgConnectionHealth.js`; recognizes SQLSTATE `08*`, `57P01`, `57P02`, `57P03`, explicit socket failures, nested causes, and aggregate errors without unbounded recursion.
- Kalendar existing `isBrokenScheduleConnection` API retained as alias.
- Queue transactions, private queue snapshot and day-close handlers mark clients broken *before* rollback; no connection reuse after a socket error even if `ROLLBACK` succeeds.
- QR pooled transactions mirror the same decision; ambiguous COMMIT does not issue ROLLBACK and returns `queue_result_unknown`.
- Legacy single-service booking returns `503 booking_result_unknown` on a COMMIT exception and discards client; callers must reconcile booking state rather than blindly repeating the POST.
- Legacy slots read marks transport-failed clients broken, preserving normal rollback for healthy SQL conflicts.

## Verification scope / limits

- v113 source SHA matched manifest. ZIP CRC passed. Recovered v114 source is an independently reconstructed version, **NOT byte-for-byte historical v114**.
- Added `v114PgConnectionConsistency.unit.test.js`, `v114AvailableSlotTransport.unit.test.js`.
- Targeted 90 PASS; 45 new-test PASS. Backend full 1327 PASS, 26 dependency FAIL; frontend 908 PASS.
- CSV of 185 historical decisions unchanged, SHA `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- 45 forward + 2 rollback SQL unchanged. No migrations, production DB, PostgreSQL server, browser E2E, Telegram live or build tests executed.
- Do not deploy without satisfying missing dependencies and integration gates.

## Test commands (in disposable copy)

```sh
cd USTARA-New/backend
npm run test:v114:unit
npm test
cd ../frontend
npm test
```
