> Joriy OTP oqimi va botni ishga tushirish: [TELEGRAM_OTP.md](TELEGRAM_OTP.md). Ro‘yxatdan o‘tish va parol tiklash ham shu worker orqali kontakt tasdig‘idan foydalanadi. Quyidagi MVP bo‘limlari tarixiy qaydlarni ham o‘z ichiga oladi.

# Barber Telegram account linking MVP

This is an additional worker for the existing Express/PostgreSQL backend. No
Telegram booking database is added. Booking notifications/review now use the
shared backend service described below.
No Telegram package existed; Node's native fetch and the existing pg dependency
are sufficient. Run with the project's Node 22 runtime.

## Provisioning and process configuration

Provision `database/migrations/20261114_telegram_01_barber_links.sql` separately,
before the API/worker. Prerequisites include unified accounts and the existing
password-reset session-version table. No migration is applied at startup.
The three new tables are:

- barber_telegram_links: barber_id PK/FK, unique positive BIGINT chat_id, linked_at;
- barber_telegram_link_tokens: one token hash per barber, expiry, issuing session
  version; no plaintext token;
- telegram_bot_state: durable update cursor per bot ID (not raw updates).

The migration uses schema-qualified relations, the common schema advisory lock,
tracking-table lock, deterministic table locks and its own catalog manifest.
Unknown pre-existing objects and rerun drift fail closed; failed DDL/marker work
rolls back atomically. Existing barbers/users definitions, OTP baselines and
booking tables are unchanged. It has not been executed in this implementation.

Create the bot with BotFather outside this change. Configure process environment
through the hosting supervisor (do not commit secrets):

- TELEGRAM_BOT_TOKEN: worker and HTTP backend (booking notifications);
- TELEGRAM_BOT_USERNAME: actual bot username, without @, on API and worker;
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD: worker's existing Ustara database.

Start the Express backend as usual. In backend/, start the separate always-on
worker with `npm run telegram:worker`. The npm script loads `backend/.env` through `dotenv/config` for local use; production should supply its environment through the process supervisor. No real bot or worker was started here.
The repository only supplies GitHub Pages frontend hosting; that cannot run the
worker. Provision an always-on Node worker alongside the backend and configure
secure DB connectivity, outbound HTTPS and process supervision.

## Linking and API

All endpoints require the existing authenticated barber identity, derive the
profile from JWT/server identity and recheck ownership against users/barbers.
They never take a barber_id or chat_id from the request body.

- POST /api/barbers/telegram/start -> {token, expiresAt, botUrl};
- GET /api/barbers/telegram/status -> {linked, linkedAt, botUrl};
- DELETE /api/barbers/telegram -> {linked:false}, also revokes pending tokens.

Responses are no-store. A 409 on start means the barber must explicitly unlink
before replacing an existing link. Starting again before linking invalidates the
previous capability. Bot URLs are plain https://t.me/<username>; there is NO
?start=token deep link. Token URLs and query parameters are deliberately avoided.

In the existing barber Profile page, use the Telegram bot card, open the plain
bot link, then send the displayed `/start <token>` command manually in its private
chat. Token state is component memory only: no URL, localStorage/sessionStorage
or clipboard API persistence. It disappears after expiry, unlink, successful
status refresh or unmount. Refresh status after the bot confirms. The legacy
public Telegram username field is labelled separately and is not proof of linking.

## Security and concurrency

Capabilities are 32 random bytes represented by 64 hex characters. Only SHA-256
hashes are stored; expiry is exactly five minutes. The bot validates expiry using
DB time, locks the barber then rechecks/locks the token. Link insertion and token
deletion commit together. Unique barber/chat keys prevent double links, including
parallel different-token races. Unlink/restart follows the same barber lock order.
A failed transaction retains the prior state. Reruns/replayed tokens cannot relink.

The bot uses only private message updates fetched over the authenticated Telegram
Bot API; chat.id must equal the non-bot sender's safe positive numeric ID. It
ignores group/channel/edited messages and cannot accept a browser-submitted chat
ID. Username text is never an identity. Password reset invalidates pending link
capabilities through the issuing session version; the service holds the user row
while checking the current version. Existing links are not login credentials and
are unaffected by password reset. Bot commands never return JWTs or personal
barber identity. /start without a capability and /help explain usage; /status
shows only whether the calling chat is linked. No token is echoed in replies.

The raw command necessarily passes through Telegram's chat/update system; it is
not retained in application logs/tables. Treat it as a secret and do not forward
it. Application/APM/proxy operators must disable or redact response bodies,
updates and Telegram request URLs (the Bot API embeds its bot secret in the path).
Errors deliberately omit raw fetch/Telegram/pg messages, response descriptions,
URL causes and request payloads. No outbound Telegram message was sent here.

## Polling leadership and recovery

Before polling, the worker takes a PostgreSQL session advisory lock keyed by bot
ID on a dedicated connection. Healthy duplicate instances using the same database
return before getUpdates. All instances must share that database/cluster and use
session pooling or direct connections (not transaction-mode PgBouncer). This is
cooperative single-leader protection; independent scripts/databases with the same
bot token are outside it. Telegram 409/401 stops the worker. Existing webhooks are
checked and cause refusal, never silently deleted.

