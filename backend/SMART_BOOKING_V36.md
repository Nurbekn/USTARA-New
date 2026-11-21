# USTARA — v36 / xavfsiz Smart Booking va staging QA

## 4 amaliy ish
1. `manualQueueClaims.issue`: account identity (`FOR SHARE OF b,u`) barbershop advisory lockdan OLDIN olinadi. Ruxsatsiz hisob lockga ham kirmaydi; deadlock xavfi kamayadi.
2. `smartBookingConfirmation.services`: QR proof (`FOR SHARE OF r`) va manual account (`FOR SHARE OF c,u`) + customer consent (`FOR SHARE OF q,m`) bitta READ tranzaksiyasida COMMITgacha ushlab turiladi. Narx faqat ko‘rish uchun, yakuniy narx/davomiylik `confirm`da qayta tekshiriladi.
3. `smartBookingV36.unit.test.js`: 10 ta yangi regressiya testi (inactive barber/customer, QR yoki manual revoke, expired offer, Telegram forged callbacks).
4. `scripts/v36-staging.js`: 4 real PostgreSQL test faylini faqat maxsus `ustara_test_db`, `ustara_account_test`, loopback host, `NODE_ENV=test`, aniq opt-in bo‘lsa ishga tushiradi. `v36StagingGuard.unit.test.js`: 2 ta yangi test. Real test server bo‘lmasa fail-closed, hech qachon productionga ulanmasin.

## Sinovlar (shu versiyada)
- `cd backend && npm run test:smart-booking:v36`: **89/89 PASS**.
- `cd frontend && npm run test:unit`: **156/156 PASS**.
- Backend barcha `.unit.test.js`: **285 PASS / 26 FAIL**. Barcha 26 ta xato `MODULE_NOT_FOUND` (bcrypt, express, jsonwebtoken, pg); to‘liq test o'tmadi.
- `npm ci` tarmoq/package registry javobi yo‘qligi sabab yakunlanmadi; npm dependency o‘rnatilmadi. `npm run build` -> `vite: not found`; `npm run lint` -> `eslint: not found`. Real PostgreSQL/mobile/Telegram E2E bajarilmadi.
- `node backend/scripts/audit-phase1.js`: 185 qaror / 40 migration PASS (faqat strukturaviy audit).
- SQL migratsiya: **yangisi yo‘q**.

## Real staging testini xavfsiz ishga tushirish
1. Tarmoq ishlaydigan kompyuterda backend va frontend uchun alohida `npm ci` bajaring, backenddagi `pg` o‘rnatilgan bo‘lsin.
2. Lokal PostgreSQLda **alohida** `ustara_test_db` va superuser bo‘lmagan `ustara_account_test` akkauntini tayyorlang; 40 migratsiyani avval faqat shu test bazasiga qo‘llang. Production bazani ishlatmang.
3. Test URLni terminalning xavfsiz muhitida `USTARA_TEST_DATABASE_URL`ga bering (parolni hech qayerga repo/ZIPga saqlamang).
4. `cd backend && NODE_ENV=test USTARA_V36_STAGING=I_AUTHORIZE_LOCAL_STAGING npm run test:smart-booking:v36:db`.
   Runner ulanishni avval `current_database`, `session_user`, `current_user`, `is_superuser` bilan tekshiradi. Keyin v28/v29/v30 read-only tekshiruvlari va v35 ephemeral ownership row-lock testini ketma-ket ishlatadi; hech qanday real chat/APIga qo‘ng‘iroq qilmaydi.
5. Hamma `PASS` bo‘lmasa deployni to‘xtating. Test bajarilgani haqidagi dalillarni checkpointga kiriting.

## Keyingi ishlar
- npm registry ulanishi va barcha dependencyli backend test, Vite build + ESLint.
- Lokal staging PG to‘liq test, v36 runner, haqiqiy Telegram webhook callback/opt-out E2E.
- Mobil QR va manual Smart Booking E2E, vaqt cheklovlari, offline/retry, accessibility.
- `docs/USTARA_DECISION_GAPS_v36.md`dagi 185 qarorni dalillar bilan yopish. #175 shop modeli aniq kelishilmaguncha o‘chirishni boshlamang.

**Status:** NOT production-ready. ZIPda `.env`, `node_modules`, `dist`, auth token, password va kalitlar yo‘q.
