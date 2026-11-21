# USTARA v189 — operator-approved Telegram notices (limited release)

## Scope

This phase adds a **real Telegram API send path**, but **only** for the *unaffected barber* when the **customer** account is suspended, and only if the barber previously linked Telegram. Customers have no persistent verified Telegram contact binding in this project; therefore **customer notifications remain unsupported**, not simulated. No SMS sending is implemented.

Suspension itself never sends messages and never modifies bookings. An Admin must first review the v188 follow-up case and explicitly request a one-shot Telegram notification. Only then can the separate worker send a generic notice: booking ID plus request to contact Admin. It contains no identity, phone, reason for suspension, private notes or booking price.

## API and statuses

- `POST /api/admin/suspension-cases/:id/telegram-notice` (Admin only): `{ "expectedRevision": 1 }`.
- `202` with `noticeStatus: queued` and `notificationsSent: false` means only that a single durable DB request was committed; it does **not** mean a Telegram message was sent.
- Duplicate requests, stale revisions, missing link, wrong recipient or inactive booking fail with `409`. The one-row-per-case uniqueness rule forbids automatic or manual duplicate transmission from this path.
- `GET /api/admin/suspension-cases`: existing Admin listing also includes `telegram_notice_status`, its last update and a boolean `telegram_contact_available`, never chat IDs or private data.
- `queued` = waiting for a worker; `sending` = worker claimed, external result pending; `accepted` = Telegram API returned a valid message ID and matching chat; **not delivery/read confirmation**; `uncertain` = failed/unknown Telegram outcome; `cancelled` = booking/account/recipient not eligible at dispatch.
- The worker neither retries `uncertain` nor requeues stale `sending`. A stale claim becomes `uncertain` after two minutes. If an acknowledgement write fails, the claim will expire into `uncertain` and will not be resent.

## Safe activation (not executed in this package)

1. Install npm packages, back up and apply `database/migrations/20270101_admin_suspension_telegram_notices.sql` **only to isolated staging** after the 60 previous forward migrations. Validate startup inventory (61 forward, 2 rollback).
2. Run dedicated PostgreSQL integration tests with real transactions/locking, two workers, Telegram mock server and failures during send/commit. Verify case closure / account restoration racing with send. A notification already in-flight cannot be unsent.
3. Link a staging barber's Telegram using the pre-existing explicit linking flow. Suspend a staging customer with an active booking, review the follow-up case and explicitly queue one Telegram notice from Admin UI. Check that the UI first shows `queued`, then `accepted` if a valid Telegram API response is received.
4. Start the worker **only by explicit operator decision**, in a dedicated supervised process with `ENABLE_SUSPENSION_NOTICE_WORKER=yes` and configured `TELEGRAM_BOT_TOKEN`: `npm run suspension-notices:worker` from `backend/`. Do not use production credentials for staging.
5. Confirm that no customer Telegram is sent, and that a failed or ambiguous outcome does not prompt any automatic retry. Escalate to manual, consent-respecting operator contact if necessary.

## Known limitations

- No Telegram device delivery/read acknowledgement; Telegram API acceptance alone is not proof of either.
- No verified customer Telegram contact binding or SMS provider. Customer-facing delivery requires a separate, consent-based flow.
- A restore, link revocation or booking change occurring **after the worker's DB eligibility check** but before the Telegram send may leave an in-flight message; the worker rechecks immediately before I/O, but no external send is atomic with a DB transaction. Production integration and race testing is required.
- No real Telegram or PostgreSQL was accessed while preparing this ZIP. The new feature is **not yet production-verified**.