All bot DB operations use that same connection. Connection error/end aborts API
requests and stops processing; the worker does not reconnect silently through a
pool to mutate links after losing leadership. SIGINT/SIGTERM abort polling/backoff
and destroy the connection, releasing its session lock. Network and DB timeouts
bound waits. The worker validates getMe against configured bot ID and username.

Only a processed update advances the persisted cursor; unsupported commands are
acknowledged without a reply. Restart can redeliver an update if a process stops
between link commit/reply/cursor persistence: delivery is at least once, not
exactly once. Capability consumption remains one-use. /status resolves ambiguous
reply loss. Transient Telegram errors back off; permanent inability to reply does
not stall all other chats. Do not log full updates during troubleshooting.

## Validation and remaining deployment work

Focused unit tests use transactional memory and mocked Telegram: ownership,
expiry/rotation, consumed tokens, uniqueness, modeled parallel consumption,
rollback, group/spoof rejection, safe errors, duplicate-worker lock, webhook
refusal and connection-loss abort. Frontend lint/build check the integrated card.
These do not prove real PostgreSQL locks/migration execution or live Telegram.

Remaining: BotFather configuration, secrets/worker hosting, migration apply/rerun
in disposable PostgreSQL, independent-connection race tests and live private-chat
smoke test. Review edge/API rate limits and expiry cleanup. Expired capability
rows can be removed in bounded batches; never erase current links or active bot
cursors as routine cleanup. No destructive down migration is provided.

Telegram API reference: https://core.telegram.org/bots/api#getupdates and
https://core.telegram.org/bots/api#sendmessage.

## Booking notifications and inline review

The bot now supports new-booking notifications and inline review in addition to
linking commands. The existing Ustara booking tables remain authoritative. No
new migration, booking status, callback HTTP endpoint or secondary booking store
is needed. Booking creation, slot calculations and linking rules are retained.

After the booking transaction commits, its connection is released and a best-effort
notification reads the current pending booking and linked barber chat. It includes
booking ID, customer first/last names, service name, saved booking duration and
start/end date/time in Asia/Tashkent. Only the linked barber account receives it;
no customer phone, login credentials or linking capability is sent. Plain text
without parse_mode prevents service/name text from becoming Telegram markup.
The buttons carry `booking:confirmed:<id>` or `booking:rejected:<id>`; these are
identifiers, not bearer authorization.

The HTTP backend now also needs TELEGRAM_BOT_TOKEN in its process environment,
matching the worker's bot. Previously only the worker needed that secret. There
are no secret-file changes. Unlinked barbers simply receive no message. Telegram
transport is bounded at eight seconds for this send, outside the booking
transaction. Delivery/lookup/configuration errors emit a fixed safe log message
with booking ID only; they cannot roll back a committed booking or turn its
successful response into a delivery failure. Failed booking transactions do not
send anything. There is no durable notification outbox/retry queue: a crash or
send failure can lose a notification. Booking creation may wait for the bounded
send attempt; the website remains the authoritative way to inspect bookings.
A notification already in flight when unlink/status changes happen may still
arrive; callback authorization always rechecks the current link and booking.

`services/bookingStatusService.js` contains the existing status transition logic,
now shared by the website controller and Telegram worker. The website's route,
response shape, customer cancellation ownership, barber ownership and completion
window are preserved. Telegram can only review pending bookings, never complete,
cancel, reactivate or change ownership. It does not sign a synthetic JWT.

The worker subscribes to both message and callback_query updates. Only a private
callback whose sender equals the message chat, from this configured bot's own
message, is accepted. Numeric IDs/actions are validated but never trusted as
permissions. The shared service discovers the current chat link/owned booking,
takes the same per-barber advisory lock as website creation/status changes,
locks the barber and current link for SHARE (serializing with unlink/relink),
then locks the owned booking FOR UPDATE and rechecks pending. The update includes
the previously read status in its predicate. This preserves the existing conflict
protocol: pending -> confirmed retains occupancy, pending -> rejected frees it.
Parallel opposite reviews, website races and repeated updates have at most one
successful pending review.

Authorized success removes inline buttons with editMessageReplyMarkup and answers
the callback. Authorized duplicate/final-state callbacks get an already-reviewed
message and another button-cleanup attempt; unrelated/unlinked chats and missing
bookings get a generic permission/not-found message. A Telegram edit failure is
logged without raw errors and does not undo a committed status change; a repeated
click still cannot change it again. Callback replies/updates are at least once,
not exactly once. No bot-side copy of the booking business rules is maintained.

Focused tests exercise the real controller/notifier/shared service with mocked
DB transactions and Telegram HTTP: send after commit, no link, notification failure,
confirm/reject ownership, forbidden/missing bookings, replay/parallel reviews,
website race, link recheck, rollback, commit failure and button-edit failure.
Transport/worker tests cover callback methods and allowed_updates. No Telegram
message, migration, SQL or real PostgreSQL request was executed for this change.
Real private-chat delivery/buttons and independent-connection PostgreSQL races
still need an integration run. No frontend, OTP, login, password-reset or admin
authentication changes are part of this feature.
