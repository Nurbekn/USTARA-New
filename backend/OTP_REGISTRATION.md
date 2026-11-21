> Joriy kod yetkazish kanali Telegramga almashtirildi. Ishga tushirish va yangi oqim: [TELEGRAM_OTP.md](TELEGRAM_OTP.md). Quyidagi SMS/Eskiz bo‘limlari tarixiy tavsifdir.

# OTP registration backend

The implementation uses `20261114_otp_registration.sql` followed by
`20261114_otp_registration_02_profile_names.sql`, then
`20261114_otp_registration_03_barber_specialty.sql`.
It does not apply migrations at startup. The four documented prerequisite/OTP
migrations, the split-profile-names migration and the barber-specialty migration
must already be provisioned separately. This change has not connected
to PostgreSQL or applied any migration.

## API

All fields below are JSON body fields. Responses use `message` and `code`.
Registration responses have `Cache-Control: no-store`.

| POST endpoint | Body | Success |
| --- | --- | --- |
| `/api/auth/registration/start` | `phone`, `password`, `role` (`customer` or `barber`), `specialty` (required only for barber) | 201: `sessionToken`, `sessionExpiresAt`, `otpExpiresAt`, `resendAfter` |
| `/api/auth/registration/resend` | `sessionToken` | 200: `sessionExpiresAt`, `otpExpiresAt`, `resendAfter` |
| `/api/auth/registration/verify` | `sessionToken`, `otp` (six-character digit string, including leading zeros) | 200: `completionExpiresAt` |
| `/api/auth/registration/complete` | `sessionToken`, `firstName`, `lastName` | 201: login-compatible `token` and `customer` or `barber` profile |
| `/api/admin/registration/unblock` | `phone`, `reason` (1–500 characters, no credentials) | 200; requires active admin Bearer JWT |

Do not send registration credentials in URLs or log request/response bodies.
Treat the session token like a password. Existing login JWTs are independent of
registration session tokens. Admin login remains unchanged and requires no OTP.

Phones accept E.164 and common Uzbek forms (`90 123 45 67`, `998901234567`),
spaces, parentheses and hyphens. Nine-digit local numbers use country code +998.
Existing account phone values are not rewritten. Legacy noncanonical stored
phone numbers require a separate data audit before rollout.

## Rules and transactions

- Start creates only phone-limit, pending, history and security-event data.
  Passwords use the existing password policy/hash utility. OTPs use HMAC-SHA256
  over phone, registration ID, random issuance nonce and code. Tokens are random
  32-byte values; only their SHA256 hashes are stored.
- An active pending registration cannot be replaced by another start request.
  Continue using its session token. After its deadline, a fresh start rotates
  token/nonce/OTP and preserves failed attempts and the phone SMS budget.
- OTP TTL and resend interval are 180 seconds. Three sends are allowed,
  including start. A fourth eligible send request sets a one-hour block (even
  if made within the cooldown). Further budget violations use five hours.
  After a timed block expires, the next send resets its budget and retains the
  penalty level. Invalid, expired-session or verified resend requests do not send.
- Resend invalidates previous history, replaces the current OTP and preserves
  failed attempts. It cannot reissue the immediately previous five-digit code.
- Five wrong OTPs, including malformed codes on a valid unexpired OTP session,
  set `block_reason='otp_attempts'` and `blocked_until='infinity'`. The block does
  not expire and cannot be reset by start/resend. Expired OTPs do not consume
  wrong-code attempts. Rejections that change counters/blocks commit normally.
- Pre-verification sessions start with 30 minutes. Successful resend extends
  a nearly expired session only enough to contain its new three-minute OTP.
  Successful verification creates a separate, fixed 15-minute completion
  window. Repeat verify cannot extend it; complete does not truncate it using
  the earlier pre-verification deadline. Resend after verification is forbidden.
- Names are normalized to NFC and validated. Each name is at most 80 characters;
  there is no combined length cap. Profiles store and return `first_name` and
  `last_name`, with no legacy display-name column. Nothing is silently truncated.
