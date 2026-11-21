# USTARA v111 — calendar/break mutation safety (#153 integration)

Goal: make barber schedule changes cooperate safely with queue, QR, booking, and day-close transactions.

## Included

1. Calendar exception upsert and delete, plus weekly/dated break updates, verify **the signed-in user, barber ownership, active account, barber role and approved status** while holding `FOR SHARE OF b,u` until transaction end.
2. The identity check and SHARE locks are acquired **before** `pg_advisory_xact_lock(barberId)`, the same protocol used by queue, QR, and day closure.
3. No calendar write is attempted after an ownership mismatch, deactivation, or rejected barber.
4. Selected dates (including a date-specific break) are checked against the **PostgreSQL Asia/Tashkent date** after the mutex is acquired. The date is checked again before commit to prevent a long batch from crossing midnight unnoticed.
5. For a `COMMIT` transport error, the client connection is discarded (`release(true)`) and the user receives `calendar_result_unknown`. The change is **not** claimed to have failed or succeeded, and an automatic retry is not recommended before reloading the current state.
6. A failed `ROLLBACK` discards the connection; expected status conflicts still roll back the whole update.
7. Deadlock, lock timeout, cancellation, and serialization errors have a stable `calendar_busy` response rather than raw SQL errors.
8. Successful mutation responses are marked `Cache-Control: no-store`.
9. Regression unit tests cover authorization, lock order, replay uncertainty, midnight boundaries, rollback errors, and data integrity. Existing integration fixtures now provide a real user ID; actual PostgreSQL testing is still required.

## Commands

```bash
cd backend
npm run test:v111:unit
npm run test:unit
npm run test:v108:db:readiness  # if configured; otherwise run node scripts/v108-day-close-db-check.js
```

For the database readiness script, the existing v108 implementation requires explicit `NODE_ENV=test`, `USTARA_V108_DAY_CLOSE_READINESS=I_AUTHORIZE_READ_ONLY_TEST` and a local, allowed `USTARA_TEST_DATABASE_URL`; never point it at production or a live shop database.

## Known limitations

- Real PostgreSQL isolation/locking and browser E2E: **NOT_RUN** in current environment.
- 26 pre-existing backend failures remain because required dependencies are not installed. They are not counted as PASS.
- All 185 product decisions and 45 forward / 2 rollback migrations retained unchanged.
- Calendar write requests should refresh server state after an unknown commit result; no automatic retry path was introduced.
