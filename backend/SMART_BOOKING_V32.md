# USTARA v32 — manual Smart Booking takroriy tasdiqlash va sinovlar

**Asos:** v31. Hech qanday SQL migratsiya qo‘shilmadi; mavjud migratsiyalar soni 40.

## Tuzatilgan holat

Manual (QRsiz) navbatdagi mijoz Smart Booking taklifini tasdiqlasa, bitta haqiqiy bron yaratiladi va `walkin_queue.status` `waiting` dan `left` ga o‘tadi. v31 dagi `ownedEntry()` faqat `waiting` navbatni qaytarardi. Shuning uchun birinchi HTTP javob yo‘qolgach, takroriy `confirm` so‘rovi mavjud bronni qaytarish o‘rniga `404 offer_missing` bilan tugashi mumkin edi.

v32 da `ownedEntry(c,offerId,customerId,{allowConfirmedReplay:true})` **faqat confirmation oqimi uchun** `left` ticketni qabul qiladi, lekin ikki shart bajarilishi kerak: (1) `walkin_manual_claims.customer_id` va `consent_at` hali shu mijozga tegishli; (2) `smart_booking_confirmations`da aynan shu taklif va shu mijozning tasdiqlangan yozuvi mavjud. Taklifga qaror berish va xizmatlar katalogi oqimi avvalgidek faqat `waiting` holatini qabul qiladi. Confirmation hali ham mijoz akkauntini va barber/offer/queue qulflarini tekshiradi; bron yaratishdan oldin manual egalik qayta tekshiriladi. Takroriy chaqiruv mavjud bronni qaytaradi, yangi bron yaratmaydi.

**Cheklov:** rozilik bekor qilingach manual bog‘lanish o‘chiriladi va bu yopiq taklif orqali replay ruxsati ham yo‘qoladi. Mijoz bronini odatiy Bronlar sahifasidan boshqaradi. Bu himoya faqat manual Smart Booking oqimiga tegishli.

## Avtomatik test (offline)

Loyiha ildizidan:

```bash
cd backend
npm run test:smart-booking:v32
node --test test/*.unit.test.js
node scripts/audit-phase1.js
cd ../frontend
node --test test/*.test.js
```

v32 muhitida tanlangan backend 55/55, frontend 155/155, offline audit 185 qaror / 40 migratsiya PASS. Barcha backend unitlarda 256 PASS / 26 FAIL: `bcrypt`, `express`, `jsonwebtoken`, `pg` paketi yo‘qligi sabab ayrim test fayllari ishga tushmadi. `npm ci`ni ulanish cheklovi tufayli tugatib bo‘lmadi. **Bu kodning 26 testi muvaffaqiyatli o‘tganini anglatmaydi.**

## Test bazasi va deploymentdan oldingi majburiy ishlar

1. Alohida **lokal** PostgreSQL `ustara_test_db`, cheklangan `ustara_account_test` rolini operator tomonidan sozlash; hech qachon production URL ishlatmaslik. Hozirgi muhitda PostgreSQL serveri yo‘q, bazaga ulanilmadi.
2. Istalgan migratsiyani bajarishdan oldin operatorning **aniq ruxsati**, backup va migratsiya tartibini tekshirish talab qilinadi. v32 hech qanday migratsiya bajarmadi.
3. `backend` va `frontend` ichida `npm ci` muvaffaqiyatli tugagach, backend barcha unit testlari, frontend testlar, `npm run build`, `npm run lint`ni takrorlash. Production build/lint v32 muhitida bajarilmadi.
4. v30 read-only katalog/advisory-lock staging testi, faqat ruxsat etilgan lokal test bazasida:

```bash
cd backend
NODE_ENV=test USTARA_SMART_V30_DB_AUDIT=I_AUTHORIZE_READ_ONLY_TEST \
 USTARA_TEST_DATABASE_URL="$USTARA_TEST_DATABASE_URL" \
 node --test test/smartBookingV30.postgres.integration.test.js
```

Bu test **haqiqiy `claim/revoke/confirm` DML poygasini isbotlamaydi**. Ikki sessiya bilan real bron yaratish, consent revoke, worker expiry va exclusion conflict uchun alohida izolyatsiyalangan fixture sinovlari hanuz qolgan. SQL migratsiya va test-fixture yozuvlari operator ruxsatisiz ishga tushirilmasin.
5. Telegram bot webhook/callback va mobil brauzer E2E haqiqiy staging muhitida sinovdan o‘tkazilsin. Telegram xabar yetkazish exactly-once emas.

**Natija:** v32 — muhim idempotency tuzatishi va offline regression, lekin production-ready emas. `.env`, parollar, tokenlar, `node_modules`, `dist` ZIPga kiritilmaydi.
