# Fresh install and upgrades

`../schema.sql` is the current **core reference**, not an executable bootstrap
followed by historical migrations. It already contains split names, specialty,
barber profile fields, bron qabul qilish holati, booking duration and the active booking exclusion constraint; it omits
OTP/security/Telegram storage and manifest history.
Do not execute it before or after this bootstrap.

Before bootstrap, an administrator must install the `btree_gist` extension in
the `public` schema and confirm that `public.gist_int4_ops` belongs to that
extension. Repository migrations do not install extensions. The guard permits
`btree_gist` and objects PostgreSQL records as members or internal components of
that exact extension when the target is `public`; it does not permit other
extensions or unrelated objects there. An unrelated table, sequence, view,
function, type or other checked schema object stops bootstrap. When using a
separate empty test schema, `btree_gist` stays in `public` and does not make the
test schema nonempty; that test schema is still checked for its own objects.

## Fresh install (runtime verified on isolated PostgreSQL 18.6)

Entry point: `../bootstrap.sql`, using a **dedicated psql connection** with `-X`
(no psqlrc), `ON_ERROR_STOP` and an explicitly reviewed local connection. No
connection URL, password, environment loading or database creation is embedded.
The operator must separately approve execution; preparing these files does not
execute SQL. Inspect the offline plan with:

```
node backend/scripts/bootstrap-plan.js
```

The guard accepts only `ustara_db`, exact `ustara_bootstrap_test`, or `ustara_test_*`, loopback or Unix-socket
connections, a target schema containing no unrelated objects (with only the
`btree_gist` exception above for `public`), and no temporary relations. A local socket/port alone cannot prove
that a database is nonproduction: review the server/deployment before executing.
It never drops or resets existing objects, creates databases or schemas, adopts
existing tables, or fabricates migration markers.

Order:

1. Guard: empty target; explicit search path; common session advisory lock.
2. Users foundation: actually creates users, tracking and its own marker.
3. `core.sql`: five predecessor-compatible tables and the booking lookup index.
   Profiles already have valid unique user_id FKs. There are no users or profiles.
4. Unified accounts: actually validates this empty canonical mapping and records
   its marker via its existing supported no-legacy-credentials branch.
5. Admin accounts: creates the singleton account through its real migration.
6. OTP registration: creates OTP storage, adds split names and captures baseline.
7. Profile names: removes legacy name and its PG18 NOT NULL catalog constraint.
8. Barber specialty: adds required profile specialty, nullable pending specialty,
   conditional CHECK, and advances the OTP manifest (empty barber guard retained).
9. Login protection, then password reset/session versions.
10. Booking duration/status: empty backfill, snapshot constraints, rejected status.
11. Telegram linking/polling storage.
12. Active booking overlap exclusion constraint; requires `btree_gist` and
    `public.gist_int4_ops` preinstalled by an administrator. The migration refuses
    to proceed if missing or if it finds overlapping active bookings.
13. Account/profile integrity and deletion: validates current account/profile and
    name data without repairing it, replaces the simple profile FKs with role-aware
    cascading composite FKs, installs immutable-role and deferred invariant triggers.
14. Barber profile: adds optional public profile fields and validates the location
    pair and experience range.
15. Barber profilida bron qabul qilish holati: `barbers.accepting_bookings` ustunini standart `TRUE` bilan qo‘shadi.
16. Social, portfolio va sharh jadvallari hamda customer profil maydonlari.
17. Telegram orqali OTP yetkazish uchun tasdiqlangan kontaktlar jadvali.
18. `verify.sql`: final exact table/migration inventory, empty application tables,
    active singleton admin, validated constraints and valid indexes; releases lock.

Every one of the 16 forward migrations owns its own marker.
No rollback file or test fixture is an execution dependency. Initial core fields
are intentionally the predecessor shape, so historical migrations own their
column additions without colliding with the current schema reference.

