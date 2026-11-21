# Booking availability and immutable duration

The existing booking routes/controllers remain in use. No frontend, bot or
parallel reservation system was added. Deploy the new migration before these
writers: `database/migrations/20261114_slots_01_booking_duration.sql`.

## API and intervals

GET `/api/bookings/available-slots?barber_id=2&service_id=3&date=2030-01-07`
requires authentication and the existing positive IDs and YYYY-MM-DD date.
Invalid calendar dates fail with 400. The server requires an approved barber and
a service belonging to that barber; duration is read from services. It uses the
selected date's weekly hours (Sunday=0); an absent row is a day off. Breaks and
overnight shifts are not supported by the existing schedule schema and were not
introduced. Working-hour writes accept minute precision as before.

The response retains date, duration, working, slots and busy, and the existing
recommendedSlots when working. Slots retain HH:MM start/end and the existing
five-minute starting grid anchored at work start. Only complete services within
the shift, strictly in the future, with no active overlap are offered. Reads use
a REPEATABLE READ read-only snapshot, closed with ROLLBACK; another customer can
still reserve a displayed slot, so creation always checks again.

Only pending and confirmed occupy time. An interval is [start,end): end touching
the next start is allowed. Busy intervals use bookings.duration_minutes and are
compared as complete instants, including reservations crossing a local midnight.
Calendar/weekday/day bounds and working-hour comparisons use Asia/Tashkent.
Displayed busy intervals are clipped to the selected local day (24:00 is its end).

POST `/api/bookings` retains barber_id, service_id and booking_time. Only a
customer can create; customer_id comes from the authenticated profile. Incoming
duration_minutes is ignored. booking_time must be an ISO datetime with Z or an
explicit UTC offset (e.g. 2030-01-07T10:00:00+05:00); ambiguous timezone-less inputs
are rejected. The server canonicalizes the instant and reads the current service
duration, checks ownership, barber approval, hours, clock and overlaps again,
then inserts duration_minutes with the pending booking. Existing read responses
also include the stored duration and calculated booking_end.

## Status and concurrency

PUT `/api/bookings/:id` retains status and ownership/role checks:

- pending -> confirmed, rejected or cancelled;
- confirmed -> completed or cancelled;
- completed, rejected, cancelled are terminal.

Only the owning barber can confirm/reject/complete. Customers can only cancel
their own pending/confirmed bookings. completed is allowed only after the saved
booking duration has elapsed, regardless of subsequent service edits. The shared service also handles authenticated Telegram review of pending
bookings; see TELEGRAM.md. The legacy
DELETE cancellation endpoint is retained; it only removes active occupancy and
cannot reactivate a terminal booking. approved is not a booking API alias.

Creation retains the per-barber transaction advisory lock, taken before reads.
Status updates discover the owned booking, take that same barber lock and then
recheck ownership under the booking row lock. Schedule replacement takes the
same advisory lock before deleting/replacing days, including days with no row.
Creation holds SHARE row locks on the barber and selected service until commit,
so verification/service updates or deletion cannot invalidate those reads during
creation. Service edits after commit affect only subsequent bookings. Past-time
checks use the DB clock after the advisory-lock wait and just before insertion.

All known occupancy-adding application writes use the same advisory lock. This
is cooperative application protection, not a database exclusion constraint:
manual SQL, future imports or external writers must follow this protocol too.
A displayed slot is not a reservation. Updating hours after a booking is committed
does not cancel that booking. Lock waits are bounded at five seconds; booking
create/status statements at fifteen seconds. Errors roll back the transaction.

## Migration and data preservation

The migration requires the existing users-foundation and unified-accounts
markers. It schema-qualifies tracking/bookings/services, acquires the common
schema advisory lock and locks tracking EXCLUSIVE, services SHARE, then bookings
ACCESS EXCLUSIVE. Use an error-stopping runner in a maintenance window with
other DDL stopped. Service writes and booking reads/writes wait during backfill.

First apply rejects an untracked duration column/constraint, unexpected status
constraints/values, noninteger service duration schema, missing services,
nonpositive/NULL duration or a service belonging to a different barber. It adds
bookings.duration_minutes, fills every existing booking from its related service,
then sets INTEGER NOT NULL with CHECK > 0 and no default. It retains confirmed,
expands the status CHECK to include rejected, and refuses existing active overlaps.
No IDs, times, statuses, relationships or other booking data are rewritten.

