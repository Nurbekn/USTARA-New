# USTARA Smart Booking — v35: session, replay, and database lock safety

## Qamrov

- `manualQueueClaims.mine`: active customer identity lock (`FOR UPDATE OF c,u`) transaction through COMMIT, no query if account paused, DB clock predicates for `pending` and `accepted` offers.
- `smartBookingOffers.listForBarber` / `cancelBarber`: `barberId` **and** `userId` must match a verified active barber. Share-lock on `barbers` and `users` before advisory lock/write. API now passes both signed actor identifiers.
- `smartBookingOffers.applyDecision`: an accepted offer older than 2 minutes with no confirmed booking is expired upon accept replay, returning HTTP 410 and releasing opening if its state is still `accepted`; already confirmed booking remains replay-safe.
- v35 PostgreSQL test: `smartBookingV35.postgres.integration.test.js`. Strict manual opt-in, private ephemeral test schema, two real sessions check identity locks vs account deactivation. No actual account data is touched.

## Offline checks (run from project root)

```bash
npm --prefix backend run test:smart-booking:v35
node --test frontend/test/*.test.js
node backend/scripts/audit-phase1.js
node backend/scripts/decision-coverage.js --json
```

## Integration-test prerequisites

1. Install trusted npm dependencies in a network-connected test machine: `cd backend && npm ci`.
2. Use a dedicated **local disposable** PostgreSQL database named `ustara_test_db`, non-superuser role named `ustara_account_test` with `CREATE` on the test database. **Never use production**.
3. Export a local-only test connection string into the environment **without putting credentials in this repository**: `USTARA_TEST_DATABASE_URL`.
4. Run from `backend/` only after verifying the database is disposable and locally hosted:

```bash
NODE_ENV=test USTARA_V35_ROW_LOCK_TEST=I_AUTHORIZE_EPHEMERAL_SCHEMA \
  npm run test:smart-booking:v35:db
```

This test is intentionally **SKIP** if any opt-in setting is absent. It creates an isolated `test_v35_race_*` schema, verifies session identity, verifies the schema is owned by the test role before dropping it, and never touches app `public.users` or `public.customers`.

**Important:** The test verifies DB row-lock behavior, not full application E2E nor live account pause/Smart Booking. Run existing v30 and v29 integration suites separately on a fully migrated disposable DB. Then perform real Telegram/private chat and mobile-browser E2E with explicitly consented test accounts. Keep callback messages and tokens out of artifacts.

## Verified in the current environment

- v35 selected backend unit tests: **77 PASS / 0 FAIL**.
- frontend Node unit tests: **156 PASS / 0 FAIL**.
- full backend discovery: **273 PASS / 26 FAIL** from missing npm packages (including `pg`,`bcrypt`,`express`,`jsonwebtoken`); these 26 tests **did not execute**.
- offline 185 decisions + 40 forward migrations: **PASS**.
- `npm ci --offline` both backend and frontend: **ENOTCACHED**; no Vite build/lint.
- Real PostgreSQL two-session test: **SKIP**. Live Telegram and browser E2E: **NOT RUN**.

## Production decision

v35 is **NOT production ready**. DB contention semantics, authorization after account pause, webhook callbacks, deployment workers, and actual build should be verified before rollout.