Stop application writers and other DDL during installation. The common advisory
lock coordinates only cooperating tools; it does not prevent arbitrary DDL.
Existing per-migration table locks, 5s lock timeout and statement timeouts remain.
There is no outer all-or-nothing transaction: each migration commits separately;
a failed migration rolls back its own changes. The whole bootstrap is **not
resumable or rerunnable**: a partial run leaves a nonempty target and requires
review, not automatic deletion or replay. Disconnect immediately on failure to
release the session advisory lock. Preserve the failure output for review.

Expected 41 tables (current `bootstrap/verify.sql` inventory): users, customers, barbers, services, barber_working_hours,
bookings, admin_accounts, ustara_schema_migrations, registration_phone_limits,
pending_registrations, registration_otp_history, registration_security_events,
registration_admin_actions, login_attempt_limits, account_session_versions,
password_reset_limits, password_reset_requests, password_reset_events,
barber_telegram_links, barber_telegram_link_tokens, telegram_bot_state, ustara_media,
social_posts, social_comments, social_likes, social_saves, social_follows, social_reports,
barber_reviews, telegram_otp_contacts.
Only admin singleton and migration history are seeded. No test accounts, passwords
or example bookings are installed. FK, UNIQUE, CHECK and indexes come from their
owning core/migration definitions; no safety checks are disabled.

### v14: customer exclusion (`20261130_customer_time_overlap.sql`)

Yangi forward migration 169-qarorni PostgreSQL exclusion constraint bilan himoya
qiladi. Eskirgan bronlar avtomatik o‘zgartirilmaydi: oldindan faol vaqtlar
ustma-ust tushsa, migratsiya xato bilan to‘xtaydi. `ACCESS EXCLUSIVE` jadval
bloki va `btree_gist` talab qilinadi. Production bazaga **ruxsatsiz qo‘llamang**.
Faqat oldingi `20261129_booking_idempotency` migratsiyasidan keyin, backup va
oldingi markerlar tekshirilgan holda rejalashtiring. Mustaqil local database
integratsiya tekshiruvi `backend/BOOKING_CONCURRENCY_V14.md` da.

## Existing database upgrade

Do not use the fresh bootstrap. Review current markers, full manifests, actual
catalog and data; back up first, then run only unapplied forward migrations in
dependency order. Missing markers do not justify inserting fabricated markers.
Profile names still requires reviewed explicit split names. Specialty still
refuses existing barbers or barber pending requests. Booking duration still
refuses missing/invalid service durations, ownership mismatch, incompatible
status CHECK and active overlap. This change does not resolve invalid old data.

Rerun migrations only at their documented stage. After specialty advances the OTP
archive, the profile-names migration intentionally refuses that later baseline.
The new account/profile constraints also advance `users`, `customers` and
`barbers` beyond the OTP and specialty baselines. The new migration advances the
current OTP manifest snapshot, so the original OTP migration can still verify the
final current signature. The specialty migration's preserved predecessor archive
intentionally remains historical; that stage-only migration is not rerunnable
after the integrity migration. The new migration checks its marker and critical
objects on rerun. Do not replay the historical chain on the final schema.

## PG18 manifest semantics and rollback

PG18 exposes NOT NULL as `pg_constraint.contype='n'`; CHECK remains `'c'`.
The three adjusted migrations keep all constraints in the captured signature.
Only exact `NOT NULL name`, `NOT NULL specialty` and `NOT NULL duration_minutes`
entries are removed from the respective comparison delta. Full flags/shape are
checked; added constraints must match the live column's `conkey`. Arbitrary
constraint names work. Unrelated NOT NULL constraints remain subject to drift
checks. Specialty addition metadata includes nonempty NOT NULL signatures;
PG16's existing metadata without that optional field remains compatible.
Archives are preserved verbatim. A stored PG16 baseline moved to PG18 may differ
in **other** NOT NULL entries; there is no silent cross-major rebaseline/adoption.

