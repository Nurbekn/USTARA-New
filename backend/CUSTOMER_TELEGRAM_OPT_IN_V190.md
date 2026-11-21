# USTARA v190 — Mijoz Telegram aloqasi va alohida bildirishnoma roziligi

**Status: unit-tested, real PostgreSQL/Telegram E2E not run. Not production-ready.**

## Scope

Existing OTP registration contact verification remains distinct from booking notification permission. No existing OTP contact was backfilled or automatically subscribed. This release adds:

- `customer_telegram_links` / `customer_telegram_link_tokens` in migration `20270102_customer_telegram_opt_in.sql` (62nd forward migration). No booking records are changed.
- An authenticated customer-only link/unlink/status API and an explicit opt-in/withdraw API.
- A 192-bit, 5-minute, single-use `/start cust_<token>` Telegram deep link; only its SHA-256 hash persists in the database. The bot accepts it only from the Telegram private chat owned by the sender.
- A separate, nullable `notification_opt_in_at` field. **Null is the default after linking.** OTP contacts or signed-in status never enable notices automatically.
- Profile UI with status refresh, link/unlink and explicit enable/withdraw action in Uzbek/Russian/English.

## API

| Method | Path | Result |
|---|---|---|
| POST | `/api/customers/telegram/start` | `deepLink`, `expiresInSeconds: 300`, `linked: false`; no booking or notification sent |
| GET | `/api/customers/telegram/status` | `linked`, `linkedAt`, `notificationsEnabled`; no chat ID |
| PATCH | `/api/customers/telegram/preferences` | strict `{ "notificationsEnabled": true/false }` (only after confirmed link) |
| DELETE | `/api/customers/telegram` | removes the binding, its pending tokens and notification consent |

All requests require a valid customer Bearer token; responses set `Cache-Control: no-store`. OTP contacts for account recovery remain separate and are not automatically removed by unlinking this optional notification contact.

The linked Telegram chat is not used for booking notifications in v190. No SMS/push/Telegram customer notification worker, recipient queue, delivery state or automatic sending is enabled. Telegram API acceptance would not prove reading or device delivery.

## Staging verification before any rollout

1. Install npm dependencies in an isolated environment; back up and migrate a disposable PostgreSQL DB through migration 62. Verify both tables, unique chat constraints, expiry and all 62 migration ledger rows. Do not run production migrations from this ZIP.
2. Test customer A and B, expired/replayed links, suspended accounts, revoked JWT session versions, shared Telegram IDs with barber and OTP bindings, concurrent link/unlink and multiple bot workers. Both polling and webhook modes must work.
3. Check that `/start cust_<token>` from a private matching chat links the intended customer **without enabling notifications**. Check that a group, forwarded message or foreign chat cannot link.
4. Enable then withdraw notification consent in UI. Verify `notification_opt_in_at` transitions without sending a message and that unlink deletes the binding. Confirm no chat ID or token appears in public API, logs or referrals.
5. Run a real frontend production build and browser E2E test. These were not possible in the current environment because npm dependencies were not installed.

## Future work

v191 may add one customer booking notice via an opt-in-aware queue and separate worker, with verified customer identity, no retries on ambiguous Telegram responses, and a revocation check immediately before sending. Until then, **notifications are not sent**.
