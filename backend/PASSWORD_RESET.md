> Joriy kod yetkazish kanali Telegramga almashtirildi. Ishga tushirish va yangi oqim: [TELEGRAM_OTP.md](TELEGRAM_OTP.md). Quyidagi SMS/Eskiz bo‘limlari tarixiy tavsifdir.

# Customer/barber password reset

Provision `database/migrations/20261114_security_02_password_reset.sql` after
`20261114_security_01_login_protection.sql`, before deploying the new login and
authentication code. No migration is run automatically. This change has not
connected to PostgreSQL or executed any migration.

The new migration creates four independent tables: `password_reset_limits`,
`password_reset_requests`, `password_reset_events`, `account_session_versions`.
It records its own migration marker and catalog manifest, validates reruns,
refuses untracked objects/drift and commits atomically. Application tables and
registration/OTP baseline definitions are unchanged. Use the existing maintenance
window/advisory-lock DDL contract and an error-stopping runner.

## API

All requests are JSON, all responses have Cache-Control: no-store. Never place
passwords, OTPs, challenge/reset tokens or JWTs in URLs or logs.

| POST endpoint | Request | Successful response |
| --- | --- | --- |
| `/api/auth/password-reset/start` | `phone` | 200: generic message, `challengeToken`, `otpExpiresAt`, `challengeExpiresAt`, `resendAfter:180` |
| `/api/auth/password-reset/resend` | `challengeToken` | 200: same generic message/deadlines/cooldown; original challenge token retained |
| `/api/auth/password-reset/verify` | `challengeToken`, `otp` (5-digit string, including leading zeros) | 200: `resetToken`, `resetExpiresAt` |
| `/api/auth/password-reset/complete` | `resetToken`, `password` | 200: `password_reset_completed`; sign in again, no automatic JWT issued |
| `/api/admin/password-reset/unblock` | `phone`, `reason` (1–500 characters) | 200; requires active admin Bearer JWT |

Phones use the existing normalization function. Unknown phones receive the same
start/resend response shape, status, random challenge, lifetime and limits, but
no SMS is sent and their OTP can never authorize a reset. Neither start nor
resend returns OTPs, even in test mode. Provider delivery errors are recorded as
`password_reset_events.sms_delivery_failed` without provider details and preserve
the generic response to avoid a known-phone-only error. Request budgets are
consumed even if delivery fails. Payload symmetry is not a constant-time delivery
guarantee; a real provider needs queued/idempotent delivery and edge abuse controls.

## Security policy

- Reuses createOtpCrypto, createTestSmsAdapter and the existing password policy.
  OTP HMAC includes a `password-reset:` identifier domain, phone and fresh nonce.
  Registration tables, pending sessions and history are never read or modified.
- OTP: 3 minutes, resend: 180 seconds, challenge: 30 minutes. Resend rotates the
  nonce/hash, invalidating the old issuance, and extends the challenge deadline.
- Wrong OTPs are committed, not rolled back. Counts survive resend/restart. Five
  failures create a permanent reset-only block; an active admin must unblock it.
  Expired or malformed OTPs do not consume password-guess attempts.
- Three sends are allowed; a fourth eligible request blocks reset sends for one
  hour, then subsequent violations for five hours, matching registration policy.
  Counters/penalties and blocks are entirely separate from registration/login.
- Successful verify consumes the challenge credential. A 256-bit reset token is
  issued for five minutes; only its SHA-256 hash is stored. Repeating verify cannot
  issue a second token. A lost verify response requires a new flow, subject to
  the same send limits. Starting again revokes previous reset/challenge tokens.
- Password validation is the same server policy: 8–128 Unicode characters, one
  letter and digit, rejecting the existing weak-password set. Existing bcrypt /
  long-password prehashing is used; no plaintext passwords are stored.
- All important operations lock the phone limit before the reset request. Token
  discovery is rechecked under those locks. Completion also locks the canonical
  users row and rechecks the deadline after locking/hashing. Password update,
  JWT version increment, token consumption and audit commit together. Concurrent
  completion has one winner; failures roll back. DB/protection errors fail closed.
- Unblock atomically resets only reset limits, deletes any live challenge/reset
  capability and writes an admin audit event after checking active admin state.
  Audit history remains. Login brute-force blocks are not cleared by reset.

## Existing sessions

The first successful reset inserts session version 1; later resets increment it.
Public login signs `sessionVersion` from the same SQL snapshot as the password.
The auth middleware compares that version to the database on each authenticated
customer/barber request. Older JWTs without the claim represent version 0 and
work only until the first reset. Fresh registration JWTs still use that initial
version without changing the registration flow. Other users and admin JWTs are
unaffected. Already authorized in-flight work is not cancelled by a later reset.

Never prune account_session_versions while the user exists: removing a row would
restore version 0 and could revive old tokens. Client token deletion alone is
not revocation; backend version checks are authoritative. The reset page clears
this tab's matching session on success, and other tabs/devices get 401 at their
next protected API call. No logout/revocation behavior outside reset is added.

## Frontend and verification

ForgotPassword retains the existing phone / OTP / password / done layout and
returns to login via the existing success link. Challenge/reset tokens and OTPs
are held only in component memory; reload restarts recovery. The 180-second
cooldown, expiry, wrong-code attempts, server errors and admin blocks are shown.
Local password records and the public fixed test code are not used anymore.

Nine unit tests use a transactional memory double and captured test SMS: known /
unknown behavior, HMAC domain, cooldown, restart/resend invalidation, blocks,
admin unblock, real bcrypt, token replay/expiry, mock concurrent completion,
rollback and JWT revocation. Existing targeted router and login tests check JWT
compatibility. These are not real PostgreSQL concurrency or DDL-runtime tests.

The existing default SMS adapter is still a non-delivering test/development
adapter; production fails closed until a real adapter is provided. Tests inject
a capturing adapter without logging codes. Production delivery, edge/IP request
limits, safe expiry/audit retention and a disposable PostgreSQL integration run
remain deployment work. Cleanup must not reset permanent limits or remove live
revocation versions. No real SMS, database or migration was exercised here.