BEGIN/COMMIT and error propagation remain intact: any failure rolls back that
migration's DDL, comments and marker. No destructive down migration is added;
the accepted rollback requirement is transaction rollback on error. Dropped
legacy names cannot be restored exactly without a backup.

## Validation status

Offline plan checks can run without pg, dotenv or any connection. Integration
coverage in `test/bootstrap-pg18.integration.test.js` is opt-in via an explicit
local `USTARA_TEST_DATABASE_URL` named exactly `ustara_bootstrap_test` or starting
`ustara_test_`. It creates and removes its own isolated schema in that database. It checks all forward steps,
PG18 vs PG16 NOT NULL behavior, arbitrary legacy constraint names, exact archives,
CHECK separation, second-DROP atomic rollback, unchanged stage reruns and unrelated drift rejection. Existing
profile-names integration coverage checks RESTRICT failure and atomic rollback.
Without that URL, integration tests SKIP; this is not a runtime PASS.

Previous offline validation: 6 plan tests passed. PostgreSQL 18.6 parser via pglast
8.8 accepted the then-current 12 migration files (including syntax-only rollback inspection),
3 bootstrap SQL leaves and schema.sql, including DO/PL/pgSQL bodies. Parsing is
not SQL execution and cannot verify dynamic SQL after format(), catalog semantics,
lock behavior or rollback. New runtime coverage and three existing migration
integration files were invoked with the test URL unset: all four SKIP. No database
connection, SQL execution or .env access occurred in that validation. The barber
profile migration is newer and has not received PostgreSQL parser or runtime validation.

### Runtime validation — 2026-11-14

Completed on PostgreSQL 18.6 in a newly initialized `/tmp` cluster, using a private
Unix socket with TCP disabled. The only application database was exactly
`ustara_bootstrap_test`; the cluster did not contain `ustara_db`. No .env was read.
The actual `bootstrap.sql` entry point was executed by `psql -X`.

The first attempt safely failed before migrations because the guard accepted only
`ustara_test_*`, excluding the requested `ustara_bootstrap_test`. The minimal fix
adds that exact database name to the guard and runtime test URL validation,
including isolated test-schema eligibility. No migration file required changes.

Results after correction:

- Clean bootstrap: PASS; all 10 actual forward migrations committed and their
  original tracking rows/timestamps were recorded; no manually inserted markers.
- Exact inventory: PASS, 21 tables, 21 primary keys, 15 foreign keys, 13 UNIQUE
  constraints, 110 NOT NULL constraints, 75 CHECK constraints, 50 valid indexes.
  All 16 explicitly created core/feature indexes and semantic UNIQUE keys exist.
  Unified-accounts fallback index names are conditional; equivalent canonical
  UNIQUE indexes satisfy those requirements.
- Manifest comparison: PASS, constraints from 19 currently manifested tables
  exactly matched live catalog definitions/flags, including type n vs type c.
  All six current owner migrations reran and preserved full schema/history.
- Fresh bootstrap rerun: PASS by expected rejection at the nonempty-schema guard
  (psql exit 3); columns, constraints, indexes, comments, row counts and tracking
  rows/timestamps stayed unchanged. Full bootstrap is intentionally not rerunnable.
- These recorded runtime results predate `20261116_account_profile_deletion_integrity.sql`.
  The new migration and its PostgreSQL checks have not been executed; the test files
  added for them remain unverified until explicit test-database authorization.
- Runtime integration suite: PASS, 7 subtests plus parent (8 tests, no skips).
  Includes arbitrary legacy NOT NULL names, unchanged stage reruns, actual second
  DROP dependency failure with full rollback, and unrelated index drift rejection.
- Lock timeout: PASS using independent live connections. A held ACCESS SHARE on
  barbers forced profile-names ACCESS EXCLUSIVE to time out after approximately
  5 seconds (55P03). Rollback preserved columns/constraints/baseline/history;
  another connection acquired customers ACCESS EXCLUSIVE NOWAIT, proving the
  earlier acquired lock was released.