The old historical duration cannot be reconstructed if a service was edited
before migration; the approved backfill uses the service value at apply time.
Existing booking comments are archived. The previous/full resulting catalog
signatures are recorded in the table comment; only the duration column, its CHECK
and expanded status CHECK may differ. The marker is inserted in the same
transaction. Rerun verifies the recorded schema/archive and makes no changes;
it never refills snapshots from edited services or repairs drift. The earlier
OTP manifests do not include bookings/services and are not modified.

A failure, lock timeout or invalid row rolls back DDL, backfill, comment and marker.
There is no automatic destructive down migration: removing snapshots or rejected
statuses would lose data/meaning and needs a separate reviewed recovery plan.

## Verification scope

Focused unit tests use a transactional memory double, checking status occupancy,
service snapshots, work/day boundaries, midnight overlap, UTC/offset equivalence,
permissions, expiry after lock wait, mock parallel creates, rollback, status
transitions and schedule lock order. They do not prove real PostgreSQL locking,
FK/constraint/catalog behavior or the migration's runtime syntax. No database,
SQL or migration was executed as part of this implementation. Real PostgreSQL
apply/rerun/backfill/error rollback and independent-connection concurrency remain
unverified. Existing unrelated passing tests were not rerun.

Booking status updates now run through services/bookingStatusService.js for both
website and bot review. Creation attempts Telegram notification after commit and
connection release; delivery failure is logged safely and does not cancel booking.
Notification delivery is best effort, without a new migration or retry queue.


### v9 — idempotent bron yaratish (#144)
- Frontend POST `/api/bookings` bilan `request_id` (UUID v4) yuboradi.
- `booking_request_keys` va bron **bitta PostgreSQL tranzaksiyasi** ichida yoziladi.
- Internet javobi yo‘qolsa, ayni tanlovni yuborishda request ID saqlanadi: server
  200 bilan o‘sha bronni qaytaradi, boshqa bron yaratmaydi, Telegram xabarini takrorlamaydi.
- `request_id` o‘zgarmagan holda boshqa xizmat, sartarosh yoki vaqt yuborilsa 409.
- Chiqib ketgan yoki muddatidan o‘tgan bronni statusi qanday bo‘lsa shunday qaytaradi;
  `confirmed` deb yolg‘on ko‘rsatmaydi.
- Legacy `request_id`-siz mijozlar uchun avvalgi logika o‘zgarishsiz.
- **Talab:** `20261129_booking_idempotency.sql` migratsiyasi; u bajarilmagan bo‘lsa yangi
  frontend so‘rovlari `migration_required` bilan 503 oladi. Production’da avtomatik qo‘llanmaydi.


### v81 — Noaniq HTTP javobdan bronni tiklash (#144, qisman)

- Authenticated **customer** may call `GET /api/bookings/recovery/:requestId` (UUID v4).
  The query is scoped to `booking_request_keys.customer_id` **and** `bookings.customer_id`.
  No new booking, no Telegram notification, and no status change occurs.
- Existing committed booking: `200 {found:true,data:{...booking,replayed:true}}` with original
  `booking_services` snapshots. Unknown key: `200 {found:false,uncertain:true}`.
  **IMPORTANT**: `found:false` is not proof the original POST has rolled back.
- Missing migration => `503 migration_required`. Invalid UUID => `400 invalid_request_id`.
- Frontend stores only request UUID, selection signature and non-secret account ID in
  `sessionStorage`. It keeps the same UUID after an uncertain network outcome.
  A different selection is temporarily blocked until customer checks recovery;
  explicit abandonment is available with a duplicate-booking warning.
  Logout deletes any pending attempt for that browser tab.
- Apply the existing reviewed `20261129_booking_idempotency.sql` migration on a
  separately authorized **test** database before PostgreSQL integration tests.
  This release applies **no** migration automatically.
- Unit tests pass locally; true concurrent POST vs GET with PostgreSQL/HTTP and
  browser E2E remain unverified. Do **not** call #144 fully complete.

### v11 — Bron narxini mijoz tasdiqlashi va original nom snapshoti (#52, #56, #143)

