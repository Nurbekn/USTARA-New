# v194: PostgreSQL bootstrap handoff integrity proof

## Intent and safety boundary

The optional `v193-isolated-postgres-booking.yml` job is still **manual only** (`workflow_dispatch`). It provisions a **disposable** PostgreSQL service, `ustara_test_db` and the limited `ustara_account_test` login. v194 inserts a *read-only catalog proof* between complete bootstrap and concurrency tests. It does NOT create/reset a database, execute a migration or emit application data. No production database or Telegram access is required.

The proof is `backend/scripts/v194-bootstrap-proof.cjs`. Before any connection, it runs the existing v193 fail-closed gate. Inside `BEGIN READ ONLY` it inspects:

- exact database/schema/session role, prohibited elevation flags and PostgreSQL read-only transaction setting;
- applied migration registry equals **all files in the actual ordered bootstrap plan** (63 forward files at v194); no missing/extra markers;
- valid and ready *customer* `bookings_customer_time_excl` and *barber* `bookings_active_time_excl` exclusion indexes;
- the `btree_gist` extension in `public` and the check-in, customer Telegram consent and notification-outbox tables.

This is a second *post-bootstrap* check; the SQL bootstrap's own guard and `verify.sql` are still authoritative. The script reads migration identifiers and PostgreSQL catalog metadata, **never users, bookings, chat messages, tokens, or telephone data**. It issues ROLLBACK even though the transaction is read-only. It fails closed if DB identity, privileges, migrations or constraints differ.

## How to validate

1. Run offline: `cd backend && npm run test:v194:unit` and `node scripts/bootstrap-plan.js`. These work without a database (and, when dependencies are installed, in CI).
2. Push the files to a GitHub repository. Select **Actions → USTARA v193 - opt-in isolated PostgreSQL booking concurrency → Run workflow**. The v194 unit checks run before SQL. After bootstrap, the v194 catalog proof must pass **before** `bookingConcurrency.postgres.integration.test.js`.
3. Inspect all job logs. Any failed prerequisite makes the job **red**; fix the source migration or actual schema problem rather than skipping the proof. Also run v192's verified dependency gate separately to cover backend unit tests and frontend build.

### Not yet verified

At artifact creation, the environment does not have a live PostgreSQL service or all npm packages. **No live v194 catalog query, migration bootstrap or booking concurrency test was executed.** A passing offline unit test does not establish production readiness or SQL compatibility. Real PostgreSQL bootstrap and concurrency must pass in a disposable GitHub runner, followed by separate staging E2E and rollback rehearsal.