- Application rows: all empty; only one active singleton admin and 10 migration
  markers were seeded. No users, profiles, bookings or OTP test records remained.
- Offline bootstrap plan tests: 6/6 PASS after the guard change.

Evidence was saved before cleanup under `/tmp/ustara-bootstrap-pg18-Sd5SBo/`:
`bootstrap-success.log`, `bootstrap-rerun.log`, `integration.log`,
`catalog-before-rerun.json`, `audit-results.json` and `RESULTS.md`. Initial guard
failure and audit-helper corrections are retained there too. Temporary helper
assumptions about fallback index names and the password-reset comment owner were
corrected; these were test-helper issues, not migration failures.

This validates clean installation and the listed rollback/lock cases on 18.6.
It does not validate production upgrade data/backfills, cross-major rebaselining,
noncooperating DDL concurrency or arbitrary hosting/network configurations.

Cleanup completed after saving evidence: only `ustara_bootstrap_test` was dropped
from the private cluster, and that cluster was stopped. Logs/catalog evidence
remain under the path above; `cleanup.log` records successful cleanup.

### Login siyosati yangilanishi

`20261123_security_login_policy.sql` yangi forward migratsiyasi account CHECK
cheklovini 5 urinishga moslaydi. Bootstrap uni yakuniy verify dan oldin bajaradi.
Eski login jadvali imzosi tekshiriladi va yangi katalog imzosi yoziladi;
foydalanuvchi yozuvlari o‘chirilmaydi. Backend account bloklari 1/3/5 daqiqaga
moslangan. Migratsiyani yangi backenddan oldin, eski writerlarni to‘xtatib va
alohida ruxsat bilan bajarish kerak. Tafsilot: `../../LOGIN_PROTECTION.md`.

## Stage 3 — Booking attempt idempotency (20261129)

`20261129_booking_idempotency.sql` is a **forward-only migration** after device sessions.
It adds `booking_request_keys` (one unique UUID per customer and booking), holding only
request fingerprint and the committed booking ID, not JWTs/phones. It does not
alter historical bookings. Run migrations against an explicitly verified disposable
PostgreSQL database first; production requires separate review and authorization.
New frontend booking attempts include `request_id`, and the API **fails closed**
with `migration_required` until the table exists. Apply the migration *before*
deploying the new frontend. Retrying the same attempt returns HTTP 200 with
its original booking and does not send another Telegram notification. A changed
request using the same ID gets HTTP 409. Older clients without `request_id`
retain previous behavior and do **not** get retry recovery protection.

### v18 calendar exceptions (forward migration)

`migrations/20261202_barber_calendar_exceptions.sql` adds date-specific
closed days, special working hours and **one break interval** per date.
`ustara_effective_day_schedule(integer,date)` is consulted by booking creation,
slot suggestions and booking modification. A **separately approved database
upgrade** is required before deploying v18 backend: old databases without the
function will reject availability calls. Do not run the *fresh-install*
`bootstrap.sql` against an existing database. Review backup, permissions,
operator migration procedure and run the new forward migration in its
intended schema, after v17. No automatic production upgrade is included.

Updates through the API serialize with booking creation using the same
barber advisory lock. Existing active appointments must fit the new calendar;
otherwise 409 and rollback. **No booking is silently cancelled**. These
claims must still be validated in a real PostgreSQL test database.

## v19 recurring breaks
- Fresh test bootstrap now includes `20261203_barber_break_rules.sql` (32nd forward migration) **before** `bootstrap/verify.sql`; fresh verification inventories `barber_weekly_breaks`, `barber_date_breaks` and `ustara_effective_breaks(integer,date)`.
- Existing deployed schemas must run only the reviewed forward migration after the v18 migration. Never replay the fresh bootstrap in production.
- Validate in a disposable PostgreSQL schema with real bookings before deployment; unit/offline SQL inspection does not prove transactional concurrency behavior.
