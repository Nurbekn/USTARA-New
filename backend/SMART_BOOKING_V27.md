# USTARA v27 — Smart Booking: haqiqiy bron va Telegram offer

> **Stage-only. Production-ready emas.** SQL bazada hali ishga tushirilmagan. Bu yangilanish v26 ustiga yozilgan; eski migratsiyalar tahrirlanmagan.

## Qo'shilgan oqim
1. Shu kun uchun `pending/confirmed` bron bekor qilinsa, v26 triggeri bo'shagan vaqtni saqlaydi.
2. `npm run smart-booking:worker` 5 daqiqalik QR-only FIFO taklif yaratadi. Mijoz veb-sahifada yoki Telegramdagi o'zining private chatida **qabul/rad** qiladi. Qabul qilish vaqtni band **qilmaydi**.
3. Qabuldan keyin 2 daqiqalik yakuniy tasdiqlash oynasi boshlanadi. `POST /api/queue/offers/:id/services` QR token+receipt egasiga faqat bo'shagan vaqt davomiyligiga teng, faol xizmatlar va joriy narxni qaytaradi.
4. Mijoz haqiqiy OTP bilan tasdiqlangan `customer` JWT sessiyasi orqali `POST /api/queue/offers/:id/confirm-booking`ga `token`, `request_id`, `service_id`, `expected_total_price` beradi. Backend QR proof + real customer user/profile + bugungi waiting ticket + accepted/confirmation deadline + barber status + mos davomiylik + serverdagi narx + ish jadvali/tanaffus + customer/barber overlapni bir **PostgreSQL transaction**da tekshiradi.
5. `bookings` + `booking_services` snapshot + `smart_booking_confirmations` unique marker + opening closed + walk-in left + audit event bir tranzaksiyada saqlanadi. Bir xil mijoz qayta so'rov yuborsa, yangi bron emas, avvalgi booking ID qaytadi. DB exclusion constraint boshqa vaqtdosh bronni rad etadi.
6. Tasdiqlash muddati tugasa, worker accepted taklifini expired qiladi va keyingi QR waiting mijozga o'tishi mumkin. Tasdiqlangan bron shu openingni yakunlaydi.

## Telegram takliflar: alohida rozilik
- V25 navbat chaqiruvi uchun Telegram ulanmaganlar taklif olmaydi. V25 Telegram ulangan mijoz ham **alohida** `/api/queue/telegram/offer-consent` (boolean `enabled`) orqali bo'shagan vaqt takliflariga rozi bo'lishi kerak. `/stopqueue` va QR opt-out ikkalasini ham to'xtatadi.
- V27 `smart_booking_telegram_outbox`: har bir offer uchun **bitta** xabar, commitdan keyin alohida `npm run smart-booking:telegram` worker. Sent xabar `message_id` bilan belgilanadi; Telegram callback `so:a:<offer>` yoki `so:r:<offer>` private chat, bot message author, `chat_id`, `message_id`, mavjud `sent` record va faol consent bo'yicha serverda tekshiriladi. Callback **booking yaratmaydi**; login va QR sahifasiga qaytish talab qilinadi.
- Transport/timeout/5xx yoki ACK yo'qolganda jo'natilgan-jo'natilmagani noma'lum: status `uncertain`, **avtomatik qayta jo'natilmaydi**. Faqat aniq 429 da bounded retry; 400/401/403 failed. Telegram API exactly-once kafolatlamaydi.
- Mijoz roziligini bekor qilish bilan ayni paytda uchib ketayotgan xabarni 100% to'xtatishga tarmoq kafolati yo'q; callbackda consent yana tekshiriladi. Xabarlarda mehmon ismi, telefon yoki parol yuborilmaydi.

## API va status
| Yo'l | Kim | Vazifa |
| --- | --- | --- |
| `POST /api/queue/offers/:id/decision` | QR proof | 5 daqiqalik accept/reject/cancel |
| `POST /api/queue/offers/:id/services` | QR proof | 2 daqiqalik oynadagi mos xizmatlar |
| `POST /api/queue/offers/:id/confirm-booking` | customer JWT **va QR proof** | Haqiqiy booking va service snapshot |
| `POST /api/queue/telegram/offer-consent` | QR proof va allaqachon Telegram ulangan ticket | Offer consent yoqish/o'chirish |
| `GET /api/queue/offers/mine` | approved barber JWT | Bugungi opening, booking ID, delivery status (chat ID yo'q) |

## Migratsiya va deploy — operator nazorati kerak
1. **Oldin** staging zaxirasi, migratsiyalar `20261208` va barcha undan oldingi versiyalarni verify. `20261209_smart_booking_confirmation.sql` 38-forward migration. Dastur yangi column/jadvallarga bog'langanligi sababli migratsiyasiz v27 kodini deploy qilmang.
2. 38-migratsiya: `smart_booking_confirmations(offer_id PK, booking_id UNIQUE, customer_id)`, `walkin_queue_telegram_subscriptions.offers_consent_at` (default `NULL`, hech kim avtomatik opt-in bo'lmaydi), `smart_booking_telegram_outbox`, accepted-due index.
3. API + workerlarini alohida supervisor bilan ishga tushiring: `npm run smart-booking:worker` va `npm run smart-booking:telegram`; eski `npm run queue:notifications` ham qoladi. Botning **birgina** update rejimi: Telegram webhook yoki polling (`npm run telegram:worker`), ikkalasi birga emas.
4. Test DBda bir vaqtda 2x `confirm-booking` (bir mijoz), 2 ta mijoz (fosh bo'lmasligi), boshqa mijozning parallel normal bron yaratishi, 2 daqiqalik expiry, xizmat muddati/narxi o'zgarishi, barber paused/deactivated, real calendar breaks, Telegram opt-out/callbackni sinovdan o'tkazing.
5. `uncertain` Telegram outboxlarni avtomatik qayta yubormang; operator log va real Telegram holatini tekshirsin. DB migrationni bu arxiv tayyorlangani uchun avtomatik ishga tushirmang.

## Ma'lum cheklovlar
- Mosligi aynan **bitta faol xizmat**, davomiylik cancelled booking davomiyligiga **teng** bo'lishi kerak; ko'p xizmatlar kompozitsiyasi v28+.
- Manual walk-in (QR bo'lmagan) avtomatik taklif olmaydi. Yagona API/UI orqali Telegramda yakuniy bron qilish yo'q — xavfsizligi uchun veb + customer login zarur.
- Slot taklifi 5 daqiqa; qabuldan so'ng 2 daqiqalik tasdiqlash oynasi. Yakuniy atomar DB insertgacha bron va'da qilinmaydi.
- Hozircha staging PostgreSQL sinovlari, parallel race E2E, real Telegram va mobil test **bajarilmagan**. Unit mocklar DB lock/exclusionni isbotlamaydi; SQL katalog/trigger stajda tekshirilishi kerak.
- Backend/frontend paketlari arxivga `node_modules` bilan kiritilmagan. Secrets, `.env`, tokenlar, build artefaktlari ZIPda yo'q.
