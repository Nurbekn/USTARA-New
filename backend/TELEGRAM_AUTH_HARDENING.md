# Telegram OTP integratsiyasi — audit va ishga tushirish

## Audit

`registrationService`, `passwordResetService`, `registrationSms`, `otpDelivery`, Telegram adapteri/worker/handler, auth controller/route, OTP crypto, frontend registration/OTP/reset, migration va `TESTING_STATUS.md` tekshirildi. PostgreSQL haqidagi xulosalar faqat repository fayllariga asoslangan; jonli sxema tekshirilmadi.

Mavjud HMAC-SHA256, timing-safe tekshiruv, 6 raqam, 3 daqiqa, 5 xato urinish, 3 yuborishdan keyingi 1/5 soatlik bloklar, administrator bloki, JWT identity va resetdan keyingi session version bekor qilinishi saqlandi. Eskiz kodi o‘chirilmadi; auth mavjud `otpDelivery` adapterini ishlatadi. Yangi kutubxona qo‘shilmadi.

Oldingi kamchiliklar: kontaktni boshqa telefonga ko‘chirish mumkinligi, resetning 30 daqiqalik kontaktga tayanishi, sayt challenge’isiz kontakt qabul qilinishi, IP/Telegram umumiy limitlari va webhook yo‘qligi. `.env` qiymatlari chiqarilmadi yoki o‘zgartirilmadi. Faqat nom/mavjudlik auditi `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `OTP_DELIVERY_ADAPTER`, `OTP_HMAC_KEY` qiymatlari borligini ko‘rsatdi. Bu ularning to‘g‘riligi yoki bot ishlashini tasdiqlamaydi.

## Natijaviy oqim

1. Sayt role, telefon va parolni mavjud registration service orqali qabul qiladi. 32 random baytli `reg_` capability OTP/session tokenidan alohida yaratiladi; bazada SHA-256 saqlanadi. Payload 47 belgi, registration sessiyasi 30 daqiqa.
2. Shaxsiy chatdagi `/start` challenge’ni birinchi chatga mahkamlaydi. Boshqa chat uni egallay olmaydi; yuborilgan, bekor qilingan yoki muddati tugagan havola ishlamaydi. Takroriy birinchi chat ochishi kod yuborilishigacha davom etishi mumkin.
3. Bot faqat self-contactni qabul qiladi: private chat, yuboruvchi ID, contact ID, forward belgilarining yo‘qligi va canonical telefon mosligi tekshiriladi. Matn bilan telefon tasdiqlanmaydi. Sayt challenge’isiz kontakt bog‘lanmaydi.
4. Kontakt `(bot_id,phone)` va `(bot_id,chat_id)` UNIQUE bilan saqlanadi. Telefon/chat almashtirilmaydi. Eski account kontakt bilan avtomatik bog‘lanmaydi. Hali tugallanmagan registration kontakti vaqtinchalik rezerv bo‘lib qoladi; uning boshqa raqamga ko‘chirilishi ham taqiqlangan.
5. Telefon limiti, pending registration va challenge qatorlari lock qilinadi; yangi OTP avvalgisini bekor qiladi. Telegram xatosi OTP tarixi, send-count va delivered belgilarini rollback qiladi. Botdagi xato matni maxfiy ma’lumot saqlamaydi.
6. OTP tasdiqlanib profil tugatilganda `users`, rol profili va Telegram `user_id` bog‘lanishi bitta tranzaksiyada yaratiladi. Bog‘lanish yo‘q bo‘lsa account yaratish rollback bo‘ladi.
7. Reset faqat `(bot_id,phone,user_id)` doimiy bog‘lanishiga yuboradi. Kontaktning eski verified vaqti resetni cheklamaydi. Yuborilmagan OTP `delivered_at=NULL` bo‘lib, hatto to‘g‘ri kod topilsa ham tasdiqlanmaydi. Noto‘g‘ri format ham valid reset sessiyasida urinish sarflaydi. Yangi resend aynan avvalgi kodni qayta yaratmaydi.

Telegram ID PostgreSQL BIGINT va decimal string sifatida uzatiladi. Aniqligi yo‘qolgan JavaScript number rad etiladi; normal aniq Telegram numeric ID’lari qabul qilinadi.

## API

Yangi endpoint: `POST /api/auth/telegram/webhook`. Header: `X-Telegram-Bot-Api-Secret-Token`. `200` — bajarildi/takroriy update; `400` — noto‘g‘ri update ID; `403` — noto‘g‘ri secret; `404` — webhook rejimi yoqilmagan; `503` — lock yoki vaqtinchalik xizmat xatosi, Telegram qayta urinishi mumkin. Xato javobida update, token yoki SQL tafsiloti yo‘q.

Mavjud endpointlar saqlandi:

- `GET /api/auth/telegram` — bot havolasi.
- `POST /api/auth/registration/{start,status,resend,verify,complete}`.
- `POST /api/auth/password-reset/{start,resend,verify,complete}`.

IP limitlari registration va reset orasida umumiy: start/resend har biri 20/10 daqiqa, verify/complete har biri 120/10 daqiqa, status 240/10 daqiqa. Telegram chatdagi kiruvchi xabarlar 30/minut. Telefonning mavjud qat’iy limitlari bundan tashqari saqlanadi. Limit PostgreSQL’da atomik UPSERT, identity esa HMAC ko‘rinishida saqlanadi. Storage xatosida auth yopiq qoladi.

## O‘zgargan fayllar

| Fayllar | Sabab |
|---|---|
| `services/telegramOtp.js`, `services/telegramRegistration.js`, `services/registrationService.js` | O‘zgarmas kontakt, aniq ID, challenge egasi, account bilan atomik bog‘lanish, yuborilmagan OTPni rad etish. |
| `services/passwordResetService.js`, `controllers/passwordResetController.js` | Doimiy accountga yetkazish, delivered holati, malformed urinishlar, kod takrorlanmasligi va production javob vaqtini tekislash. |
| `services/otpRateLimit.js`, `middleware/otpRateLimit.js` | Ko‘p jarayon orasida PostgreSQL asosidagi IP/Telegram limitlari. |
| `telegram/identity.js`, `telegram/webhook.js`, `telegram/handler.js`, `telegram/worker.js`, `routes/auth.js` | BIGINT ID normalizatsiyasi, secret tekshiruvi, receipt, polling/webhook ajratilishi va challenge’isiz enrollni yopish. |
| `database/migrations/20261121_telegram_auth_hardening.sql`, `database/bootstrap.sql`, `database/bootstrap/verify.sql` | Yangi ustun/constraint/jadvallar va bootstrap zanjiri. |
| `frontend/src/pages/auth/Otp.jsx`, `ForgotPassword.jsx`, `components/TelegramOtpNotice.jsx`, `components/RegistrationForm.jsx`, `utils/registration.js` | Telegram bosqichlari, yangi havola olish, haqiqiy loading matni, xavfsiz recovery va limit xabarlari. |
| `test/telegramAuthHardening.unit.test.js`, `test/telegramOtp.unit.test.js`, `test/passwordReset.unit.test.js` | Yangi xavfsizlik holatlari va avvalgi kutuvlarning qat’iylashtirilishi. |
| `test/helpers/registrationPool.js`, `test/helpers/passwordResetPool.js` | Mavjud mock tranzaksiyalarda yangi account/delivery yozuvlarini modellashtirish. |
| `test/helpers/otpPostgres.js`, `test/bootstrap-plan.unit.test.js` | Alohida OTP harness’i va offline migration ro‘yxatini yangi dependencyga moslashtirish; harness ishga tushirilmadi. |
| `test/telegram-auth.postgres.integration.test.js` | Alohida ruxsat bilan bajariladigan haqiqiy SQL/lock/constraint regressiyasi. |
| `TELEGRAM_AUTH_HARDENING.md`, `TESTING_STATUS.md` | Audit, ishga tushirish, tekshirilgan va tekshirilmagan holatlar. |

Frontend fayllari jadvalida qisqartirilgan nomlar `frontend/src/pages/auth/` katalogiga nisbatan berilgan; boshqa yo‘llar `backend/` ichida.

## Migration va bootstrap

Yangi fayl: `database/migrations/20261121_telegram_auth_hardening.sql`.

Prerequisite zanjiri: registration + password reset + barber Telegram migrationlari → `20261119_telegram_otp_delivery` → `20261120_telegram_registration_requests` → `20261121_telegram_auth_hardening`.

`20261121` prefiksi 2026-11-17 kuni mavjud `20261119` va `20261120` fayllaridan keyingi leksik version sifatida ataylab tanlangan. Bu haqiqiy yaratilish sanasi yoki 2026-11-21 gacha kutish talabi emas. Oldingi hujjatda bu qaror izohlanmagan edi. `bootstrap-plan.js` fayllarni nomi bo‘yicha saralaydi; yangi migration `20261120` markerini talab qiladi. Uni `20261117` qilib almashtirish prerequisite’dan oldinga ko‘chiradi va bootstrap tartib tekshiruviga zid bo‘ladi. Shuning uchun fayl nomi, version, bootstrap va prerequisite havolalari saqlandi. Keyinchalik qayta nomlash taklif qilinsa, barcha havolalar va oldindan yozilgan migration markerlariga ta’siri alohida ko‘rib chiqilib tasdiqlanishi kerak.

Yangi migration:

- `telegram_otp_contacts.user_id` — nullable INTEGER FK → `users(id)`, `ON DELETE CASCADE`, `UNIQUE(bot_id,user_id)`.
- Eski contact qatorlarini accountga bog‘lamaydi; ma’lumot o‘chirmaydi.
- Contact/request chat CHECK’larini musbat BIGINT string ID’larni qo‘llash uchun kengaytiradi.
- `password_reset_requests.delivered_at` — muvaffaqiyatli yetkazish belgisi; avvalgi pending resetlar qayta kod so‘rashi kerak.
- `otp_request_limits` — scope/hash primary key, bounded counter va vaqt indeksi.
- `telegram_webhook_receipts` — bot/update primary key va vaqt indeksi.
- Migration markerini yozadi; qayta qo‘llashni aniq rad etadi. Tarixiy migrationlar tahrirlanmadi.

Bootstrap include/verify ro‘yxati va disposable eski OTP harness’i yangi migrationga moslashtirildi. Hech qanday migration, SQL yoki test DB ulanishi ushbu vazifada bajarilmadi. Kodni ishga tushirishdan oldin migration va yangi jadvallarga app role huquqlarini alohida tasdiqlash kerak; avtomatik GRANT yo‘q.

## Sozlamalar — faqat nomlar

Majburiy: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `OTP_HMAC_KEY`, `JWT_SECRET`.

Tanlov/production: `OTP_DELIVERY_ADAPTER`, `OTP_HMAC_KEY_ID`, `TELEGRAM_UPDATE_MODE`, `TELEGRAM_WEBHOOK_SECRET`, `NODE_ENV` va mavjud PostgreSQL ulanish sozlamalari.

`OTP_DELIVERY_ADAPTER=telegram` mavjud adapter. `test` faqat development/test muhitida ruxsat etiladi. `.env` qiymatlarini kodga ko‘chirmang; mavjud server `.env` yuklashini saqlaydi. Worker odatdagi `npm run telegram:worker` orqali yuklaydi; supervisor ishlatilsa secretlarni xavfsiz taqdim etish mumkin.

## Local va production

Local: webhookni Telegram tomonidan alohida olib tashlagandan keyin polling ishlatiladi. `TELEGRAM_UPDATE_MODE` berilmasa mavjud polling saqlanadi. Worker configured webhook bo‘lsa ishlashni rad etadi.

Production: `TELEGRAM_UPDATE_MODE=webhook`, mustaqil kriptografik secret (`[A-Za-z0-9_-]`, 32–256 belgi), HTTPS reverse proxy va Telegram `setWebhook` konfiguratsiyasi kerak. Secret `secret_token` parametriga aynan mos beriladi. `max_connections=1`, `allowed_updates=["message","callback_query"]` ishlatish tavsiya etiladi. Callbacklar mavjud booking handleriga uzatiladi. Bot identity’ni deployment paytida `getMe` bilan tekshirish kerak. Bu tashqi amallar ushbu ishda bajarilmadi.

Webhook va polling bir xil PostgreSQL session advisory lock’ini ishlatadi. Webhook callback tugagach lock egasi ulanishi destroy qilinadi; parallel nusxa `503` oladi. Receipt tartibsiz update ID’larini alohida hisoblaydi. Quyidagi ikkinchi bosqich o‘zgarishi webhook handleridagi DB amallari bilan receiptni bitta tashqi tranzaksiyaga oldi; polling cursor processing ushbu bosqichda o‘zgartirilmadi.

## Ikkinchi bosqich: Telegram javobi va webhook tranzaksiyasi

Avval API wrapper HTTP va `ok:true`ni tekshirib, Message tuzilishini tekshirmas edi. Endi `telegram/api.js` `sendMessage` uchun `ok === true`, HTTP muvaffaqiyati, musbat safe integer `result.message_id` va kutilgan numeric chat ID’ga aynan teng `result.chat.id` talab qiladi. ID’lar decimal string sifatida solishtiriladi; imprecise number rad etiladi. `services/telegramOtp.js` injected API uchun ham xuddi shu Message validatorini ishlatadi. `result`, message ID yoki chat mosligi yo‘q bo‘lsa, xavfsiz xato qaytadi, provider tavsifi/log URL’i chiqarilmaydi. Mavjud registration va reset service’laridagi `await sms.send()` tartibi saqlandi: adapter rad etsa registration issuance/budget/delivered rollback, reset esa generic javob bilan `delivered_at=NULL` qoladi. Service fayllarini qayta yozish talab qilinmadi.

Handlerning side-effect auditi:

| Amal | Yangi webhook kafolati / cheklov |
|---|---|
| IP’dan mustaqil Telegram rate counter | Handlerdagi counter va receipt bir tashqi DB tranzaksiyasida; takroriy committed update qayta counter sarflamaydi. |
| Challenge claim / chat biriktirish | UPDATE va receipt birga commit yoki rollback bo‘ladi. |
| Self-contact rezervi | Contact service SAVEPOINT’i tashqi commitga bo‘ysunadi. Receipt oldidagi uzilish rezervni ham rollback qiladi. |
| OTP issuance, history, send-count, delivered | Registration service SAVEPOINT’i va receipt bitta DB commitga kiradi. OTP transporti ushbu tranzaksiya ichida sinxron qoladi. |
| Barber link yaratish va tokenni iste’mol qilish | Link/token DB amallari receipt bilan birga commit qilinadi; bir martalik token himoyasi ham saqlanadi. |
| Booking statusini o‘zgartirish | Booking service SAVEPOINT’i tashqi commitga bo‘ysunadi; `pending` sharti qo‘shimcha idempotency beradi. Kutilgan 4xx biznes rad javoblari receipt bilan yakunlanadi. Raw DB va 5xx texnik xatolar handlerdan tashqariga chiqadi: outer rollback, receiptsiz `503` va Telegram retry. |
| Bot ko‘rsatmalari, link/status javoblari, callback answer va keyboard edit | Commitdan keyin best-effort yuboriladi. Crash paytida yo‘qolishi mumkin; durable outbox yo‘q. Reply xatosi committed biznes amalini qaytarmaydi. |

Variantlar taqqoslandi:

| Variant | Afzallik | Xarajat va chegara |
|---|---|---|
| Durable inbox + worker | Update payload qabul qilinganda mustaqil saqlanadi, worker retry/backoff va uzoq uzilishdan keyingi ishlov mumkin. | Yangi schema, payloaddagi telefon/tokenlarni himoyalash va retention, worker lifecycle, retry/lease kerak. Inboxning o‘zi handler commit/receipt oralig‘idagi takroriy biznes amalini yopmaydi; tranzaksion processing yoki idempotent consumer baribir kerak. |
| Tashqi tranzaksiya + mavjud receipt | Barcha ko‘rilgan DB amallari inject qilinadigan pool orqali ishlaydi; yangi schema va yangi worker talab qilmaydi. | Tashqi Telegram chaqiruvi rollback bo‘lmaydi; uzoq tarmoq kutishi DB locklarini ushlab turadi. Update payload lokal inboxga saqlanmaydi; commit bo‘lmagan update Telegram retry’siga tayanadi. |

Ikkinchi variant tanlandi. `telegram/transactionPool.js` service’larning `BEGIN/COMMIT/ROLLBACK`ini nomi ichki yaratilgan `SAVEPOINT/RELEASE/ROLLBACK TO SAVEPOINT`ga aylantiradi. Parallel yoki tugallanmagan service scope rad etiladi. Receipt tekshirish, handler DB amallari va receipt INSERT tashqi `BEGIN…COMMIT` ichida bajariladi. `COMMIT` natijasi ham tekshiriladi; `ROLLBACK` javobi muvaffaqiyat deb olinmaydi. Handlerdan keyin receipt yozishdan oldingi uzilish barcha hali commit qilinmagan DB amallarini bekor qiladi. Retry ularni qayta hisoblaydi, ammo oldingi urinishdan committed biznes yozuvi qolmaydi. Commit bajarilib HTTP javobi yo‘qolsa, qayta instance receiptni ko‘rib biznes amalini o‘tkazib yuboradi.

Webhookdagi oddiy javoblar `api` orqali kechiktiriladi; registration OTP esa alohida `otpApi` orqali darhol yuboriladi. To‘g‘ri Message tasdiqlanmaguncha delivered belgisi yozilmaydi. Telegram OTPni yetkazib, javob yo‘qolsa yoki outer commitdan oldin server uzilsa, foydalanuvchi olgan kod yaroqsiz bo‘lishi mumkin. Retry boshqa OTP xabarini yuborishi mumkin: tarmoqda ikki xabar bo‘lsa ham DB’da bitta committed issuance qoladi. Oddiy reply post-commit xatosida update `200` bilan tugaydi va biznes amali takrorlanmaydi; yo‘qolgan reply avtomatik qayta yuborilmaydi.

Bu **DB amallari + receipt atomikligi**, barcha tashqi side-effectlar uchun `exactly-once` emas. Durable inbox yo‘qligi sabab uzoq uzilish davomida Telegram retry saqlash oynasidan tashqari kafolat yo‘q. Polling hali cursorni alohida yozadi; uning crash/retry kafolati webhook bilan tenglashtirilmaydi. Barcha instance bir bot, PostgreSQL database va to‘g‘ridan-to‘g‘ri session lockni saqlaydigan ulanish infratuzilmasini ishlatishi kerak. Receiptni erta tozalash replay himoyasini yo‘qotadi. Ushbu processing tuzatishi mavjud `telegram_webhook_receipts` jadvalidan foydalanadi; `20261121` migrationi yoki boshqa tarixiy migration tahrirlanmadi, yangi migration ham talab qilinmadi.

Ikkinchi bosqich fayllari: `telegram/api.js`, `services/telegramOtp.js`, `telegram/webhook.js`, `telegram/handler.js`, yangi `telegram/transactionPool.js`; yangi `test/telegramDeliveryResponse.unit.test.js`, `test/telegramWebhookTransaction.unit.test.js`; mavjud `test/telegramOtp.unit.test.js`, `test/telegramAuthHardening.unit.test.js` va PostgreSQL testidagi transport fixture/ssenariylar. Natijalar `TESTING_STATUS.md`ga alohida yoziladi. Bu bosqichda `.env` o‘qilmadi va o‘zgartirilmadi.

## Webhook barqarorligi: lifecycle, deadline va booking retry

Chuqur auditdan keyin `webhookLifecycle.js` request doirasidagi client egasi sifatida qo‘shildi. `webhook.js` tashqi query va service SAVEPOINT query’larini shu helperdan o‘tkazadi. Umumiy application pool o‘zgartirilmaydi: webhook uchun uning mavjud connection/TLS sozlamalaridan alohida, eng ko‘pi 2 connectionli pool yaratiladi. `pg-pool` yashirgan non-enumerable password descriptor bilan ko‘chiriladi; credential qiymatlari chiqarilmaydi. Driverning native checkout/socket-connect timeouti yoqiladi. Bu qo‘shimcha pool uchun production connection budjetida 2 ta o‘rin hisobga olinishi kerak.

Standart application deadline siyosati:

| Operatsiya | Chegara | Timeoutdagi amal |
|---|---:|---|
| Pool checkout va connection olish | 2 soniya | `503`; native pg pool timer pending checkout/connectionni yakunlaydi. Request tugagach kech kelgan client bo‘lsa ham darhol destroy qilinadi. |
| Har bir DB query, shu jumladan SAVEPOINT va COMMIT | 5 soniya | Scope abort, physical client `release(true)` va hali ochiq socketni force destroy; yangi SQL yoki Telegram chaqirig‘i boshlanmaydi. |
| Tashqi ROLLBACK | 1 soniya | Healthy sessiondagina uriniladi. Xato/timeoutda session destroy qilinadi; aborted yoki yo‘qolgan sessionda ROLLBACK navbatga qo‘yilmaydi. Ichki savepoint rollback ham umumiy 5 soniyalik query chegarasiga kiradi. |
| Butun webhook processing | 30 soniya | Checkout, handler va post-commit reply’larni ham qamraydi. Abort signal orqali in-flight Telegram fetch bekor qilinadi; session destroy va ochiq HTTP uchun `503`. |

Bu faqat `Promise.race` emas: deadline sessionni physical destroy qilishga egalik qiladi. `release(true)` pooldan chiqaradi, ochiq driver socket esa force yopiladi. `pipeline=false` saqlanadi. Yakunlanmagan Promise’larning kech rejectionlari kuzatiladi; keyin qaytgan handler continuation’lari guard orqali DB/APIga kira olmaydi. Native clientning fon query’si sog‘lom poolga qaytarilib qolmaydi. Remote serverda query aynan qaysi millisekundda to‘xtashi TCP/PGga bog‘liq; tarmoq uzilishida allaqachon bajarilgan COMMITni inkor qilish mumkin emas. Shuning uchun commit javobi noaniq bo‘lsa retry receipt orqali yakuniy holatni tekshiradi.

Client olinishi bilan `error` va `end` listenerlari o‘rnatiladi. Kutilmagan connection-loss alohida flag va sanitize qilingan abort reason bilan belgilanadi. Shu signal OTP transporti va oddiy bot javoblariga uzatiladi; har bir yangi tashqi chaqiriqdan oldin scope tekshiriladi. `req.aborted` yoki tugallanmagan response `close` hodisasi ham scope’ni bekor qiladi. HTTP allaqachon yopilgan bo‘lsa yangi javob yozishga urinilmaydi; bunday holatda `503`ni foydalanuvchiga yetkazishning imkoni yo‘q.

Abort, dispose va physical client destroy idempotent. Bir clientga takroriy error/end hodisalari bir necha marta release qilmaydi. Request timerlari va listenerlari `finally`da tozalanadi; pg-pool release vaqtida o‘z error himoyasini qayta ulaydi. Normal yopilish yoki deadline tufayli o‘zimiz destroy qilgan socket kutilmagan connection-loss sifatida qayta belgilanmaydi. `transactionPool` ham tugagan scope’ni ikkinchi marta release qilmaydi, broken/tugallanmagan scope esa outer lifecycle’ni abort qiladi.

Booking callback siyosati: `BookingStatusError`ning 4xx qiymatlari — masalan, ruxsat yo‘qligi, booking topilmasligi, oldin ko‘rib chiqilganlik — foydalanuvchiga odatdagi javob va committed receipt bilan tugaydi. Raw PG/deadlock/transport xatolari va `BookingStatusError`ning 5xx holatlari biznes rad javobiga aylantirilmaydi: receipt commit qilinmaydi va ochiq HTTPga `503` qaytariladi. Mavjud booking status, `pending`, rol va ownership tekshiruvlari o‘zgartirilmadi. Bir xil update receipt orqali, boshqa update ichidagi takroriy callback esa service’ning `pending` sharti orqali himoyalanadi. Bu umumiy booking service’ni qayta yozishni talab qilmadi.

Telegram retry kafolati cheklangan: `503` qayta urinish uchun beriladi, ammo uning haqiqiy vaqti/saqlash muddati providerga bog‘liq. Commitdan oldingi texnik xato rollback bo‘lsa retry biznes amalini qayta bajarishi mumkin; commit allaqachon bajarilgan bo‘lsa receipt uni o‘tkazib yuboradi. Connection-loss yoki processing deadline post-commit paytida yuz bersa ham `503` berilishi mumkin, receipt saqlanadi. Oddiy post-commit Telegram yuborishining o‘z xatosi scope abort bo‘lmaganida avvalgidek best-effort `200` bilan tugaydi. OTP providerining avvalgi 8 soniyalik timeouti va uning registration xato siyosati saqlandi; u DB/session deadline’i bilan tenglashtirilmaydi. OTP oldindan yetib borgan bo‘lsa uni rollback qilish yoki tashqi `exactly-once`ni ta’minlash imkoni yo‘q.

Barqarorlik bosqichida o‘zgarganlar: `telegram/webhookLifecycle.js` (yangi), `telegram/webhook.js`, `telegram/transactionPool.js`, `telegram/bookingCallbacks.js`; yangi `test/telegramWebhookLifecycle.unit.test.js`; mavjud ikki webhook unit fixture’i EventEmitter’ga moslashtirildi. PostgreSQL testining fault-client wrapper’i physical client hodisalari/socketini delegatsiya qilish uchun moslashtirildi; integratsion test ishga tushirilmadi. `.env`, umumiy pool konfiguratsiyasi, auth/OTP/booking biznes qoidalari va migrationlar o‘zgartirilmadi. Natijalar `TESTING_STATUS.md`da.

NOT RUN: haqiqiy PostgreSQL connection-loss, socket/query cancellation, SQL timeout/rollback va ko‘p instance sinovlari; haqiqiy HTTPS webhook va Telegram retry/OTP yetkazish sinovlari. Driver socketini yopish yo‘li o‘rnatilgan `pg` implementatsiyasiga mos tekshirildi, lekin haqiqiy PostgreSQL bilan sinovsiz uning runtime kafolati tasdiqlanmagan.

`trust proxy=false` saqlandi. `X-Forwarded-For` bilan limit chetlab o‘tilmaydi. Reverse proxy ortida ilova barcha trafikni proxy IP sifatida ko‘rishi mumkin: productionda edge limit va faqat aniq ishonchli proxy konfiguratsiyasini operator ko‘rib chiqishi zarur. Limiter/receipt jadvallari vaqt indeksiga ega; retention va tozalash operator bilan alohida tasdiqlanadi, request ichida avtomatik DELETE yo‘q. Receiptni Telegram retry/replay oynasi tugashidan oldin o‘chirmang.

Reset known/unknown hisoblar uchun bir xil status, envelope va shartli xabar beradi; yetkazish kafolatlangani aytilmaydi. Production controller start/resend javobini kamida 9 soniyagacha kechiktiradi; bu Telegramning 8 soniyalik timeouti tufayli odatiy timing farqini yashiradi va frontendning 15 soniyalik chegarasiga sig‘adi. Og‘ir DB lock/tarmoq kechikishi 9 soniyadan oshsa timing farqi qolishi mumkin; barcha nosozlik holatlarida kuchli timing himoyasi uchun alohida durable delivery queue kerak.

## Eski hisoblarni tiklash

### Mahalliy OTP nosozligining tasdiqlangan sababi — 2026-11-17

Foydalanuvchining alohida read-only diagnostika ruxsati bilan amaldagi mahalliy `ustara_db.public` sxemasi faqat `READ ONLY` tranzaksiyada tekshirildi. Foydalanuvchi qatorlari o‘qilmadi va hech qanday DB yozuvi yoki migration bajarilmadi. Telegram konfiguratsiyasi, HMAC readiness va Telegram adapter tanlovi valid. Local rejim polling; webhook rejimi yoqilmagan. Secret qiymatlar chiqarilmadi, `.env` o‘zgartirilmadi. Bu konfiguratsiya tekshiruvi haqiqiy Telegram token avtorizatsiyasi yoki yetkazish isboti emas.

`20261119_telegram_otp_delivery` va uning registration/reset/barber-link prerequisite markerlari mavjud. `20261120_telegram_registration_requests` hamda `20261121_telegram_auth_hardening` markerlari yo‘q. `telegram_registration_requests`, `otp_request_limits`, `telegram_webhook_receipts` jadvallari, contact `user_id` va reset `delivered_at` ustunlari mavjud emas.

Shu sxemada birinchi registration POST request `otpIpLimit → createOtpRateLimit → otp_request_limits` bosqichida to‘xtaydi. Limiterning catch’i storage xatosini `otp_unavailable`ga aylantiradi; frontend esa «Tasdiqlash kodi xizmati hozir ishlamayapti» deb ko‘rsatadi. Bu Telegram sendMessage xatosi emas: challenge va yuborishgacha yetib borilmaydi. Jadval yo‘qligi read-only katalog orqali tasdiqlandi; diagnostika uchun haqiqiy UPSERT yoki registration POST bajarilmadi.

Limiter endi faqat belgilangan stage/reason kategoriyalarini log qiladi: schema yo‘qligi, schema mos emasligi, huquq, connection, timeout, OTP konfiguratsiyasi yoki umumiy storage xatosi. Raw error, detail, SQL, telefon, IP, OTP va kalitlar log qilinmaydi. Public javob va fail-closed himoya saqlandi; bu diagnostika sxema yetishmasligining o‘rnini bosmaydi.

Minimal ishga tushirish rejasi: faqat `20261120_telegram_registration_requests.sql`, keyin `20261121_telegram_auth_hardening.sql`ni alohida yozish ruxsati bilan qo‘llash. `20261120` bitta challenge jadvali/FK/indeks yaratadi; `20261121` limiter/receipt jadvallari va kerakli account/delivery ustunlarini qo‘shadi. Mavjud account/contactlar avtomatik bog‘lanmaydi, foydalanuvchi ma’lumotlari o‘chirilmaydi. Read-only preflight prerequisite markerlari, contact CHECK nomi, schema CREATE va ALTER target egaligi mavjudligini tasdiqladi. Bular migration bajarilganini bildirmaydi. Migrationlar tasdiqlanmaguncha bajarilmaydi.

Keyingi operatsion qadamlar: backendni qayta yuklash, local polling worker holatini tekshirish va zarur bo‘lsa alohida ruxsat bilan ishga tushirish. Worker ishga tushishi real Telegram API va bot state yozuvlarini ishlatadi; read-only ruxsat buni qamramaydi. Hozircha Telegram API chaqiruvi, account yaratish yoki OTP yuborish bajarilmadi. Ishlaydigan holat va to‘liq E2E hali tasdiqlanmagan.

Eski contactlar yoki barber notification bog‘lanishi auth uchun avtomatik isbot emas. Telegramga bog‘lanmagan accountga reset kodi yuborilmaydi. Sayt va bot administratorga murojaat qilishni ko‘rsatadi. Administrator uchun yangi bypass endpoint yaratilmagan. Account egaligini mustaqil tekshirish, keyin audit qilinadigan xavfsiz bog‘lash/tiklash siyosatini operator tasdiqlashi kerak; bu jarayon tasdiqlanmaguncha eski account recovery cheklangan.

## Tekshirish va qolgan ishlar

Aniq bajarilgan testlar `TESTING_STATUS.md` oxirida qayd etiladi. Mock parallel test PostgreSQL lock isboti sifatida ko‘rsatilmaydi.

`test/telegram-auth.postgres.integration.test.js` haqiqiy PostgreSQL service tranzaksiyalari uchun tayyorlandi, lekin bajarilmadi. U faqat `NODE_ENV=test`, `USTARA_TEST_DATABASE_URL` va `USTARA_TELEGRAM_AUTH_TESTS=I_AUTHORIZE_TEST_DATA` aniq berilganda ishlaydi; faqat local `ustara_test_db`, `ustara_account_test`, non-superuser va oldindan qo‘llangan migration talab qilinadi. Telegram tarmog‘i mock; SQL/tranzaksiya/lock/constraint haqiqiy bo‘ladi. DDL/migration bajarmaydi; random test telefonlari va account ID’larinigina tozalaydi.

Release oldidan alohida ruxsat bilan migrationni qo‘llash va PostgreSQL testini bajarish, real bot webhook/polling, bloklangan bot, timeout, mobil Telegramga o‘tish/qaytish, paste/boshlang‘ich nol/countdown, restart va parallel API/worker jarayonlarini qo‘lda tekshirish zarur. Ushbu tekshiruvlarsiz production tayyorligi tasdiqlanmagan.

Rasmiy manbalar: [Telegram Bot API — webhook va secret_token](https://core.telegram.org/bots/api#setwebhook), [deep linking](https://core.telegram.org/bots/features#deep-linking), [contact](https://core.telegram.org/bots/api#contact).