- `GET available-slots?service_ids=...` serverning haqiqiy `total_price` qiymatini ko‘rsatadi.
- USTARA web UI shu qiymatni `expected_total_price` sifatida `POST /api/bookings` da yuboradi.
- Backend haqiqiy narxni service row lock ostida qayta o‘qib, quote bilan solishtiradi; farq bo‘lsa `409 price_changed`. Hech qanday INSERT qilinmaydi.
- Quote **hech qachon** DB’ga yoziladigan narx manbasi emas, faqat mijoz roziligini tekshiradi; `bookings.total_price` va `booking_services.price` server qiymatlari bilan saqlanadi.
- `attachBookingServices` bronning xizmat nomini snapshotdan qaytaradi, keyingi xizmat nomi o‘zgarsa ham avvalgi bron ko‘rinishi o‘zgarmaydi.
- `request_id` tarmoqdagi noaniq xatodan keyin o‘zgarmaydi; retry original bronni olishga xizmat qiladi.
- Eski API klientlarining `expected_total_price`-siz POST'i backward-compatible, demak quote enforcement ularda yo‘q. Yangi web UI uchun amal qiladi.
- Real DB/simultaneous price edit sinovlari bajarilmagan.

### v12 — #106 bron vaqtini ko‘chirish, #162 xizmatlarni tahrirlash (qisman)

`GET /api/bookings/:id/modify-slots?date=YYYY-MM-DD` mijozning shu broniga oid
5 daqiqalik bo‘sh vaqtlarini qaytaradi; o‘z bronini va alohida boshqa sartaroshdagi
mijoz bronini hisoblashda ehtiyot bo‘ladi. `PATCH /api/bookings/:id/modify`
`{booking_time,expected_booking_time}` qabul qiladi; xohishga qarab
`service_ids:[...]` va **majburiy** `expected_total_price` jo‘natilishi mumkin.
Faqat Customer o‘zining active future bronini tahrirlaydi. Customer row lock,
barber advisory lock va booking row lock bilan o‘zgartirish atomar. Mismatch,
booked slot, price changed yoki permissions xatosida avvalgi bron o‘zgarmaydi.
Faqat vaqt o‘zgarsa original duration, total_price va booking_services snapshoti
saqlanadi. Eski vaqt o‘zgargan bo‘lsa `409 booking_changed`. COMMIT’dan keyin
best-effort Telegram `rescheduled` xabari. Real PostgreSQL E2E, xizmat tahriri
frontend va history audit jadvali hali **qolgan**. `docs/USTARA_V12_BRONNI_OZGARTIRISH.md`.


## v14 — bazada mijoz vaqt to‘qnashuvi himoyasi

**169-qaror:** `20261130_customer_time_overlap.sql` migratsiyasi boshqa sartaroshga
parallel bronlar orqali mijozning bir vaqt oralig‘ini ikki marta band qilishiga
PostgreSQL darajasida ham yo‘l qo‘ymaydi. Bu eski `bookings_active_time_excl`
(sartarosh bo‘yicha) chekloviga qo‘shimcha. **Migratsiya avtomatik ishga tushirilmaydi.**
`bookings_customer_time_excl` bo‘yicha `23P01` kelganda API 409
`customer_time_conflict` qaytaradi. Eski createBooking yo‘lida rad javobidan
oldin `ROLLBACK` qilinadi. Test va operator ko‘rsatmalari:
`BOOKING_CONCURRENCY_V14.md`. Real PostgreSQL sinovi alohida bajarilishi kerak.


### v16 — Cancel once, retry safely

The legacy DELETE and status PUT cancellation routes now use the **same**
transactional authorization/locking path. A retry of the already-cancelled
booking returns `200` and `data.replayed=true`; it does not notify twice.
Committed changes are not reported as failures if a later display read fails.
See `BOOKING_CANCELLATION_V16.md`. Barber-defined deadlines and work breaks
are still pending.

See `BOOKING_CANCELLATION_V17.md` for barber-set cancellation terms, immutable booking policy snapshots, migration requirements and integration-test limits.


## v82 — tiklashdagi account va parallel guard

Recovery `GET /api/bookings/recovery/:requestId` `Cache-Control: no-store`ni hatto xato javobida ham belgilaydi. `found:false` har doim `uncertain:true`: uncommitted POST keyinroq commit qilishi mumkin. Frontend hali ishlayotgan requestni boshqa tanlov/akkaunt natijasiga biriktirmaydi, ega noma’lum eski UUID’ni yangi akkauntga avtomatik ulangani yo‘q. Haqiqiy multi-connection PostgreSQL sinovi opt-in va hali bajarilmagan.