- Complete writes `users` plus the selected profile, invalidates the history and
  deletes pending in one transaction. History is retained, never an auth source.
  The JWT uses `id=users.id`, independent `profileId`, role, and a seven-day TTL.
  New barber profiles retain the existing `pending` admin-approval status.
- Every registration writer locks the phone-limit row before pending. Token
  lookup is discovery only; it is rechecked under locks. Server time is read
  after locks using `clock_timestamp()` at millisecond precision. SQL constraints
  remain the final protection. Unexpected failures roll back; clients release.
- Unblock rechecks/locks the active admin, resets counters, penalty and block,
  invalidates still-live history without overwriting previous reasons, deletes
  pending and writes both admin and security audit records with one timestamp
  in one transaction. It does not remove users, histories, or limit rows.

Old `/api/customers/register` and `/api/barbers/register` return 410. Direct
admin creation via POST `/api/customers` or `/api/barbers` also returns 410 so
account creation cannot bypass completion. Barber profile updates can omit
phone or submit its unchanged stored value; changing it returns 403.

## Configuration and test SMS

Configure through the process environment; do not commit secrets:

- `OTP_HMAC_KEY`: independent high-entropy secret of at least 32 bytes.
- `OTP_HMAC_KEY_ID`: non-secret key identifier, defaults to `v1`.
- Existing `JWT_SECRET` remains required for account tokens.
- `OTP_SMS_ADAPTER=eskiz`: use Eskiz for registration and password-reset SMS.
- `ESKIZ_EMAIL` and `ESKIZ_PASSWORD`: Eskiz API credentials.
- `ESKIZ_FROM`: sender name/code registered for the Eskiz account.
- `ESKIZ_SMS_TEMPLATE`: approved SMS text containing exactly one `{code}` placeholder.
- `OTP_SMS_ADAPTER=test` and `NODE_ENV=test` or `development`: explicitly enable
  the non-network test SMS adapter. It does not log or retain raw OTPs.
- Only `NODE_ENV=test` together with `OTP_EXPOSE_CODE=true` returns `testOtp`
  on successful start/resend. Development never exposes it in responses.

There is no hard-coded/default HMAC secret. A missing/invalid key or disabled
SMS adapter fails closed with 503. Keep key and key ID stable until pending
sessions using them have ended or been invalidated; this version supports one
active key, and unknown key IDs fail closed. The Eskiz adapter uses the token
login and SMS-send endpoints, caches the bearer token in memory, and obtains a
new token once after an HTTP 401. It does not retry an ambiguous SMS-send
failure, avoiding accidental duplicate messages. The current registration
flow sends within its database transaction; a later database commit failure
after provider acceptance can still leave a delivered code whose session was
not committed. Reliable delivery recovery requires a separate outbox design.

## Verification

`npm run test:unit` uses only memory transaction doubles and actual Express
routers invoked without a listening socket. It does not load `db.js`, `.env`,
or connect to PostgreSQL. It covers TTL boundaries, blocks, failures/rollback,
history retention, admin authorization, credentials/JWTs and legacy bypasses.
Simulated serialization is not evidence of real PostgreSQL row locking.

The existing `test/api.integration.test.js` has been adapted to use the new
OTP flow and its prerequisite migrations in an explicitly named disposable
`ustara_test_*` database. It was not run as part of this work. Never point it at
a real database. Real PostgreSQL constraints/concurrency, backend integration
under a real pool, and production delivery remain unverified. IP/global abuse
rate limiting is a separate deployment concern; this service enforces the
persistent per-phone SMS and OTP budgets.

## Split-name migration and compatibility

The new migration drops only the legacy `customers.name` and `barbers.name`
columns, with RESTRICT, in one transaction. It first requires explicit, nonempty
first/last names for every existing profile. Missing data causes a descriptive
failure before either column is dropped: audit and populate it separately; do
not guess how to split a person's old display name. No backfill is executed by
this change. Existing per-column VARCHAR(80), nullability, IDs and relationships
are preserved. A dependent view or unexpected schema change prevents completion.

The predecessor OTP baseline is validated in full before DDL. After DDL, only
the two approved column removals may differ. The exact old JSON baseline is
archived as `profile_names_previous_baseline` in the same comment; the current
manifest advances to the approved schema and the new version marker is inserted.
Earlier tracking rows are unchanged. At this stage (before the subsequent
barber-specialty migration), both the original OTP migration and the profile-names
migration can rerun against the updated manifest; neither repairs drift.
The new migration's integration tests cover missing data, dependencies, archives,
reruns, 80+80 characters and missing-index drift; they have not been run here.

Current profile/login/update responses use snake_case names. Profile updates
accept `first_name`/`last_name` and the existing camelCase form fields. OTP
completion keeps its original `firstName`/`lastName` request contract. Booking
queries return `customer_first_name`, `customer_last_name`, `barber_first_name`
and `barber_last_name`; service/salon `name` fields are unrelated and retained.
Frontend display labels are derived from the split fields; local form state can
remain camelCase. Historical migrations and predecessor-schema fixtures retain
legacy columns solely to test upgrades/rollbacks. `database/schema.sql` describes
the current core schema, not the input to historical migrations.


## Barber specialty registration

Start requires the exact string `specialty` for `role: "barber"`:

```json
{"phone":"+998901234567","password":"ExamplePass123","role":"barber","specialty":"stylist"}
```

Allowed values: `barber`, `cosmetolog`, `stylist`. Missing, empty, wrong-case or
other values return HTTP 400 / `invalid_specialty`, before hashing or database
access. Customer start still needs only phone, password and role; any customer
specialty input is ignored and stored as SQL NULL.

The server stores the selection in `pending_registrations.specialty`. Resend and
verify retain it. Complete still accepts sessionToken, firstName and lastName;
it uses the locked pending row's specialty, never a client override. Users and
barber profile (including specialty) are inserted in the existing single transaction.
The 201 response contains `barber.specialty`, alongside verification_status and names.
Customer profile creation and JWT claims are unchanged.

The frontend sends specialty only for barber start. Its registration draft in
sessionStorage retains the value through OTP, resend, verification, page reload
and CompleteProfile; passwords and OTP values are not stored there. Completion
uses the returned `barber.specialty` to initialize the local profile. A stored
barber draft missing a valid specialty is discarded and must be restarted.

### New migration and deployment

`20261114_otp_registration_03_barber_specialty.sql` requires all five predecessor
markers. It adds `barbers.specialty VARCHAR(20) NOT NULL` with the three-value
CHECK, and nullable `pending_registrations.specialty` with a role-dependent CHECK:
customer requires NULL; barber requires a non-NULL allowed value. There is no
default, deletion or backfill. Existing barber profiles or pending barber sessions
cause a safe failure; any cleanup needs a separately approved operation. Existing
customer pending registrations remain valid with NULL specialty.

Qualified relation references, the existing schema advisory lock, deterministic
ten-table locks, 5-second lock timeout and 60-second statement timeout follow the
predecessor's deployment contract. Run during maintenance with other DDL stopped.
Changes, baseline comment and marker commit together. The full current manifest
must match before DDL; after DDL removing only the two new columns and named
CHECK signatures must reproduce the predecessor manifest. The exact predecessor
comment is archived as `barber_specialty_previous_baseline`; earlier archives and
tracking rows are retained. Rerun validates the current manifest, archive and
recorded additions and makes no changes; it does not repair drift.

Run only unapplied migration versions, in order. After this migration, the old
profile-names migration's strict archive comparison intentionally rejects the
later specialty schema; do not rerun the entire historical chain. The original
OTP migration still compares against the advanced current manifest. Historical
migration files are unchanged. This new migration has not been executed against
PostgreSQL as part of this implementation.
