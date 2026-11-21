# USTARA — doimiy ish jurnali (PROGRESS)

**Qoidamiz:** navbatdagi bosqichda doim **eng oxirgi ZIP** asos bo‘ladi. Bajarilgan ishlarni qayta yasamaymiz. Qarorlar reyestri `docs/USTARA_185_NAZORAT.csv`. Ishlashdan oldin faqat ushbu PROGRESS va so‘nggi o‘zgargan kod qismlarini o‘qiymiz.

## Bosqichlar

| Bosqich | Holati | Natija |
| --- | --- | --- |
| 1 — Audit | Strukturaviy audit bajarilgan | 185 qaror CSV, migratsiya tartibi, test va audit scripti. |
| 2 — Akkaunt/DB/xavfsizlik | **Qisman. Davom etadi** | v4: CORS/headers/JWT/revoke-all; v5: #135 akkaunt pauza; v6: #140 yordam so‘rovi; **v7: #84 qurilmalar sessiyalari; v8: izolyatsiyalangan Stage 2 DB test kodi va Recovery IP himoyasi.** Real DB sinovi qolgan. |
| 3 — Bron yadrosi | **Boshlandi, qisman** | **v9 #144 idempotency; v10 slot grid; v11 narx snapshoti; v12 #106 ko‘chirish va #162 service-edit backend (qisman).** Real DB tekshiruvlari davom etadi. |
| 4–10 | Navbatda | `docs/USTARA_10_BOSQICH_REJA.md`. |

## v5 / 2-bosqich davomida bajarilganlar

1. `backend/database/migrations/20261126_account_pause.sql` — `users.deactivated_at TIMESTAMPTZ` ni qo‘shadigan **forward-only migratsiya tayyorlandi**, hozircha ishga tushirilmadi. Fresh bootstrap ro‘yxati va final migratsiya inventari ham yangilandi (25 forward migration).
2. `backend/controllers/accountPauseController.js`, `backend/routes/auth.js` — autentifikatsiyalangan Customer/Barber parolini qayta tasdiqlab, akkauntni vaqtincha faolsizlantiradi. Faol va kelajakdagi bronlar mavjud bo‘lsa 409 bilan rad etiladi; hech qanday bron avtomatik o‘chirilmaydi. Urinishlar mavjud login limiter bilan cheklanadi; sessiya versiyasi oshiriladi.
3. `backend/middleware/accountIdentity.js` — faolsiz akkauntning eski JWT tokenlari API’ga kirishi to‘xtaydi.
4. `backend/services/loginAuthentication.js` — to‘g‘ri parol bilan kirishda faolsiz akkauntga 423 kod qaytadi; faqat foydalanuvchi `reactivate:true` ni ongli tasdiqlagandan so‘ng DB tranzaksiyada faollashtirish va barcha eski sessiyalarni bekor qilish amalga oshadi.
5. `frontend/src/components/DeactivateAccountAction.jsx`, Customer/Barber Profile va Login — parol bilan faolsizlantirish hamda kirishda qayta faollashtirish interfeysi.
6. `backend/controllers/bookingsController.js`, `backend/services/multiBooking.js` — faolsiz Customer va Barber uchun yangi bron yaratilishini himoyalash; barber row va user row lock protokoli deactivation/booking poygasini hal qiladi.
7. `backend/test/accountPause.unit.test.js` va `backend/test/loginProtection.unit.test.js` — yangi unit testlar; eski bron mock/struktura testlari yangi migratsiyaga moslashtirildi. `docs/USTARA_185_NAZORAT.csv` #135 yangilandi.

## v5 sinov natijalari

- `backend/npm test`: **287/287 unit test PASS**.
- `frontend/npm test`: **114/114 unit test PASS**.
- `frontend/node node_modules/vite/bin/vite.js build`: **PASS**.
- `backend/npm run audit:phase1`: **185 qaror, 25 forward migratsiya, offline tekshiruv PASS**.
- **Bajarilmadi:** real PostgreSQL migratsiyasi, Telegram / Gemini real API sinovlari, browser E2E, concurrency DB integratsiyasi. `psql` muhiti yo‘qligi sababli production va real DB’ga ulanilmadi.


## v6 / 2-bosqich davomida bajarilganlar (2026-11-18)

**Manba:** `USTARA-2-Bosqich-Account-Pause-v5.zip`. Oldingi v5 source saqlandi; ishlab chiqish unga yangi imkoniyat sifatida qo‘shildi.

1. `backend/services/manualAccountRecovery.js`, `backend/controllers/manualAccountRecoveryController.js` — #140 bo‘yicha OTP/telefon/Telegram ishlamasa, yordam so‘rovi ochish va maxfiy kuzatuv tokeni bilan holatni tekshirish. Raqam ma’lum/nomalumligiga bir xil umumiy javob; HMAC asosidagi PostgreSQL rate-limit; tranzaksiya va audit. **Hech qanday parol, telefon, Telegram va JWT sessiya o‘zgarmaydi.**
2. `backend/routes/auth.js`, `backend/routes/admin.js` — public, throttled `/api/auth/account-recovery/start|status`; faqat Admin uchun `/api/admin/account-recovery/cases` va `/:id/review` endpointlari. Har bir Admin status o‘zgarishiga sabab yoziladi, yopilgan so‘rov qayta ochilmaydi.
3. `frontend/src/pages/auth/AccountRecovery.jsx`, `App.jsx`, `ForgotPassword.jsx` — foydalanuvchi uchun yordam so‘rovi va status tekshirish sahifasi; mavjud parol tiklash oynasidan havola. `AdminPanel.jsx` — **Tiklash** bo‘limi, telefon va so‘rov holatlari, review/verification_needed/closed amallari.
4. `backend/database/migrations/20261127_manual_account_recovery.sql` — ikkita jadval `manual_recovery_cases`, `manual_recovery_events` bilan yangi forward-only migratsiya. `bootstrap.sql` va `bootstrap/verify.sql` sinxronlashtirildi (26 forward migratsiya). Eski tarixiy migratsiyalar o‘zgarmadi.
5. `backend/test/manualAccountRecovery.unit.test.js` — 5 ta unit test: noma’lum/ma’lum raqamga umumiy javob, token maxfiyligi, Admin huquqi, tranzaksiya rollback, limit. Yana offline audit va bootstrap testlarining kutilgan migratsiya soni yangilandi. `backend/ACCOUNT_RECOVERY_SUPPORT.md` yaratilgan. `docs/USTARA_185_NAZORAT.csv` ning #140 holati yangilandi.

**v6 sinov holati:** `node --test test/manualAccountRecovery.unit.test.js test/audit-phase1.unit.test.js test/bootstrap-plan.unit.test.js` — **19/19 PASS**. `node scripts/audit-phase1.js` — 185 qaror va 26 migratsiya reyestri PASS. O‘zgargan 4 ta JSX fayli TypeScript JSX parser bilan sintaksis tekshiruvdan o‘tdi; backend yangi JS fayllari `node --check` bilan tekshirildi.

**Cheklov:** npm paketlarini to‘liq o‘rnatish imkoni bo‘lmadi (`ENOTCACHED` va registry kutish muddati), shu sabab **backend barcha 287+ unit testlari, frontend 114 test va build v6 da qayta bajarilmadi**. Real PostgreSQL, OTP/Telegram, Admin browser E2E ham hali bajarilmadi. Ushbu v6 **production-ready emas**.

**v6 dan keyin v7 yangilandi.** Avval `USTARA-2-Bosqich-Device-Sessions-v7.zip` dan boshlash; izolyatsiyalangan test PostgreSQL’da 20261126+20261127 migratsiyalari va actual login/phone-change/account-pause/recovery integratsiyasini ishlatish; ticket orqali haqiqiy identity verification va raqam tiklashni xavfsiz tasdiqlash qoidalarini alohida belgilash; #84 qurilmalar ro‘yxati va audit. Tokenlar/kalitlar ZIP ichida saqlanmaydi.

## 2-bosqichda qolganlar

1. **Migratsiyani izolyatsiyalangan test PostgreSQL’da qo‘lda tasdiqlab ishga tushirish, transaction isolation va yangi account pause, login, bron race bo‘yicha real integratsiya sinovlari.** Live/production bazaga avtomatik tegmaslik.
2. **#140** Professional Account Recovery: Telegram, telefon almashtirish, tiklash ishlarini haqiqiy bazada E2E; xavfsiz Admin review va audit hali to‘liq emas.
3. **#84** Sessiyalar qurilmalar ro‘yxati va tekshiruvlari; #135 uchun kelajakda qo‘shiladigan haqiqiy navbat/walk-in larni ham bloklaydigan himoya (navbat modeli 4-bosqichda yaratiladi).
4. Deployment CORS domeni, reverse-proxy/IP xavfsizligi va real browser E2E.

## Keyingi safar qayerdan boshlash kerak?

- **Asos fayl: `USTARA-2-Bosqich-Device-Sessions-v7.zip`**, oldingi v6 emas.
- Faqat `docs/USTARA_PROGRESS.md`, `docs/USTARA_185_NAZORAT.csv` va shu yangilanish fayllarini o‘qing.
- 2-bosqichdagi real DB va recovery ishlari bajarilgach, 3-bosqichga o‘ting.
- Yangi testlar, bajarilish holati va o‘zgargan fayllarni yangilang; ZIP versiyani oshiring.
- Telegram bot tokeni, Gemini API kaliti va real `.env` ZIP’ga kiritilmasin.

**Holat:** 185 ta qaror hali to‘liq bajarilmagan. #135 va #140 ham real DB/integratsiya tekshiruvigacha qisman tayyor.

## v7 / 2-bosqich davomida bajarilganlar (2026-11-18)

**Asos ZIP:** `USTARA-2-Bosqich-Recovery-v6.zip` (v5 yoki oldingi ZIP emas).

1. **#84 — qurilma sessiyalari:** `backend/services/deviceSessions.js` yangi foydalanuvchi login/registration JWT’lariga tasodifiy `sid` biriktiradi, `account_device_sessions` jadvalida faqat qurilma turi va muddati saqlanadi; raw OTP, bearer token, IP yoki to‘liq User-Agent saqlanmaydi.
2. **Server ruxsatlari:** `authMiddleware` yangi `sid` bilan kelgan JWT’ning faol/tegishli hisobga tegishli ekanini tekshiradi; bekor qilingan sessiya rad etiladi. Oldingi sid’siz JWT’lar 7 kunlik eski expiry muddatigacha `sessionVersion` tekshiruvi bilan qabul qilinadi (orqaga moslik). `sessionsController` da qurilmalarni ro‘yxatlash va alohida bekor qilish endpointlari qo‘shildi. Avvalgi revoke-all saqlandi.
3. **UI:** Customer va Barber Profil bo‘limlarida `DeviceSessionsPanel` mavjud; qurilma nomi, kirilgan vaqt, “Joriy” holati va “Chiqish”. Boshqa foydalanuvchi yoki boshqa akkaunt sessiyasini bekor qilish mumkin emas.
4. **PostgreSQL:** forward-only `20261128_device_sessions.sql` — faqat ruxsat etilgan schema va oldingi 20261127 migratsiyadan keyin qo‘llanadi. Bootstrap/verify ro‘yxati 27 migratsiyaga yangilandi. Production bazaga **hech narsa qo‘llanmagan**.
5. **Tekshiruv:** `node --test test/deviceSessions.unit.test.js test/audit-phase1.unit.test.js test/bootstrap-plan.unit.test.js` — **18/18 PASS**; `node scripts/audit-phase1.js` — 185 qaror, 27 migratsiya PASS. Boshqa backend testlari, frontend build, real PostgreSQL, haqiqiy Telegram, brauzer E2E ushbu muhitda to‘liq ishga tushirilmagan.
6. `docs/USTARA_185_NAZORAT.csv` #84 yangilandi. `USTARA-2-Bosqich-Device-Sessions-v7.zip` — navbatdagi asos.

**Muhim cheklovlar:** eski sid’siz JWT’lar amaldagi expiry muddatigacha device list’da ko‘rinmasligi mumkin. Qayta login qilingach yangi session ro‘yxatda ko‘rinadi. 2-bosqich hanuz **qisman**; real DB migratsiyasi, Account Recovery identity-verification va login/phone-change E2E qolgan.

**Keyingi safar:** v7 ZIP dan, aynan ushbu ish jurnalidan va `docs/USTARA_185_NAZORAT.csv` dan boshlang; endi real test PostgreSQL’da v6/v7 migratsiyalar hamda account session lifecycle sinovlari kerak. Real DB bo‘lmasa, integration test kodini izolyatsiya va xavfsizlik shartlari bilan tayyorlash; production DB’ga ulanmaslik.


## v8 / 2-bosqich davomida bajarilganlar (2026-11-18)

**Asos fayl:** `USTARA-2-Bosqich-Device-Sessions-v7.zip`. v7 ni boshidan yaratmadik; shu asosda v8 chiqarildi.

1. `backend/middleware/accountIdentity.js` va `backend/middleware/authMiddleware.js` — oldingi JWT/admin/sid tekshiruvini saqlagan holda testga **izolyatsiyalangan PostgreSQL pool** uzatish imkoniyati qo‘shildi (`createAuthMiddleware`). Production default export oldingidek ishlaydi, qo‘shimcha real bazaga ulanmaydi.
2. `backend/test/stage2AccountRecovery.postgres.integration.test.js` — #84, #135, #140 bo‘yicha **haqiqiy DB sinov kodi**. Unga alohida `USTARA_STAGE2_SECURITY_TESTS=I_AUTHORIZE_STAGE2_DB_TEST` opt-in kerak; oldingi harness `NODE_ENV=test`, `ustara_test_db` local URL, non-superuser va test schema OID/owner tekshiruvini amalga oshiradi. Sinov ishlatilsa: login/sid/revoke/JWT, deactivation/reactivation, tiklash ticketi, Admin audit, migratsiya markerlarini tekshiradi. **Bu v8 ish muhitida real PostgreSQL mavjud emas, shuning uchun SKIP; sinovdan o‘tgan deb yozilmaydi.**
3. `backend/controllers/manualAccountRecoveryController.js` — ommaviy tiklash endpoints uchun spoof qilinadigan `req.ip` yoki `X-Forwarded-For` emas, to‘g‘ridan-to‘g‘ri socket peer manzili olinadi, login limiter bilan bir xil. IP mavjud bo‘lmasa, so‘rov xavfsiz rad etiladi. Admin ko‘rish/qaror endpoints uchun peer talab qilinmaydi.
4. `backend/test/manualAccountRecovery.unit.test.js` — soxta X-Forwarded-For bilan cheklovni aylanib o‘tishni rad qiladigan yangi unit test; `backend/package.json` da `test:stage2:db`; `backend/STAGE2_DATABASE_INTEGRATION.md` da faqat lokal test PostgreSQL’da qanday ishga tushirish yo‘riqnomasi.
5. `docs/USTARA_185_NAZORAT.csv` #84, #135, #140 uchun v8 test kodi **tayyor lekin real DB da bajarilmagan** izohi qo‘shildi. Hech bir real akkaunt/bron, telefon yoki token ZIP’ga ko‘chirilmadi.

**v8 sinov natijalari:** `node --test test/manualAccountRecovery.unit.test.js` — **6/6 PASS**. Offline migration/audit/test-DB-target suite — **18 PASS + 1 SKIP (PostgreSQL)**, 0 FAIL. `node scripts/audit-phase1.js` — **185 qaror, 27 forward migration PASS**. O‘zgargan JS fayllar `node --check` dan o‘tdi.

**v8 cheklovi:** `npm ci --offline` -> `ENOTCACHED` (cache’da `xtend` yo‘q), paketlarni to‘liq o‘rnatib, frontend build va barcha backend unit testlarini qayta ishlatib bo‘lmadi. Real PostgreSQL server/CLI yo‘q; o‘zimizning DB testimiz SKIP bo‘ldi. Haqiqiy Telegram/Gemini E2E ham bajarilmadi. **2-bosqich hali yakunlanmagan va v8 production-ready emas.**

**Keyingi safar aynan qayerdan:** `USTARA-2-Bosqich-DB-Tests-v8.zip` + ushbu jurnal. Kerak bo‘lsa foydalanuvchining Ubuntu kompyuterida maxsus **local test** PostgreSQL tayyorlab, `backend/STAGE2_DATABASE_INTEGRATION.md` buyruqlari bilan E2E testlarni bajarish. Hech qachon production bazasida sinov qilmang. Xavfsiz identity-proof/recovery, browser E2E va deploy cheklovlarini keyin yopish; shundan keyin 3-bosqich (bron yadrosi).


## v9 / 3-bosqich — Bron so‘rovini takrorlash himoyasi (2026-11-18)

**Asos:** `USTARA-2-Bosqich-DB-Tests-v8.zip`; v8 va oldingi xavfsizlik o‘zgarishlari saqlangan. **3-bosqich qisman boshlandi**, 2-bosqichning real DB/regressiya tekshiruvlari ochiq qoladi.

1. `backend/services/bookingIdempotency.js` — 144-qaror: UUID v4 so‘rov ID, canonical barber/xizmat/UTC-vaqt fingerprint, qayta yuborilganda asl bronni va snapshot xizmatlarini olish. Boshqa mazmundagi so‘rov bir xil ID bilan kelsa `409 request_id_reused`.
2. `backend/services/multiBooking.js` va `backend/controllers/bookingsController.js` — Customer profil row-lock ostida request ID tekshiriladi; yangi bron va idempotency yozuvi bitta tranzaksiyada commit qilinadi. Qayta so‘rovda **eski bron qaytariladi, yangi Telegram xabari yuborilmaydi**. Eskidan `request_id` yubormaydigan mijozlarga legacy ishlash tartibi qoladi. Bitta xizmat legacy yo‘lida ham 5 daqiqalik qadam tekshiriladi.
3. `frontend/src/pages/user/barber/createBooking.js` — tasdiqlash urinishiga noyob UUID v4 beriladi. Internet uzilganda aynan o‘sha urinish uchun keyingi so‘rov **o‘sha UUID** bilan ketadi. Tabning sessionStorage’iga faqat xizmat/tanlov identifikatori va request ID saqlanadi, JWT saqlanmaydi; muvaffaqiyatli javob yoki aniq rad javobidan keyin tozalanadi. `InlineBooking.jsx`da bron noaniq holati haqida xavfsiz ogohlantirish.
4. `backend/database/migrations/20261129_booking_idempotency.sql` — yangi **forward-only** `booking_request_keys` jadvali. `bootstrap.sql`/`bootstrap/verify.sql` inventari yangilandi: **28 migratsiya**. Eski bronlar o‘zgarmaydi. Hech qanday production bazaga tegilmagan. Yangi frontend/endpointni ishga tushirishdan avval migratsiya operator tomonidan alohida tekshirilishi va qo‘llanishi kerak, aks holda yangi request ID bilan yuborilgan bron `503 migration_required` qaytaradi.
5. `backend/test/bookingIdempotency.unit.test.js`, `frontend/test/createBooking.test.js` — fingerprint/replay/409/migratsiya yo‘qligi, internet xatosidan keyingi takroriy ID va tab reload holatlariga test. `backend/BOOKING.md`, `backend/database/bootstrap/README.md`, audit va qaror CSV #144 yangilandi.

**v9 test natijalari:** `node --test frontend/test/*.test.js` — **117/117 PASS**; backendning idempotency + bootstrap + audit + test-DB-target mustaqil suite’i **23/23 PASS**; umumiy tanlangan testlarda **30/30 PASS** (o‘zaro ustma-ust testlar). `node backend/scripts/audit-phase1.js` — **185 qaror va 28 forward migratsiya PASS**. `node --check` o‘zgargan backend JS fayllarida PASS.

**Qolganlar:** Real PostgreSQL’da yangi migratsiya, parallel POST/replay/test va barcha legacy+multi oqimlarining E2E sinovlari bajarilmadi; backend barcha testlari va frontend Vite build bu muhitda bog‘liqliklar yetishmagani sabab qayta ishga tushirilmadi. Telegram real API, Gemini AI real ulanishi hali tekshirilmagan. Bu v9 **production-ready emas**.

**Keyingi safar:** `USTARA-3-Bosqich-Booking-Idempotency-v9.zip` + ushbu `USTARA_PROGRESS.md` dan boshlang. Birinchi navbatda real disposable PostgreSQL’da 28-migratsiya va #144 replay concurrency E2E; keyin slot, bron o‘zgartirish, jadval va narx snapshotini navbat bilan yakunlash. Real API tokenlari yoki production DB creds ZIP’ga kiritilmaydi.

## v10 / 3-bosqich — Slot grid va post-commit Telegram himoyasi (2026-11-18)

**Asos ZIP:** `USTARA-3-Bosqich-Booking-Idempotency-v9.zip`. Avvalgi v9 va undan oldingi o‘zgarishlar saqlangan. 3-bosqich **hali qisman**.

1. `backend/services/slotGrid.js` — #6 va #180 bo‘yicha yakka va ko‘p xizmatli bronlar uchun **yagona 5 daqiqalik slot kalkulyatori** yaratildi. Ish vaqti masalan 09:03 dan boshlansa, 09:03 / 09:08 kabi server qabul qilmaydigan slotlar ko‘rsatilmaydi; birinchi vaqt 09:05 bo‘ladi. Band vaqt, joriy vaqt va xizmat to‘liq sig‘ishini hisoblaydi.
2. `backend/controllers/bookingsController.js` va `backend/services/multiBooking.js` — bo‘sh vaqtlarni olish oqimlari umumiy kalkulyatorga ulandi. Mavjud ish kunlari, 5 daqiqalik bron start validatsiyasi va qayta yuborish himoyasi saqlandi.
3. `backend/services/bookingNotificationAfterCommit.js` — **COMMIT bajarilgandan keyin Telegram xabari yetkazilmasa, mijozga 500 xato qaytarmaydi**. Bron muvaffaqiyatli tasdiqlanganligicha qoladi; ekranda muvaffaqiyat natijasi beriladi. Telegram xatosining batafsil javobi/tokenlari logga yozilmaydi. Ushbu yordamchi yangi bron, bronni bekor qilish va status o‘zgarishlarida ishlatiladi. Xabarni qayta yuborish/queue hali 5-bosqichda alohida talab.
4. `backend/services/bookingSelection.js` — tarixiy noto‘g‘ri 5 daqiqalik qadamga mos kelmagan xizmat davomiyligini yangi bron uchun ishlatish rad etiladi; mavjud xizmat qo‘shish/tahrirlash validatsiyasi avvaldan 5 daqiqalik qadam bilan ishlagan.
5. `backend/test/slotGrid.unit.test.js`, `backend/test/bookingNotificationAfterCommit.unit.test.js`, `backend/test/bookingSelection.unit.test.js` — vaqt chegaralari, bir nechta xizmat jadvaliga mos xulq, noaniq eskirgan jadval, Telegram xato va maxfiy log bo‘yicha testlar; `docs/USTARA_185_NAZORAT.csv` mos ravishda **qisman** deb yangilandi.

**v10 ishga tushirilgan testlar:** `node --test test/bookingSelection.unit.test.js test/slotGrid.unit.test.js test/bookingNotificationAfterCommit.unit.test.js test/bookingIdempotency.unit.test.js test/audit-phase1.unit.test.js test/bootstrap-plan.unit.test.js` — **28/28 PASS**. Tegishli o‘zgargan server fayllari `node --check` — PASS. `node scripts/audit-phase1.js` — 185 qaror, 28 migratsiya reyestri PASS.

**Yopilmagan tekshiruvlar:** kengroq `test/bookings.unit.test.js` ishga tushirildi, ammo npm dependency `jsonwebtoken` yo‘qligi sabab ishga tushish bosqichida `MODULE_NOT_FOUND`; **PASS emas**. Real PostgreSQL, Telegram, browser E2E, to‘liq backend suite va frontend build bajarilmadi. Yangi migratsiya qo‘shilmadi. Production DB’ga tegilmadi. **Production-ready emas.**

**Keyingi safar:** **`USTARA-3-Bosqich-Slot-Grid-v10.zip` dan** boshlash. `docs/USTARA_PROGRESS.md` va `docs/USTARA_185_NAZORAT.csv` ni o‘qish; test PostgreSQL’da bron collision/reschedule/price snapshot real testlari; keyin 3-bosqichni davom ettirish. Maxfiy kalitlarni ZIP’ga yozmaslik.


## v11 / 3-bosqich — Bron narxini roziliksiz o‘zgartirmaslik (2026-11-18)

**Asos fayl:** `USTARA-3-Bosqich-Slot-Grid-v10.zip`. v10 va oldingi barcha o‘zgarishlar saqlandi. 3-bosqich hanuz qisman.

1. `backend/services/bookingSelection.js` — narxning mijoz ko‘rgan server taklifi bilan mos kelishini xavfsiz, aniq tiyin hisobida tekshiruvchi `expectedPriceMatches`. Saqlangan `booking_services` snapshoti mavjud bronning `service_name` maydonida hozirgi katalog nomidan ustun qo‘yiladi; eski bronlarda tarixiy narx to‘qib chiqarilmaydi. Ko‘p bronlardagi snapshotlar `Map` orqali bir marta yig‘iladi.
2. `backend/services/multiBooking.js` — xizmatlar va narxlar server tranzaksiyasida `FOR SHARE` bilan o‘qilgandan so‘ng `expected_total_price` yuborilgan bo‘lsa, haqiqiy narx bilan solishtiriladi. Narx o‘zgargan bo‘lsa `409 price_changed`, `ROLLBACK`, **hech qanday bron yozilmaydi**. Narxni client emas, har doim database belgilaydi. Oldingi mijozlar uchun `expected_total_price` vaqtincha ixtiyoriy (backward compatibility).
3. `frontend/src/pages/user/barber/createBooking.js` va `InlineBooking.jsx` — sayt tasdiqlash oynasida ko‘rsatgan **serverdagi** narxni `expected_total_price` qilib yuboradi. Server narxni yangilagan bo‘lsa foydalanuvchi qayta ko‘rib tasdiqlashi kerak. Bron muvaffaqiyatli yaratilgan ekranda server saqlagan nom va umumiy narx ko‘rinadi. Narx serverdan olinmasa yangi bron yuborilmaydi.
4. #144 idempotency bilan moslik: noaniq tarmoq xatosidan keyin qiymat o‘zgarganda ham eski **request ID** saqlanadi. Birinchi so‘rov allaqachon commit bo‘lgan bo‘lsa yangi bron yaratilmaydi.
5. `backend/test/bookingPriceSnapshot.unit.test.js` (3 ta) va `frontend/test/createBooking.test.js` (+3 ta) — narx mismatch rollback, eski nom va narx snapshoti, noto‘g‘ri quote, retry va request ID barqarorligi uchun regressiya testlari.

**Tekshiruvlar:**
- `frontend/node --test test/*.test.js` — **120/120 PASS**.
- `backend/node --test` tanlangan booking+audit+bootstrap+slot suite — **31/31 PASS**.
- `backend/node scripts/audit-phase1.js` — 185 qaror va 28 forward migration reyestri PASS.
- O‘zgartirilgan backend JS va frontend `createBooking.js`: `node --check` PASS.

**Cheklovlar:** `npm ci`, to‘liq backend suite, Vite build, brauzer E2E hamda haqiqiy PostgreSQL parallel bron testlari ushbu ish muhitida bajarilmadi. **Yangi migratsiya yo‘q** — avvaldan tayyor 28 migratsiya ham hali real test DB’da ishlatilmagan. Legacy API mijozlari narx quote yubormasa mismatch bloklanmaydi; yangilangan USTARA web mijozida quote yuboriladi. Tasdiqlangan bronning saqlangan xizmat narxi katalogdagi yangi narxga almashtirilmaydi. 3-bosqich hali to‘liq emas va **production-ready emas**.

**Keyingi safar:** `USTARA-3-Bosqich-Price-Snapshot-v11.zip` va ushbu jurnal asosida, real test PostgreSQL’da quote vs concurrent service price update, parallel bron, eski bronlar snapshoti va idempotency integratsion testlarini bajarish. Keyin #106 vaqtni ko‘chirish va #162 xizmatlarni o‘zgartirishni xavfsiz transaction orqali amalga oshirish. Ilgari tasdiqlangan bronlar mijoz roziligisiz o‘zgarmasin.


## v12 / 3-bosqich — Broni atomar ko‘chirish + service edit API (2026-11-18)

**Asos ZIP:** `USTARA-3-Bosqich-Price-Snapshot-v11.zip`. Eski kod saqlandi, faqat kerakli fayllar yangilandi.

1. `backend/services/bookingModification.js`: customer-only `modifyCustomerBooking` transaction. `customer FOR UPDATE -> barber advisory lock -> booking FOR UPDATE` bilan stale update va parallel vaqt bandligini himoyalaydi. Avvalgi xizmat/narx snapshoti **faqat vaqt o‘zgarganda saqlanadi**, `service_ids` yangilansa `expected_total_price` server narxiga solishtiriladi. Xatoda ROLLBACK eski bronni saqlaydi. Shu faylda `modificationSlots` — eski bronni hisobdan chiqarib, boshqa mijoz va boshqa barberdagi o‘z bronlari bandligini hisoblaydigan bo‘sh slotlarni hisoblaydi.
2. `backend/controllers/bookingsController.js`, `backend/routes/bookings.js`: `GET /api/bookings/:id/modify-slots?date=...` va `PATCH /api/bookings/:id/modify` endpointlari. Faqat auth va bron egasi. Nomuvofiqlikda 409; muvaffaqiyatdan keyin best-effort notification.
3. `backend/services/telegramBookingNotifications.js`: `rescheduled` xabarini barberga, snapshot nomlari bilan; tasdiqlash tugmasi yo‘q; xabar yetmasa bronni qaytarmaydi.
4. `frontend/src/pages/user/Bookings.jsx`, `Bookings.css`, `bookings/model.js`: mijoz Bronlarim tafsilotlarida `Boshqa vaqtni tanlash`, 5 daqiqalik server bo‘sh slotlar ro‘yxati, tasdiqlash, avvalgi bron yo‘qolmaganini tushuntiruvchi xabarlar. **Frontend faqat vaqtni ko‘chirishni qo‘llaydi**; xizmatlarni edit qilish UI’ini keyingi ishda qilamiz.
5. `backend/test/bookingModification.unit.test.js`, `bookingRescheduleNotifications.unit.test.js`, `frontend/test/rescheduleBooking.test.js`, `frontend/test/customerBookings.test.js` — ruxsat, band slot, customer cross-barber conflict, quote mismatch, rollback, tarmoqdagi takroriy urinish, read-only availability va bildirishnoma testlari. `docs/USTARA_185_NAZORAT.csv` #106/#162 **qisman** deb yangilandi; yangi migratsiya yo‘q.

**Tekshiruvlar:** frontend testlari **124/124 PASS**; tanlangan backend booking/regressiya/test-audit suitelari **44/44 PASS**; frontend `Bookings.jsx` TypeScript JSX parsing **PASS**; backend JS `node --check` **PASS**; `node scripts/audit-phase1.js` 185 qaror, 28 migratsiya PASS.

**Cheklovlar:** Ushbu ish muhitida `pg`, `jsonwebtoken`, `react`, `vite`/Node dependencies o‘rnatilmagan; **real PostgreSQL, to‘liq backend unit suite, Vite build, browser E2E, Telegram live API hali bajarilmadi**. Eski qadamdagi v11 cheklovlari ham ochiq. 3-bosqich **qisman**, production-ready emas. History audit va xizmatlar edit UI hali alohida ish.

**Keyingi safar aynan qayerdan:** **`USTARA-3-Bosqich-Reschedule-v12.zip`** + ushbu `USTARA_PROGRESS.md`. Asosiy davom: #162 customer service edit/quote UI, 5 daqiqalik slotlar bilan integratsiya va keyin mustaqil test PostgreSQL’da service-edit/reschedule parallel collision E2E. 2-bosqich real DB testlari hali ochiq. Maxfiy tokenlar/production DB credentials ZIP’ga kiritilmaydi.


## v13 / 3-bosqich — Mijoz xizmatlarni tahrirlaydi, server quote va mos slotlar (2026-11-18)

**Asos ZIP:** `USTARA-3-Bosqich-Reschedule-v12.zip`. v12 va oldingi kod saqlandi. 3-bosqich **qisman**; faqat testlari o'tgan funksiyalarga dalil mavjud.

1. `backend/services/bookingModification.js`: `modificationSlots(pool, actor, id, date, replacementIds)` endi tanlangan yangi faol xizmatlarning davomiyligi va jami narxini **serverdan** hisoblaydi. Bo‘sh 5 daqiqalik slotlar yangi davomiylik asosida quriladi; mijozning o‘z tahrirlanayotgan broni busy sifatida hisoblanmaydi. **Bu GET quote slotni band qilmaydi**; PATCH yangidan tekshiradi.
2. Shu servisning `modifyCustomerBooking` funksiyasi `expected_service_ids` talab qiladi; bron qatori bloklangandan keyin `booking_services` snapshoti bilan tekshiradi. Boshqa qurilma bir xil vaqtda xizmatlarni o‘zgartirgan bo‘lsa `409 booking_changed` qaytadi, original bron saqlanadi. Server narxni `expected_total_price` bilan tekshiradi; mos kelmasa ROLLBACK.
3. `backend/controllers/bookingsController.js`: `GET /api/bookings/:id/modify-slots?date=YYYY-MM-DD&service_ids=ID,ID` qo‘llab-quvvatlandi. PATCH COMMIT’dan so‘ng xizmatlar tafsilotini o‘qishda xato yuz bersa, allaqachon saqlangan bronni 500 deb ko‘rsatmasdan `snapshot_refresh_required` belgisi bilan joriy holat qaytariladi. SQL va maxfiy ma’lumot logga kiritilmaydi.
4. `frontend/src/pages/user/bookings/model.js`: sartaroshning faol xizmatlarini olish, joriy bron xizmat identifikatorlarini aniqlash, replacement quote olish, `service_ids`, `expected_service_ids`, `expected_total_price` bilan atomar PATCH yuborish. Faqat vaqt ko‘chirilsa eski narx/snapshot o‘zgarmaydi.
5. `frontend/src/pages/user/Bookings.jsx`, `Bookings.css`: mijozning Bronlarim tafsilotlarida **Vaqt yoki xizmatlarni o‘zgartirish** oynasi; xizmatlar tanlovi, arxivlangan eski xizmatni chiqarib tashlash, yangi davomiylik/umumiy narx/oldingi narx, yangi davomiylikka mos 5 daqiqalik slotlar va aniq tasdiqlash tugmasi. 409 va noma'lum tarmoq xatolarida foydalanuvchi ogohlantiriladi; ketma-ket bosish bitta so‘rov bilan cheklanadi. Hech qanday onlayn to‘lov qo‘shilmadi.
6. `backend/test/bookingModification.unit.test.js`, `frontend/test/rescheduleBooking.test.js` — server quote, vaqt davomiyligi, eski xizmatlar versiyasi, price mismatch va tanlov validatsiyasi uchun yangi testlar.
7. v7 dan qolgan 6 ta unit testning DB-mock mosligi tuzatildi: `backend/test/loginProtection.unit.test.js`, `backend/test/registration.unit.test.js`, `backend/test/responseFields.unit.test.js`. **Production login/JWT xavfsizlik kodlari o‘zgartirilmadi.** Mocklar yangi `account_device_sessions` SQL so‘rovlarini tushunadigan bo‘ldi.

**v13 tekshiruv natijasi:**
- Backend `cd backend && npm test` — **326/326 PASS**.
- Frontend `cd frontend && npm test` — **127/127 PASS**.
- Frontend `node node_modules/vite/bin/vite.js build` — **PASS** (Vite production build). `npm run build` ish muhitining `.bin/vite` fayl ruxsatlari sabab to‘g‘ridan to‘g‘ri ishga tushmadi; Vite bin JavaScript fayli orqali build bajarildi.
- Babel JSX parser `Bookings.jsx` — **PASS**.
- `backend/node scripts/audit-phase1.js` — 185 qaror, 28 migratsiya ro‘yxati PASS (faqat strukturaviy audit).

**Cheklov:** haqiqiy disposable PostgreSQL serveri, parallel DB mutation E2E, real Telegram yetkazilishi, haqiqiy brauzer E2E hali bajarilmadi. `node_modules` va frontend `dist` tekshiruv uchun ish papkasida mavjud bo‘lgan; **ZIP’ga kiritilmagan**. Haqiqiy maxfiy `.env` yoki API kalitlar kiritilmadi. Bu versiya **production-ready emas**.

**Keyingi boshlanish nuqtasi:** `USTARA-3-Bosqich-Service-Edit-v13.zip`, `docs/USTARA_PROGRESS.md`, `docs/USTARA_185_NAZORAT.csv`. 3-bosqich: disposable PostgreSQL’da haqiqiy reschedule va service edit concurrency / parallel bron / quote mismatch integratsion testlari; keyin booking draft/guest flow va qolgan bron talablarini baholash. 2-bosqichning ochiq account recovery real integratsiya sinovlari ham saqlanadi.

## v14 / 3-bosqich — PostgreSQL darajasida mijoz vaqt to‘qnashuvini himoyalash (2026-11-18)

**Boshlang‘ich arxiv:** `USTARA-3-Bosqich-Service-Edit-v13.zip`. v13 va undan oldingi frontend/backend funksiyalari saqlangan. Bu bosqich **hali to‘liq tugamagan**.

1. `backend/database/migrations/20261130_customer_time_overlap.sql` — #169 bo‘yicha yangi **forward-only** `bookings_customer_time_excl` PostgreSQL GiST exclusion constraint. Bitta mijozga tegishli `pending`/`confirmed` bronlar, hatto ikki xil sartaroshda bo‘lsa ham, `[start,end)` interval bo‘yicha ustma-ust kelolmaydi. Eski `bookings_active_time_excl` (sartaroshga tegishli) saqlanadi. Existing active overlap bo‘lsa migratsiya to‘xtaydi, tarixiy bronlar o‘chirilmaydi. Rerun faqat marker+constraint aynan mos bo‘lsa tekshiruv bilan qaytadi. Operator tasdig‘isiz migratsiya **BAJARILMADI**.
2. `backend/database/bootstrap.sql`, `backend/database/bootstrap/verify.sql`, `backend/test/bootstrap-plan.unit.test.js`, `backend/test/audit-phase1.unit.test.js` — 29-chi forward migration kiritildi, final verification ikkala exclusion constraint’ning katalog ta’rifini tekshiradi. SQL runtime testi qilinmagan, faqat fayl reyestri/strukturaviy audit.
3. `backend/services/bookingDbConflicts.js`, `backend/services/multiBooking.js`, `backend/services/bookingModification.js`, `backend/controllers/bookingsController.js` — PostgreSQL `23P01` ni constraint nomiga qarab foydalanuvchi uchun to‘g‘ri `409 customer_time_conflict` yoki `409 booking_conflict` deb qaytaradi; DB tafsilotlarini HTTP’ga chiqarib yubormaydi.
4. **Aniq xato tuzatildi:** eski createBooking API’dagi `BookingSelectionError` (jumladan `request_id` kolliziyasi) ilgari faol tranzaksiya ichida kelib qolsa, ROLLBACK’dan avval javob qaytarishi mumkin edi. Endi xatolik turidan qat’i nazar rollback uriniladi, rollback muvaffaqiyatsiz bo‘lsa connection ishonchsiz deb tashlanadi.
5. `backend/test/bookingConcurrency.postgres.integration.test.js` — alohida mahalliy test bazasi uchun opt-in sinov: mustaqil ikkita connection bilan parallel INSERT, yonma-yon chegaralar, terminal statuslar, UPDATE collision, atomar ko‘chirish va price mismatch. Bayroqsiz **SKIP**, hech qanday migratsiyani avtomatik qo‘llamaydi; test database kimligini qattiq tekshiradi.
6. `backend/test/bookingDbConflicts.unit.test.js`, `backend/test/customerOverlapMigration.unit.test.js`, `backend/test/bookings.unit.test.js`, `backend/test/bookingModification.unit.test.js` — error-code mapping, forward-only inventory, rollback-before-release va EXCLUDE xatolari bo‘yicha testlar.
7. `backend/BOOKING_CONCURRENCY_V14.md`, `backend/BOOKING.md`, `backend/database/bootstrap/README.md`, `docs/USTARA_185_NAZORAT.csv` — operator uchun test/migratsiya shartlari, #169 qisman bajarilgan holati yangilandi.

**Haqiqatan ishga tushirilgan tekshiruvlar:**
- `cd backend && npm test` — **332/332 PASS**, 0 FAIL, 0 SKIP (unit testlar; haqiqiy PostgreSQL emas).
- `node scripts/audit-phase1.js` — **185 qaror**, **29 migration** ketma-ketligi (strukturaviy) PASS.
- `node scripts/bootstrap-plan.js` — 29 forward migration reyestri tekshirildi.
- `node --test test/bookingConcurrency.postgres.integration.test.js` — **1 SKIP**; real PostgreSQL serveri/foydalanuvchi ruxsati yo‘q.
- `node --check` — o‘zgartirilgan backend JavaScript fayllarida PASS.

**Bajarilmagan ishlar va xavflar:** PostgreSQL’da yangi EXCLUDE constraint haqiqiy katalog/runtime sinovi, live data oldindan overlap nazorati, parallel booking API E2E, browser E2E, Telegram xabarlarini real yetkazish bajarilmadi. 2-bosqichning account recovery integration testlari ham ochiq. Frontend v13 dan o‘zgartirilmadi va bu versiyada frontend build qayta yugurtirilmadi. **Production-ready emas.** Migratsiya bajarilmaguncha DB-level ikkinchi himoya hali ishga tushmagan; dasturdagi oldingi row-lock himoyasi saqlangan.

**Keyingi boshlanish nuqtasi:** `USTARA-3-Bosqich-Customer-Overlap-v14.zip` + `docs/USTARA_PROGRESS.md` + `docs/USTARA_185_NAZORAT.csv`. Keyingi imkoniyat: ruxsat etilgan **faqat test** PostgreSQL’da v14 migration + parallel so‘rovlarini tekshirish; so‘ng 3-bosqichdagi guest booking draft (#98/#99/#136) va boshqa ochiq talablarni davom ettirish. Real `.env`, production DB credentials, tokenlar arxivga kiritilmaydi.


## v15 / 3-bosqich — Mehmon rejimi va 5 daqiqalik Booking Draft (2026-11-18)

**Asos ZIP:** `USTARA-3-Bosqich-Customer-Overlap-v14.zip`. Oldingi versiyalar va 29 migratsiya saqlandi. v15 da yangi database migratsiyasi qo‘shilmadi.

1. `backend/controllers/servicesController.js` va `backend/routes/services.js`: faqat tasdiqlangan, faolsizlantirilmagan sartaroshning faqat faol xizmatlari uchun **public read-only** `/api/services/public?barber_id=ID` endpoint. Telefon, mijoz yoki maxfiy ma’lumotlar berilmaydi; boshqa xizmat CRUD endpointlarida `authMiddleware` saqlandi.
2. `backend/routes/barbers.js` va `backend/routes/bookings.js`: tasdiqlangan sartarosh ish vaqti va mavjud slotlar uchun guest GET ochildi. `POST /api/bookings` **JWT bilan himoyalanganicha qoldi**. `backend/controllers/bookingsController.js` guest javobida band bronning `busy` interval ro‘yxatini bermaydi; faqat bo‘sh/band slot mavjudligi ko‘rsatiladi. Profil, ish vaqti va public service o‘qishlarda faol tasdiqlangan barber tekshiruvi kuchaytirildi.
3. `frontend/src/App.jsx`, `frontend/src/pages/user/Explore.jsx`, `frontend/src/pages/user/barber/BarberPublicProfile.jsx`, katalog va xarita: `/explore` va `/barbers/:id` ommaviy sahifalari; mehmon tasdiqlangan sartaroshni, xizmatlar, davomiylik, narx, jadval va bo‘sh vaqtlarni ko‘ra oladi. Hozircha portfolio/post/reviews guest uchun autentifikatsiya talab qiladi, bu UX bo‘shlig‘i keyin to‘ldiriladi.
4. `frontend/src/pages/user/barber/bookingDraft.js` + `InlineBooking.jsx`: `sessionStorage`da faqat barber ID, xizmat IDlari, sana va vaqt saqlanadi. **5 daqiqa TTL**, eskirgan yoki buzilgan draft o‘chadi, parol/telefon/JWT/quote yozilmaydi. Tanlov slot rezervatsiyasi emas; serverdan narx va mavjud vaqt qayta tekshiriladi. Login qilmagan foydalanuvchi `POST` yubormaydi, login sahifasiga o‘tadi. Brauzer storage yopiq bo‘lsa yolg‘on saqlangan xabari berilmaydi.
5. `frontend/src/pages/auth/Login.jsx`, `CompleteProfile.jsx`: Customer login/ro‘yxatdan o‘tish/profilni yakunlashdan so‘ng yaroqli draftga qaytadi. Barber esa o‘z dashboardiga boradi. Xavfsiz qaytish URLi faqat tekshirilgan raqamli barber IDdan tuziladi; foydalanuvchidan ixtiyoriy `redirect` qabul qilinmaydi.
6. Testlar: `frontend/test/bookingDraft.test.js`, public profile, availableSlots, exploreCatalog; `backend/test/publicServiceCatalog.unit.test.js`, `guestBookingAccess.unit.test.js` va `bookings.unit.test.js`da guest privacy/auth regressiya testlari. `docs/USTARA_185_NAZORAT.csv`da #98, #99, #136, #173 **qisman** deb belgilandi.

**Tekshiruvlar:** `backend npm test` — **337/337 PASS**; `frontend npm test` — **135/135 PASS**; Vite frontend production build — **PASS**; `node scripts/audit-phase1.js` — **185 qaror va 29 forward migration struktura PASS**. npm paketlari tekshiruv uchun mavjud papkadagi symlink bilan ishlatildi, ZIPga kiritilmadi.

**Ochiq masalalar:** real PostgreSQL’da migratsiyalar va booking concurrency, haqiqiy browser guest→login→booking E2E, iOS/Android sessionStorage tajribasi, xususiy Ilhom postlarini guestga ko‘rsatish siyosati, public API rate-limit va production monitoring, 2-bosqich account recovery real testlari. 3-bosqich hamon qisman, **production-ready emas**. `sessionStorage` faqat o‘sha tabda va faqat 5 daqiqa saqlaydi, slot vaqtini band qilmaydi.

**Keyingi boshlanish nuqtasi:** `USTARA-3-Bosqich-Guest-Draft-v15.zip`, shu `docs/USTARA_PROGRESS.md`, `docs/USTARA_185_NAZORAT.csv`. Guest E2E va test PostgreSQL imkon bo‘lsa o‘tkazish; 3-bosqichdagi qolgan cancellation policy, jadval va slot talablarini mustahkamlash. Maxfiy tokenlar ZIPga kiritilmaydi.


## v16 / 3-bosqich — Bekor qilish xavfsizligi (2026-11-18)

**Asos:** `USTARA-3-Bosqich-Guest-Draft-v15.zip`. ZIP ichida so‘nggi qisqa checkpoint `docs/USTARA_LATEST_CHECKPOINT.md` bor — oldingi 15 ta versiyani qayta o‘qimaslik uchun uni birinchi o‘qing.

1. `backend/services/bookingStatusService.js`: cancellation qayta yuborilsa avvalgi holat `replayed:true` bilan qaytadi; aktor egaligi va lock ostida; ikinci `UPDATE` qilinmaydi. Terminal `completed/rejected` qayta ochilmaydi.
2. `backend/controllers/bookingsController.js`: `DELETE` ham status service’dan foydalanadi, mustaqil `UPDATE` bypass yo‘q. Telegram faqat yangi cancellationga yuboriladi. Post-COMMIT display fetch failure holati muvaffaqiyatli bron statusini xato deb ko‘rsatmaydi.
3. `backend/controllers/barbersController.js`: ish vaqti update tranzaksiyasida `statement_timeout='15s'`; eski advisory lock saqlandi.
4. `backend/test/bookings.unit.test.js`: takroriy PUT/DELETE, parallel cancellation, vakolatsiz foydalanuvchi, terminal status, jadval timeout va post-COMMIT detail failure sinovlari; test double SQL parsing yangi status read queryga moslashtirildi.
5. `backend/BOOKING_CANCELLATION_V16.md`, `backend/BOOKING.md`, `docs/USTARA_185_NAZORAT.csv` #17/#105 izohlari va v16 hisobot yangilandi. 29 migratsiya saqlangan, v16 uchun yangi migratsiya kiritilmadi.

**Natija:** backend `npm test` **342/342 PASS**, frontend `npm test` **135/135 PASS**, Vite build **PASS**, offline audit **185 qaror/29 forward migration PASS**. Real PostgreSQL, Telegram API va brauzer E2E bajarilmagan.

**Qolganlar:** #17 sartarosh o‘zi belgilaydigan cancellation deadline/fee siyosati, maxsus kunlar/tanaffus, jadval konfliktdan himoya, #105 muqobil vaqt taklifi, test-DB va production tekshiruvlari. **v16 production-ready emas.**

**Keyingi versiya:** v17 manbasi `USTARA-3-Bosqich-Cancellation-Safety-v16.zip`; birinchi `docs/USTARA_LATEST_CHECKPOINT.md`ni o‘qing, eski fayllar va matnni to‘liq qayta tahlil qilmang.


## v17 / 3-bosqich — Barber cancellation policy + booking-time snapshot (2026-11-18)

**Asos ZIP:** `USTARA-3-Bosqich-Cancellation-Safety-v16.zip`. v16 dagi barcha cancellation replay va auth qoidalari saqlandi.

1. `backend/database/migrations/20261201_cancellation_policy.sql` — 30-chi forward migration. Barber tomonidan belgilangan 0–10080 daqiqalik cancellation deadline va izoh; har yangi booking uchun atomar `BEFORE INSERT` snapshot. Oldindan mavjud bronlar cheklovisiz qoladi; orqaga qoida tatbiq etilmaydi. Qo‘shimcha avtomatik to‘lov yoki jarima yo‘q.
2. `backend/controllers/cancellationPolicyController.js` + routes — barber GET/PUT sozlamalari, tasdiqlangan faol barberning ommaviy GET qoidalari. Faqat o‘z akkaunti tahrirlaydi.
3. `backend/services/cancellationTerms.js`, `multiBooking.js`, `bookingsController.js` — mijoz bronni tasdiqlashdan oldin ko‘rgan shartlar server qoidalari bilan **barber FOR SHARE** ostida solishtiriladi; eski preview bo‘lsa 409 va rollback.
4. `backend/services/bookingStatusService.js` — customer cancellation egasi va lock tekshiruvidan so‘ng **DB clock** bilan deadline tekshiriladi; qoidaga mos kelmasa 409/rollback. Barber zaruratda bekor qilish huquqini saqlaydi; takroriy cancellation replay xabarni ko‘paytirmaydi.
5. `frontend/Schedule.jsx`, `CancellationPolicyEditor.jsx`, `InlineBooking.jsx`, `createBooking.js`, `Bookings.jsx`, `bookings/model.js` — sartarosh sozlama UI, mijoz uchun prebooking sharti, tasdiqdagi check, mavjud bron deadline/izoh va 409 xabari.
6. `backend/test/cancellationPolicy.unit.test.js`, `cancellationTerms.unit.test.js`, `bookings.unit.test.js` va frontend `customerBookings.test.js`, `createBooking.test.js` — regressiya testlari; eski SQL unit mock yangi columns va route bilan moslashtirildi. `docs/USTARA_185_NAZORAT.csv`da #17 qisman.

**Haqiqiy testlar:** backend `npm test` — **351/351 PASS**; frontend `npm test` — **137/137 PASS**; Vite build — **PASS**; audit — **185/30 structural PASS**. Real PostgreSQL, yangi trigger va cancel deadline integratsiyasi, brauzer E2E va Telegram real integratsiyasi hali bajarilmagan. 3-bosqich **qisman**, production-ready **EMAS**.

**Keyingi asos:** `USTARA-3-Bosqich-Cancellation-Policy-v17.zip`, `docs/USTARA_LATEST_CHECKPOINT.md`. v18: #8/#90 ish tanaffuslari, maxsus kunlar, oldingi bronlar bilan to‘qnashuv siyosati; #105 alternate cancellation; test DB imkon bo‘lsa integratsiya. Boshidan audit qilinmasin.


## v18 / 3-bosqich — Ta’til, sana bo‘yicha tanaffus va jadval konflikti (2026-11-18)

**Asos:** `USTARA-3-Bosqich-Cancellation-Policy-v17.zip`. 1–17-versiyalarning mavjud kodlari saqlandi.

1. `backend/database/migrations/20261202_barber_calendar_exceptions.sql` — **31-chi forward migration**: barber/date bo‘yicha istisno, yopiq kun, maxsus soatlar va ixtiyoriy bir tanaffus; PostgreSQLdagi `ustara_effective_day_schedule` funksiyasi. Fresh bootstrap `verify.sql` va forward migration tartibi yangilandi.
2. `backend/services/calendarSchedule.js` — single/multi bron yaratish, ko‘chirish, xizmatlarni o‘zgartirish va slot availability uchun **yagona DB jadval qoidasini ishlatish**. Tanaffus band vaqt sifatida slotlarni hisoblashga qo‘shiladi.
3. `backend/controllers/barbersController.js` — haftalik ish jadvali o‘zgartirilgandan so‘ng mavjud active bron yaroqsiz bo‘lib qolsa `ROLLBACK` va `409 existing_booking_conflict`; bronlar o‘zgartirilmaydi.
4. `backend/controllers/calendarExceptionsController.js`, `routes/barbers.js` — barber-only GET/PUT/DELETE API; 1–90 sanagacha atomar batch; oldingi bronlar konfliktda 409.
5. `frontend/src/pages/barber/components/CalendarExceptionsEditor.jsx`, `data/calendarExceptions.js`, `Schedule.jsx` — maxsus sana, ta’til, ish vaqti va tanaffusni boshqarish, oldingi istisnolarni ko‘rish va o‘chirish.
6. `backend/test/calendarExceptions.unit.test.js`, `backend/test/bookings.unit.test.js`, `frontend/test/calendarExceptions.test.js` va eski SQL maketlari — sana, tanaffus, lock/rollback, mavjud bronga zid jadval hamda regressiya tekshiruvlari.
7. `backend/BOOKING_CALENDAR_V18.md`, `database/bootstrap/README.md`, `docs/USTARA_185_NAZORAT.csv` — #8/#55/#90 qisman deb belgilandi. #161 **takrorlanuvchi tanaffuslar bajarilmadi**.

**Haqiqiy testlar:** backend `npm test` — **359/359 PASS**; frontend `npm test` — **140/140 PASS**; Vite build — **PASS**; offline strukturaviy audit — 185 qaror / 31 migratsiya tartibi PASS.

**Hali yo‘q:** real PostgreSQL’da yangi 31-migratsiya hamda parallel booking/schedule sinovlari, haqiqiy mobil brauzer E2E, bir kunda ko‘p break va recurring break, Telegram live xabarlari. Production-ready **EMAS**. v18 kodini baza migratsiyasidan oldin deploy qilmang.

**Keyingi asos:** `USTARA-3-Bosqich-Calendar-Safety-v18.zip`, shu progress va `docs/USTARA_LATEST_CHECKPOINT.md`. Keyingi v19 uchun #161 recurring breaks, bir kunda ko‘p interval va PostgreSQL concurrency test; boshqa bosqichlar ham ochiq.


## v19 / 3-bosqich — takrorlanuvchi va ko‘p tanaffus (2026-11-18)

**Asos ZIP:** `USTARA-3-Bosqich-Calendar-Safety-v18.zip`; v18 ning mavjud kalendar/bron kodi saqlandi.

1. `backend/database/migrations/20261203_barber_break_rules.sql`: 32-chi forward migration. Haftaning har kuni va aniq sana bo‘yicha istalgancha emas, **eng ko‘pi 8 ta 5-daqiqalik ajratilgan vaqt oralig‘i**. `ustara_effective_breaks` barcha break manbalarini (v18 bir martalik + v19 haftalik va sanali) birlashtiradi, amaldagi ish vaqtiga moslaydi. Eski bron yoki exception yozuvlari o‘chirilmaydi.
2. `backend/services/calendarSchedule.js`: single/multi create, reschedule, service edit va public bo‘sh slotlar uchun `ustara_effective_breaks`ga yagona murojaat. SQL-based `fitsBooking`, `dayHours`, `invalidActiveBooking`, JS `withBreakBusy` yangilandi.
3. `backend/controllers/breakRulesController.js` va `backend/routes/barbers.js`: GET /break-rules; PUT /break-rules/weekly; PUT /break-rules/dated. Barber-only role, 5-minute validation, overlap tekshiruvi, 8-interval limiti, transaction/advisory lock/409 + ROLLBACK. Weekly update uchun barcha kelajakdagi aktiv bronlar tekshiriladi, dated uchun ayni sana. Hech qaysi bron avtomatik ko‘chmaydi/bekor bo‘lmaydi.
4. Frontend RecurringBreaksEditor + breakRules data helper + Schedule, frontend 3 test.
5. Yangi backend 8 test, eski SQL mocklar yangilandi, bootstrap plan 32 migratsiya, verify jadval/version/function inventari yangilandi, 185 qaror reyestrida #8/#90/#161 qisman.

**Tekshiruv:** backend `npm test` **367/367 PASS**, frontend `npm test` **143/143 PASS**, Vite build **PASS**, offline audit **185 qaror / 32 migration PASS**. Frontend bin wrapper bajarilmaydigan holatda bo‘lgani sabab build `node node_modules/vite/bin/vite.js build` buyrug‘i bilan bajarildi.

**Cheklov:** Real PostgreSQL, 32-chi migratsiya va SQL funksiyaning amaliy ijrosi, parallel bron va calendar edit concurrency, browser E2E, Telegram API **sinovdan o‘tmadi**. Live deployga tayyor emas. 2-bosqich ham o‘z integratsiya sinovlarini kutmoqda.

**Keyingi boshlanish:** `USTARA-3-Bosqich-Recurring-Breaks-v19.zip`, `docs/USTARA_LATEST_CHECKPOINT.md`. v20 real PostgreSQL jadval/bron sinovi (muhit bo‘lsa); aks holda booking konversiya & Smart Queue backlog.


## v20 / 3-bosqich — bo‘sh slotlar maxfiyligi + parallel kalendar integratsiya testi (2026-11-18)

**Asos:** `USTARA-3-Bosqich-Recurring-Breaks-v19.zip`. v19 dagi barcha kod, 32 migratsiya va 185 qaror reyestri saqlandi. **Yangi DB migratsiya yo‘q.**

1. `backend/controllers/bookingsController.js`: #173 qoidaga mos privacy tuzatish. Ilgari har qanday login foydalanuvchisi `GET available-slots` orqali `busy` intervallarini olishi mumkin edi. Endi faqat jadval egasi sartaroshga qaytariladi; customer/guest/other barber/admin faqat mumkin bo‘lgan bo‘sh vaqtlarni ko‘radi. Bronning real bandligi o‘zgarmaydi.
2. `backend/test/bookings.unit.test.js`: maxfiylik regression testi va tun yarmidan o‘tgan band intervalni faqat egasiga ko‘rsatish. 1 ta yangi test.
3. `backend/test/bookingConcurrency.postgres.integration.test.js`: v19 migration/function preflight, weekly/dated break konfliktida rollback va eski bron himoyasi, `fitsBooking/dayHours` slotlari, parallel booking move vs weekly-break tahriri uchun haqiqiy PostgreSQL opt-in testlari qo‘shildi. Oldingi v14 customer overlap testlari saqlandi. Test alohida lokal test DB uchun explicit opt-in bilan ishlaydi.
4. `backend/package.json`: `npm run test:booking:db` qo‘shildi, default `npm test`dan ajratildi; `backend/BOOKING_V20_PRIVACY_AND_CONCURRENCY.md`da xavfsiz ishga tushirish yo‘riqnomasi.
5. `docs/USTARA_185_NAZORAT.csv`: #173, #161, #169, #90 dalillari yangilandi. Haqiqiy integratsiya bajarilmagan ekan, hech bir qaror to‘liq production PASS deb belgilanmadi.

**Haqiqiy bajarilgan sinovlar:** backend **368/368 unit PASS**, frontend **143/143 unit PASS**, Vite production build **PASS**, offline audit **185 qaror/32 migration PASS**. `bookingConcurrency.postgres.integration.test.js` **SKIP** (bu muhitda PostgreSQL yo‘q). PostgreSQL paketini o‘rnatish uchun paket manbai javob bermadi. Shuning uchun DB trigger/lock/exception concurrency **amaliy sinovdan o‘tmadi**.

**Qolganlar:** test PostgreSQL’da v14/v18/v19 migratsiyalar va app sinovlarini haqiqatan bajarish; haqiqiy browser/Telegram E2E, booking worker/outbox va Smart Queue; #173 navbat ETA. 2-bosqich recovery uchun haqiqiy DB identity verification ham ochiq. **3-bosqich qisman, production-ready emas**.

**Keyingi boshlanish nuqtasi:** `USTARA-3-Bosqich-Privacy-DB-Readiness-v20.zip` + `docs/USTARA_LATEST_CHECKPOINT.md` va 185 CSV; v21 da DB bo‘lsa integratsiyani bajarish, bo‘lmasa Smart Queue/QR uchun 4-bosqichning asosiy backendini boshlash.


---

## v21 — 4-bosqich boshlandi: Walk-in FIFO navbat

**Asos ZIP:** `USTARA-3-Bosqich-Privacy-DB-Readiness-v20.zip`. v20 dagi kod saqlangan; qaytadan loyiha qurilmadi.

- `backend/database/migrations/20261204_walkin_queue_core.sql`: `walkin_queue`, `walkin_queue_events`, FIFO va bitta called/day partial UNIQUE index; forward-only, no data backfill.
- `backend/controllers/walkinQueueController.js` va `backend/routes/queue.js`, `backend/server.js`: barber-only view/join/call-next/finish; tasdiqlangan/active barber check; shared advisory lock; app-level idempotency, PostgreSQL transaction va rollback; no public customer names.
- `frontend/src/pages/barber/Queue.jsx`, `frontend/src/pages/barber/data/queueModel.js`, `frontend/src/App.jsx`, `frontend/src/layouts/BarberLayout.jsx`, `frontend/src/pages/barber/Dashboard.jsx`: navbat oynasi, bugungi/past queue ajratish, 5-nav kelishuv, schedule/portfolio linklari.
- `backend/database/bootstrap.sql`, `backend/database/bootstrap/verify.sql`: 33 forward migrations va 2 yangi jadval inventory.
- `backend/test/walkinQueue.unit.test.js` (12 ta), `frontend/test/queue.test.js` (3 ta), `backend/test/walkinQueue.postgres.integration.test.js` (opt-in only; real DB hozir mavjud emas, SKIP).
- `backend/WALKIN_QUEUE_V21.md` — API, migration, safety va test qo‘llanmasi.

**Muhim chegaralar:** manual barber walk-in queue — avtomatik booking yoki vaqt band qilmaydi. QR, public real-time ETA, Telegram taklif, shop queue, operator reordering, Smart Booking integratsiyasi, brauzer E2E va haqiqiy PostgreSQL yozuvlari hali tayyor emas. Eski queue avtomatik bekor qilinmaydi.

**v21 sinovlari:** backend 380/380 unit test PASS; frontend 146/146 unit test PASS; Vite build PASS. Offline audit: 185 qaror, 33 forward migration PASS. Real PostgreSQL integratsiya: SKIP. Production-ready emas.


---

## v22 — 4-bosqich / Bir martalik walk-in QR va sartarosh tasdig‘i (2026-11-18)

**Asos ZIP:** `USTARA-4-Bosqich-WalkIn-Queue-v21.zip`. v21 queue API/DB, qolgan booking, account, Telegram va frontend modullari saqlandi.

1. `backend/database/migrations/20261205_walkin_qr_approval.sql` — **34-chi forward migration**. `walkin_qr_tokens` (SHA-256 token hash, 10 daqiqalik amal, bir martalik foydalanish), `walkin_qr_requests` (pending/approved/rejected, request receipt fingerprint, staff decision) va `walkin_qr_request_events` (audit). Barber o‘chirilsa QR bog‘liqlari cascade; mavjud bookinglar o‘zgarmaydi.
2. `backend/controllers/walkinQrController.js`, `backend/routes/queue.js`, `backend/middleware/qrPublicRateLimit.js`: staff QR issue, guest anonymous pending/retry/status, staff private pending list va approve/reject. Approval + walk-in queue insert + audit bir PostgreSQL transaction ichida; v21 shared barber advisory lock va v21 request-id uniqueness ishlatiladi. Staff approval **jismoniy tashrifni kafolatlamaydi** — joyida tekshirish shart. IP rate-limiter bir Node workerda, production edge limiter hali tayyorlash kerak.
3. `backend/vendor/qrcode-terminal/QRCode` + LICENSE, `backend/utils/qrSvg.js` — backendda lokal QR SVG, 3rd-party URL/token leak yo‘q. Haqiqiy QR kodi OpenCV bilan lokal dekodlangan. Token brauzer Referrer siyosati bilan himoyalanadi.
4. `frontend/src/pages/queue/QueueCheckIn.jsx` va `qrModel.js`, App route: mehmon QR sahifasi, ixtiyoriy nom, request receipt `sessionStorage`, status polling. Queue.jsx: yangi QR rasm/linki va staff pending approve/reject ro‘yxati; joyida tekshirish eslatmasi. Mijoz telefon/JWT bilan ma’lumot yubormaydi.
5. `backend/test/walkinQr.unit.test.js`: 15 yangi test (key, origin, no raw token, single-use replay, expiration, closure, private auth, transaction/audit/idempotency, QR issue throttling); `frontend/test/qrModel.test.js`: 3 test. `backend/test/walkinQr.postgres.integration.test.js`: **faqat explicit local test DB opt-in**, hozirgi muhitda **SKIP**. Bootstrap va verify 34 migration/3 QR jadvalga yangilandi. 185 qaror reyestridagi #26–#29, #34 **qisman** yangilandi, hech qaysisi real DB va mobil testlarsiz to‘liq deb belgilanmadi.

**Testlar:** backend `npm test` **395/395 PASS**; frontend `npm test` **149/149 PASS**; Vite `node node_modules/vite/bin/vite.js build` **PASS**; o‘zgargan JSX ESLint PASS; audit 185 qaror / 34 migrations PASS. Real PostgreSQL/QR mobile/E2E **BAJARILMAGAN**, integratsiya test SKIP. Real Telegram/5-minute offer/manual FIFO override/ETA/shop-wide queue yo‘q.

**Keyingi ishlash nuqtasi:** `USTARA-4-Bosqich-QR-Approval-v22.zip` va `docs/USTARA_LATEST_CHECKPOINT.md`. 4-bosqichda manual FIFO override (majburiy sabab + audit), navbat ETA va mijozga e’lonlar, 5 daqiqalik taklif va Telegram atomar javoblari. 2–3 bosqichlarning haqiqiy PostgreSQL va browser E2E sinovlari ham ochiq. **Production-ready EMAS.**


---

## v23 — 4-bosqich: FIFO qo‘lda o‘zgartirish va QR vaqtini Admin boshqarishi (2026-11-18)

**Asos ZIP:** `USTARA-4-Bosqich-QR-Approval-v22.zip`. v22 dagi kod va 34 migratsiya to‘liq saqlandi; v23 **35-migratsiya**ni qo‘shdi.

1. `backend/database/migrations/20261206_queue_order_qr_settings.sql`: kutayotgan navbat uchun `queue_position`; tartibni sabab bilan o‘zgartirish auditi `walkin_queue_reorder_events`; QR TTL singleton `walkin_qr_settings` va `walkin_qr_settings_events`. Default TTL 10 daqiqa, Admin 1–120 oralig‘ida o‘zgartiradi, eski token `expires_at` saqlanadi. Audit FK `admin_accounts`ga bog‘langan. Existing waiting `queue_position` NULL saqlanadi, FIFO id ASC ishlashda davom etadi.
2. `backend/controllers/walkinQueueController.js` + `backend/routes/queue.js`: `PATCH /api/queue/:id/reorder`, barber-only, 10–200 belgili majburiy sabab, stale `expected_order` -> 409, `pg_advisory_xact_lock`, queue_position update va audit yozuvi bitta tranzaksiyada. `callNext` yangi tartibni hurmat qiladi, eski navbatlar qoldiriladi.
3. `backend/controllers/adminQueueSettings.js` + `backend/routes/admin.js`: Admin GET/PUT QR sozlamasi, nazorat va audit. `backend/controllers/walkinQrController.js`: QR yaratish TTL ni DB dan transaction ichida o‘qiydi (`FOR SHARE`); yangi QR javobida ttl bor. QR bir martalik, hash va public privacy v22 bo‘yicha saqlanadi.
4. `frontend/src/pages/barber/Queue.jsx`: ↑/↓ va sabab prompti, QR uchun dinamik `ttl_minutes`. `frontend/src/pages/AdminPanel.jsx`: «QR va navbat» sozlamasi, 1–120 daqiqalik input.
5. `backend/test/queueReorderAdminQr.unit.test.js` (8 test) + `backend/test/walkinQr.unit.test.js` (1 qo‘shimcha test), boshqa regressiya testlarini 35 migrationga moslash; `backend/test/queueReorder.postgres.integration.test.js` faqat alohida ruxsatli test DB, hozir SKIP. `backend/WALKIN_QUEUE_V23.md`da operatsion chegaralar.
6. `docs/USTARA_185_NAZORAT.csv` #28, #31–#33 yangilandi. Admin QR TTL — foydalanuvchi qo‘shimcha talabi, **185 tadan yangi raqam qo‘shilmadi**.

**Haqiqiy natijalar:** backend **404/404 unit PASS**, frontend **149/149 unit PASS**, Vite production build **PASS**, o‘zgargan JSX ESLint **PASS**, offline audit **185 qaror/35 migration PASS**. PostgreSQL serveri mavjud emas; integration `queueReorder.postgres.integration.test.js` **SKIP**. DB lock/transaction, real browser/Telegram E2E hali amaliy isbotlanmagan. **Production-ready emas.**

**Keyingi boshlanish:** `USTARA-4-Bosqich-Queue-Admin-QR-v23.zip` + `docs/USTARA_LATEST_CHECKPOINT.md`. Navbat jonli ETA va Telegram chaqiruvlari, 5 daqiqalik Smart Booking taklifi, database testlar qolgan.


---

## v24 — 4-bosqich / Jonli walk-in navbat va QR ticket ETA (2026-11-18)

**Asos ZIP:** `USTARA-4-Bosqich-Queue-Admin-QR-v23.zip`. v23 dagi Admin QR TTL, FIFO override, audit va 35 migratsiya saqlandi. **Yangi SQL migratsiya qo‘shilmadi.**

1. `backend/services/queueLiveEstimate.js`: shaxsiy navbat o‘rni va ehtimoliy xizmat davomiyligidan kelib chiqib `min_minutes/max_minutes` taxminiy kutish oraliqlarini hisoblash. Real xizmat turi va oldindan bronlar qo‘shilmagan — aniq va’da emas.
2. `backend/controllers/walkinQrController.js`: `POST /api/queue/qr-status` faqat QR token va request receipt egasiga o‘zining waiting position, estimated_wait va `called/served/missed/left` holatini qaytaradi. Boshqa mijozning ismi, raqami, queue idsi yo‘q; guest status JWT talab qilmaydi, avvalgi IP limiter saqlangan. v23 qo‘lda navbat o‘zgartirish pozitsiyasi hisobga olinadi.
3. `backend/controllers/queuePublicController.js` va `/api/queue/public/:barberId`: ommaviy aggregate navbat sanog‘i va ehtimoliy yangi keluvchiga ETA, faqat tasdiqlangan/active barber uchun, `Cache-Control:no-store`, IP limiter. Shaxsiy bronlar soni yoki mijozlar ro‘yxati oshkor qilinmaydi.
4. `frontend/src/pages/queue/QueueCheckIn.jsx`, `qrModel.js`: QR mehmon o‘rnini/kutish vaqtini va sartarosh chaqiruvi holatini ko‘radi, polling 15s; terminal holatda to‘xtaydi. `PublicQueueSummary.jsx` + barber ommaviy profili: aggregate 30s; Barber `Queue.jsx` 15s refresh. Mobil notification/push/Telegram hali qo‘shilmadi.
5. Testlar: `backend/test/queueLive.unit.test.js` (5 yangi), `backend/test/walkinQr.postgres.integration.test.js` real DB kutilgan natijasiga moslangan; `frontend/test/queueLive.test.js` (3 yangi), oldingi route testlari yangilandi. `backend/WALKIN_QUEUE_V24.md` qo‘llanma.
6. 185 qaror reyestridagi #27, #35, #127, #129 qisman yangilandi. Barchasi hali production QA emas.

**Sinov:** backend **409/409 PASS**; frontend **152/152 PASS**; Vite build **PASS**; o‘zgargan JSX ESLint **PASS**; offline audit **185 ta qaror/35 migration PASS**. Real PostgreSQL integratsiya **SKIP** (server mavjud emas). Mobile/browser E2E, haqiqiy Telegram chaqiruvlari va 5 daqiqalik takliflar hali bajarilmadi. **Production-ready emas.**

**Keyingi manba:** `USTARA-4-Bosqich-Live-Queue-v24.zip` va `docs/USTARA_LATEST_CHECKPOINT.md`. v25 — Telegram queue call outbox/idempotency va notification, keyin Smart Booking takliflari.

---

## v25 — 4-bosqich / Telegram queue call + opt-in + delivery outbox (2026-11-18)

**Asos ZIP:** `USTARA-4-Bosqich-Live-Queue-v24.zip`. Oldingi v24 kod, v23 Admin QR TTL, OTP 1:00 va 185 qaror saqlandi.

1. 36-chi forward migration `20261207_queue_telegram_notifications.sql`: bir martalik Telegram invite tokenning faqat SHA-256 hashi, QR ticket → chat consent bog‘lanishi, queue outbox (unique entry+called event, lease, status, attempts va Telegram message ID).
2. `queueTelegramNotifications.js`, `queueTelegramController.js`, `routes/queue.js`: QR token+request receipt bilan faqat tasdiqlangan bugungi waiting ticket egasi 5 daqiqalik Telegram deep link olishi mumkin. Brauzer Telegram chat ID kiritmaydi; linked boolean statusda ko‘rinadi. Opt-out pending xabarni bekor qiladi.
3. `telegram/handler.js`, `worker.js`, `webhook.js`: faqat Telegram private chatda `/start qnotify_<token>` ixtiyoriy ulanish, `/stopqueue` bekor qilish. Qolgan barber registration/OTP/bookings qo‘zg‘atilmadi.
4. `walkinQueueController.js`: navbatga chaqirish va outbox enqueue bir PG transactionda. `finish` queued deliveryni cancel qiladi; takroriy callNext takroriy event bermaydi.
5. `telegram/queueNotificationWorker.js`: alohida background processor, SQL SKIP LOCKED, UUID lease, expiry/retry (6 marta), 4xx permanent error, Telegram reply validation. Crash ACK oraliqda exactly-once kafolatlanmaydi, **at-least-once**.
6. Frontend QueueCheckIn: aniq ixtiyoriy Telegram ulash, tasdiqlash havolasi va bekor qilish. Email/telefon yoki boshqa odam xabarlari tarqatilmaydi.
7. `backend/WALKIN_QUEUE_V25.md` qo‘llanma, `queueTelegramNotifications.unit.test.js` (8), `queueTelegramBot.unit.test.js` (3), 36 migrationli bootstrap/verify/audit va 185 reyestr #127/#129 yangilandi.

**Sinov:** 11 yangi unit PASS; tanlangan suite 30/30 PASS; offline 185 qaror / 36 forward migration PASS. To‘liq backend, frontend, Vite build/lint v25 uchun bajarilmadi — dependencies (`node_modules`) mavjud emas, npm registry yuklab bo‘lmadi. v24 409/409 + 152/152 avvalgi natija, v25 uchun emas. Real PostgreSQL/Telegram API/mobile browser E2E: **SKIP/BAJARILMADI**. **Production-ready emas.**

**Keyingi:** `USTARA-4-Bosqich-Telegram-Queue-v25.zip` + `docs/USTARA_LATEST_CHECKPOINT.md`. v26 5 daqiqalik Smart Booking takliflari va atomar reply; v25 staging PG/Telegram tekshiruvlarini alohida yopish.

---

## v26 — 4-bosqich / 5 daqiqalik Smart Booking QR taklifi (2026-11-18)

**Asos:** `USTARA-4-Bosqich-Telegram-Queue-v25.zip` (546 arxiv elementi); avvalgi kod saqlandi. OTP ekranidagi yagona **1:00** va Admin QR TTL **1–120 daqiqa** o‘zgarmadi.

1. `20261208_smart_booking_offers.sql` **37-migratsiya**: yangi `smart_booking_openings` va `smart_booking_offers`, bitta opening uchun faqat 1 pending, bitta QR entry uchun 1 pending, taklif-entry idempotency; `bookings` active→cancelled **bugungi kelajakdagi vaqt** uchun DB trigger bilan opening yozadi. Migratsiya DBda **bajarilmadi**.
2. `services/smartBookingOffers.js`: booking va queue bilan umumiy barber advisory lock, qayta tekshiriladigan occupied slot, bugungi QR-approved waiting FIFO, 300s TTL; `accept/reject/cancel`, `replayed`, expiry/409 va idempotent transaction. Bir taklifga takroriy/qayta javob ikkinchi yozuv yaratmaydi. Worker `scripts/smart-booking-worker.js` har 5 soniyada keyingi taklifga yuradi, operator uni alohida supervision bilan ishga tushirishi kerak.
3. QR `POST /api/queue/offers/:id/decision` (QR token + receipt hash only), `/api/queue/qr-status` smart_offer status; barber `GET /api/queue/offers/mine`, `PATCH /api/queue/offers/:id/cancel`. QR sahifasida countdown + qabul/rad/bekor; barber Navbat sahifasida bugungi takliflar. QR bo‘lmagan manual walk-in va Telegram offer callback **hali yo‘q**.
4. `backend/SMART_BOOKING_V26.md`, `backend/test/smartBookingOffers.unit.test.js` 14 test, bootstrap inventory, 185 qaror reyestri #19/#20/#21/#30 `qisman` yangilandi.

**Chegara:** taklifning qabul qilinishi **booking jadvaliga hech qanday bron qo‘shmaydi va real slotni band qilmaydi**. QR mehmon hozircha akkaunt/xizmat/davomiylik tanlamagan. Tasdiqlangan vaqt deb e’lon qilinmaydi. v27 da haqiqiy bron bilan atomar bog‘lash, xizmat matching, Telegram offer callback/outbox va manual walk-in moslashtirish qoladi.

**Sinov va xavf:** local v26 unit testlar, offline migration audit va JSX parser orqali statik tekshiruv bajarildi. React/Vite prod build, to‘liq backend/frontend suite (arxivda `node_modules` yo‘q), haqiqiy PostgreSQL migration/transaction race/trigger va Telegram/brauzer E2E **tekshirilmadi**. Trigger yoqilsa cancellation yangi jadvalga tayanadi: prod deploydan oldin migration/permissions/recovery staged sinovdan o‘tishi majburiy. **Production-ready emas.**

**Keyingi manba:** `USTARA-4-Bosqich-Smart-Booking-v26.zip` + `docs/USTARA_LATEST_CHECKPOINT.md`; v27 = slotni haqiqiy booking bilan atomar bog‘lash (faqat QR offer qabul qilish bilan bron hisoblanmaydi), Telegram taklif notification/callback va real PG concurrency/staging sinovlarini yopish.


---

## v27 — 4-bosqich / Smart Booking atomar bron + Telegram offer notification (2026-11-18)

**Asos:** v26 `USTARA-4-Bosqich-Smart-Booking-v26.zip`; oldingi OTP 1:00, Admin QR TTL 1–120 min, v25 queue call va v26 5min taklif saqlandi.

1. **38-migratsiya** `20261209_smart_booking_confirmation.sql` (forward-only): `smart_booking_confirmations` bir offer↔bir booking UNIQUE, alohida `offers_consent_at` (NULL default), `smart_booking_telegram_outbox`, accepted worker index. Bootstrap/verify + 185 qaror reyestri yangilandi, oldingi migratsiyalar o‘zgartirilmadi.
2. `services/smartBookingConfirmation.js`: qabul qilingan taklifdan keyin **2min** ichida QR token+receipt va real `customer` JWT akkount bilan aniq bitta matching faol xizmat tanlab, narx/server quote, ish kalendari/break, queue va slot/customer overlapni qayta tekshirib `bookings` + service snapshot + confirmation UNIQUE + queue audit **bir PG transaction**da. `23P01` exclusion → 409; replay mavjud booking ID. `POST /api/queue/offers/:id/services`, `/confirm-booking` va QR UI qo‘shildi.
3. `smartBookingOffers.tick` 2min qabul tasdiqlash muddati tugasa offer expired → keyingi FIFO QR navbatga qaytadi; `decideByTelegram` ham chat+message sent outbox ownership bilan tekshiradi.
4. Taklif Telegram xabarlari uchun **mustaqil opt-in**: `POST /api/queue/telegram/offer-consent`. `services/smartBookingTelegram.js` + supervised `npm run smart-booking:telegram` worker, private chat `so:a|r:<offer_id>` inline callback; known 429 retry, no automatic uncertain replay. Telegramdagi qabul booking emas; vebda customer login majburiy.
5. Barber `Queue` bugungi booking ID va Telegram statusni ko‘radi; QR `QueueCheckIn` 2 min hisoblaydi, duration mos narxli xizmatlarni chiqaradi, login asosida bronni tasdiqlaydi. Testlar va runbook `backend/SMART_BOOKING_V27.md`da.

**Chegaralar:** faqat QR approved waiting va aynan bitta duration-matching xizmat; manual walk-in va ko‘p xizmatli Smart Booking keyingi bosqich. **Real PostgreSQL migration/trigger/race, Telegram va mobile E2E BAJARILMADI; production-ready emas**. Dastlabki v27 unit testlar mock DB, to‘liq backend/frontend suite node_modules yo‘qligi sabab yakuniy tekshirilmagan.

**Keyingi:** `USTARA-4-Bosqich-Smart-Booking-Confirmed-v27.zip` + v27 checkpoint. v28: staging PG parallel concurrency va real Telegram E2E; manual walk-in, ko‘p xizmatli taklif moslashuvi va kalender integratsiya.


---

## v28 — 4-bosqich / Ko‘p xizmatli Smart Booking va local staging audit (2026-11-18)

**Asos:** `USTARA-4-Bosqich-Smart-Booking-Confirmed-v27.zip`. v27 QR token+receipt, customer JWT, offer 5min, confirm 2min, barber advisory lock, booking overlap, Telegram alohida opt-in hammasi saqlandi.

1. `backend/services/smartBookingConfirmation.js`: xizmatlar preview endi individual davomiylik openingdan katta bo‘lmagan 100 tagacha faol xizmatni qaytaradi, `duration_minutes` va `max_services:20` ni bildiradi. Confirm endpoint 1–20 ta `service_ids` (faqat noyob integer) va oldingi `service_id` formatini qo‘llaydi, ular birga yuborilsa 400. `selectedServices FOR SHARE`, jami duration/price qayta tekshirilib, har biriga immutable `booking_services` snapshot yaratilib, hammasi bir booking transactionda saqlanadi.
2. `frontend/src/pages/queue/serviceBundle.js` va `QueueCheckIn.jsx`: multi-select, foydalanuvchi uchun qolgan daqiqa va integer-cent jami summa; faqat duration aniq teng bo‘lsa confirm yoqiladi; stale catalog/price bo‘lsa quote qayta yuklanadi. Faqat UI preview, final narxni server tekshiradi.
3. `backend/test/smartBookingConfirmation.unit.test.js` va `frontend/test/serviceBundle.test.js`: ko‘p xizmat narxi, tanlov tartibi, snapshotlar, kam/ortiqcha vaqt, duplicate, eski API format, proof va expired xatolar. Local read-only opt-in PG katalog testi `backend/test/smartBookingV28.postgres.integration.test.js`, `npm run test:smart-booking:db` (hozir SKIP: lokal postgres yo‘q).
4. 185 qaror registri #5/#19/#20 ga v28 izohi qo‘shildi. **Migratsiya qo‘shilmadi**: jami 38; eski SQL va maxfiy fayllar ZIPga qo‘shilmadi. `backend/SMART_BOOKING_V28.md` runbook.

**Sinov:** tanlangan backend 47/47 PASS; frontend 155/155 PASS; JSX syntax parse 0 error; offline migration + 185 qaror unit audit PASS. To‘liq backend suite 230 PASS, 26 ta dependency (`pg`, `express`, `bcrypt`, `jsonwebtoken`) yo‘qligi sabab FAIL (kod ishlashi haqida xulosa emas). Real PostgreSQL, Telegram, mobil E2E, Vite build/ESLint BAJARILMADI. **Production-ready emas.**

**Keyingi:** v29 — real test PG bilan parallel booking/E2E va identity/consent asosida manual walk-in taklif oqimi; Telekom callback browser test va full app build/lint.


---

## v29 — 4-bosqich / QRsiz walk-in mijozning ixtiyoriy Smart Booking claimi (2026-11-18)

**Asos:** `USTARA-4-Bosqich-Smart-Booking-MultiService-v28.zip`. v28 multi-service, QR 5min offer/2min confirm, Telegram opt-in, OTP 1:00, Admin QR 1–120min saqlandi.

1. **39-chi forward migration** `20261210_manual_queue_claims.sql` — manual ticket uchun hash-only bir martalik kod (128-bit, 15min), customer+consent (default NULL) va PK/UNIQUE/FK/CHECK cheklovlar. Existing data migratsiya bilan o‘zgarmaydi. Bootstrap/verify/audit 39; reyestr 185 qaror saqlandi; #126/#127 qisman yangilandi.
2. `services/manualQueueClaims.js` + controller — barber orqali QR bo‘lmagan waiting ticketga code issue (60s throttle), authenticated customer claim, `mine` va consent revoke. Claim ro‘yxatdagi boshqalarga ism/telefon/chat oshkor qilmaydi. Kod ishlatilgach bazadagi hash ham NULL bo‘ladi. Consent revokeda faqat hali bron qilinmagan pending/accepted offer cancellation, avvalgi haqiqiy booking saqlanadi.
3. `smartBookingOffers.js` worker nomzodlarida QR approved **yoki** customer-linked manual ticket; FIFO bir xil. `decideByCustomer` va `smartBookingConfirmation.js` manual proof bilan (QR/anon pathdan ajratilgan) barber lockdan keyingi owner/consent recheck. Account+calendar+duration+narx+overlap va booking snapshots 1 PG transactionda.
4. `routes/queue.js` authed manual APIlar; `frontend/src/pages/queue/ManualQueue.jsx` va `App.jsx` `/user/queue`; Barber Queue`da bir martalik claim code UI; User Bronlar sahifasidan havola. QR ticketda code tugmasi bloklanadi; Telegram avtomatik yoqilmaydi. Qo‘llanma `backend/SMART_BOOKING_V29.md`.
5. `backend/test/manualQueueClaims.unit.test.js` yangi unitlar, read-only opt-in `manualQueueV29.postgres.integration.test.js`; real DB sinovi default SKIP. Yangi SQL regressiyasi / JSX parser va audit.

**Sinovlar:** yangilangan tanlangan backend suite PASS, frontend 155/155 PASS, 39 migratsiya/185 qaror offline audit PASS, 4 JSX syntax parser PASS. Backend barcha unitlar 244 PASS/26 FAIL (`pg`, `express`, `bcrypt`, `jsonwebtoken` npm packages yo‘q, testlar ishga tushmadi); tanlangan backend/audit 62 PASS/1 SKIP, 13 yangi unit PASS; real PG SKIP. Real PostgreSQL, concurrency E2E, Telegram live, mobile/browser va production build/ESLint **BAJARILMADI**. **Production-ready EMAS.**

**Keyingi:** v30 — alohida test PostgreSQL’da real 2-connection concurrency, manual claim/revoke/accept/confirm, migratsiya staging, Telegram/browser E2E va all-deps build. `.env`, `node_modules`, JWT/API token, parollar ZIPga kiritilmasin.


---

## v30 — 4-bosqich / Smart Booking faol takliflarni PG UNIQUE himoya (2026-11-18)

**Asos:** `USTARA-4-Bosqich-Manual-Walkin-SmartBooking-v29.zip` (572 fayl). `smartBookingOffers.tick` endi `pending` **va** `accepted` statusdagi taklifli ticketga boshqa opening bermaydi: v29 da ikkinchi pending offer qabul qilingan ticketning 2min confirm grace davrida paydo bo‘lishi mumkin edi.

1. **40-migratsiya** `20261211_smart_booking_active_entry.sql`: `smart_booking_one_active_entry` partial UNIQUE `(entry_id) WHERE status IN ('pending','accepted')`; oldingi dublikat bo‘lsa migration safely FAIL/ROLLBACK (manual review), hech narsa avtomatik tozalanmaydi. PostgreSQL real stagingda qo‘llanmagan.
2. Bootstrap/verify/audit 40 migration, 185 qaror; `#132` qisman yangilandi, eski OTP 1:00, QR TTL 1–120m, offer 5min, confirm 2min va manual walk-in v29 saqlandi.
3. `smartBookingV30.unit.test.js` 4 unit, `smartBookingV30.postgres.integration.test.js` ikki DB sessiya advisory lock va PG UNIQUE katalog audit, **faqat read-only opt-in**; `npm run test:smart-booking:v30:db`; `backend/SMART_BOOKING_V30.md` runbook.

**Sinov:** tanlangan 66 PASS / 1 SKIP (read-only PG), frontend 155/155 PASS, offline 185/40 PASS. To‘liq backend 248 PASS / 26 FAIL (missing npm `jsonwebtoken` 9, `express` 8, `bcrypt` 6, `pg` 3), npm ci --offline ENOTCACHED. Real DB integratsiyasi va claim/revoke/confirm race, live Telegram/mobil E2E, Vite build/ESLint **BAJARILMADI**. **Production-ready EMAS.**

**Keyingi v31:** maxsus PostgreSQL staging bo‘lsa haqiqiy fixture race testlari, keyin Telegram/browser E2E va deploy QA; ZIP `USTARA-4-Bosqich-SmartBooking-ActiveOffer-v30.zip` + docs checkpoint.

---

## v31 — 4-bosqich / QR va Telegram roziligining transaction-time qayta tekshiruvi (2026-11-18)

**Asos:** `USTARA-4-Bosqich-SmartBooking-ActiveOffer-v30.zip`. QR receipt, Telegram callback va offer-consent ilk tekshiruvdan so‘ng lock kutayotgan paytda revocation yoki qayta opt-in bo‘lishi mumkin edi. v31 barcha muhim qarorlarni **offer+queue lockdan keyin** qayta tasdiqlaydi.

1. `backend/services/smartBookingOffers.js`: QR decide uchun `r.status='approved'` `FOR SHARE OF r` recheck; Telegram callback uchun `FOR SHARE OF s,t`, `offers_consent_at<=sent_at` va sent chat+message recheck. `403 ticket_revoked`/`callback_revoked` bilan rollback. Eski Telegram xabarni /stopqueue → qayta opt-in bilan tiriltirib bo‘lmaydi.
2. `backend/services/smartBookingConfirmation.js`: booking insert/replaydan oldin QR receipt va approved statusni transaction offer/queue locklaridan keyin `FOR SHARE OF r` bilan qayta tekshiradi. Manual claim proof ham avvalgidek transaction lock bilan himoyalangan.
3. `backend/services/queueTelegramNotifications.js`: `offerConsent` barber+queue lockdan keyin QR approved proofni qayta tekshiradi; bekor qilingan QR opt-in yoqolmaydi.
4. `backend/test/smartBookingOffers.unit.test.js`, `smartBookingConfirmation.unit.test.js`, `queueOfferConsent.unit.test.js`: 5 ta yangi regressiya testi, 1 ta mock helper moslash. `npm run test:smart-booking:v31` va opt-in DB alias; qo‘llanma `backend/SMART_BOOKING_V31.md`.
5. **SQL migration yo‘q**: jami 40 forward migrations, 185 qaror va oldingi APIlar saqlanadi. OTP 1:00, Admin QR 1–120m, taklif 5min, bron tasdiqlash 2min o‘zgarmadi.

**Sinov:** tanlangan 39/39 PASS; frontend 155/155 PASS; full backend 253 PASS / 26 `MODULE_NOT_FOUND` (`jsonwebtoken`, `express`, `bcrypt`, `pg`); offline audit 185 qaror / 40 migration PASS. Real PostgreSQL, Telegram, browser E2E va Vite build/ESLint bajarilmadi. **Production-ready EMAS.**

**Keyingi v32:** maxsus toza lokal PostgreSQL'da migration/fixture 2-connection race testlar, dependencies bilan full suite/build/lint, Telegram real callback va mobile browser E2E. `.env` va maxfiy ma'lumotlarni ZIPga qo‘shmang.

---

## v32 — 4-bosqich / manual Smart Booking idempotent replay (2026-11-18)

**Asos ZIP:** `USTARA-4-Bosqich-Consent-Race-Hardening-v31.zip`. v31 dagi 577 ta fayl saqlanadi; hech qanday avvalgi migratsiya tahrirlanmadi.

1. `backend/services/manualQueueClaims.js`: `ownedEntry` uchun faqat tasdiqlangan bronni qayta olishda ishlatiladigan `allowConfirmedReplay` rejimi. Manual queue `left` bo‘lsa, `smart_booking_confirmations` jadvali aynan ushbu taklif + ushbu customerga tegishli mavjud bronni tasdiqlashi shart. Odatiy `decide`, katalog va not-confirmed takliflarda `waiting` qoidasi o‘zgarmaydi.
2. `backend/services/smartBookingConfirmation.js`: manual `confirm()` egaligini barber/offer lockdan oldin va keyin `allowConfirmedReplay:true` bilan tekshiradi; avval tasdiqlangan bron shu customerga `replayed:true` bilan qaytariladi. Begona mijozga bron ID berilmaydi, takroriy INSERT bajarilmaydi.
3. `backend/test/smartBookingConfirmation.unit.test.js`: 3 yangi unit regressiya (confirmed manual replay, begona ticket himoyasi, odatiy waiting-only proof). Runbook `backend/SMART_BOOKING_V32.md`.
4. 185 ta qaror reyestri va **40 ta** forward SQL migratsiya o‘zgarmadi; OTP 1:00, Admin QR TTL 1–120 daqiqa, taklif 5 daqiqa va confirm 2 daqiqa saqlandi.

**Sinov:** tanlangan backend **55/55 PASS**; barcha backend unitlarda **256 PASS / 26 dependency MODULE_NOT_FOUND FAIL**; frontend **155/155 PASS**; `audit-phase1` **185 qaror / 40 migratsiya PASS**; PG read-only opt-in **SKIP**. `npm ci` tarmoq kutishida tugamadi, Vite build va ESLint **BAJARILMADI**. Real PostgreSQL transactional race, Telegram va mobil E2E **BAJARILMADI**. **Production-ready EMAS.**

**Keyingi v33:** operator ruxsati bilan izolyatsiyalangan PG staging fixture (manual confirm/replay after queue left, revoke/confirm, parallel bookings, unique/exclusion), haqiqiy Telegram callback va browser E2E; barcha npm paketlari bilan full suite va build/lint. `.env`, tokenlar va lokal npm/dist ZIPga kirmasin.

---

## v33 — 4-bosqich / mijoz navigatsiyasi, identity lock va 185 qaror auditi (2026-11-18)

**Asos:** `USTARA-4-Bosqich-Manual-Replay-Safety-v32.zip`; v32 `578` fayl saqlanadi. `frontend/src/layouts/UserLayout.jsx`da 185 qarordan **#60**ga mos 5 tab: Asosiy / Sartaroshlar / Ilhom / Bronlar / Profil; frontend regression test qo‘shildi. `smartBookingOffers.decideByCustomer` active user/customer qatorlariga `FOR SHARE OF c,u` lockni decision COMMITgacha tutadi; eski sessiya va deactivation poygasi himoyasi uchun ikki unit test. Telegram offer xabari va callback 2min veb tasdiqlash yo‘lini aniq eslatadi; Telegram sent xabar bronning o‘zi emas.

`backend/scripts/decision-coverage.js` va `decisionCoverage.unit.test.js` qaror reyestrini yaxlitlik bo‘yicha tekshiradi. **185 qaror = 131 tekshiruvda + 46 qisman + 7 bekor/keyinga + 1 ochiq (#175)**. `docs/USTARA_185_AUDIT_V33.md` jamlanma, avvalgi 185 qarorning to‘liq matni CSVda. '185 tasi to‘liq bajarilgan' xulosasi berilmaydi. **Yangi SQL migratsiya yo‘q:** 40 ta.

**Sinov:** backend tanlangan **65/65 PASS**; frontend **156/156 PASS**; full backend **261 PASS / 26 MODULE_NOT_FOUND FAIL** (zarur npm paketlari yo‘q); 185/40 offline audit PASS. Real PG, live Telegram, mobile browser E2E va Vite build/ESLint **BAJARILMADI**. **Production-ready emas**.

**Keyingi manba:** `USTARA-4-Bosqich-Decision-Integrity-v33.zip` + `docs/USTARA_LATEST_CHECKPOINT.md`. v34: haqiqiy izolatsiyalangan PG integratsiya/race testlari, Telegram/browser sinovlari, 185 qarorni dalil bo‘yicha birma-bir tekshirish. `.env`, `node_modules`, `dist` arxivga qo‘shilmasin.

---

## v34 — 4-bosqich / Account pause ↔ Smart Booking user-row lock (2026-11-18)

**Asos ZIP:** `USTARA-4-Bosqich-Decision-Integrity-v33.zip` (583 fayl). Oldingi API va tarixiy migrationlar o‘zgartirilmadi.

1. `smartBookingConfirmation.confirm` va `manualQueueClaims.assertCustomer` `FOR UPDATE OF c,u` bilan customer hamda user qatorlarini transaction oxirigacha qulflaydi; account pause (users UPDATE) bilan poyga himoyasi kuchaydi. QR, manual va eski replay xususiyatlari saqlandi.
2. Ikki test fayliga jami **4 yangi unit test**: lock ordering, inactive session confirm/replay va manual claim/revoke; hammasi tanlangan suite ichida PASS.
3. 185 kelishuv reyestrida faqat **#135 dalili** yangilandi (status qisman). #175 ochiq. Audit `docs/USTARA_185_AUDIT_V34.md`.
4. `backend/SMART_BOOKING_V34.md`, `test:smart-booking:v34` test skripti. SQL migratsiya yo‘q — **40 ta**.

**Tekshiruv:** tanlangan `npm run test:smart-booking:v33` **69/69 PASS**; 185 qaror / 40 migratsiya offline PASS; `accountPause.unit` **MODULE_NOT_FOUND bcrypt** sabab ishga tushmadi. Frontend o‘zgarmagan, v34 da test/build qayta ishga tushirilmadi (v33 156/156 baseline). Real PostgreSQL, Telegram, mobil E2E va production build **BAJARILMADI**. **Production-ready EMAS**.

**Keyingi v35:** `npm ci`ni to‘liq tugatib, izolyatsiyalangan va explicit ruxsatli staging PostgreSQL’da real 2-connection deactivation+confirm/claim/revoke race testlari, keyin Telegram va brauzer E2E. `docs/USTARA_LATEST_CHECKPOINT.md` dan davom etilsin. ZIP’ga `.env`, `node_modules`, `dist`, tokenlar kiritilmasin.

---

## v35 — Smart Booking session/offer replay hardening + row-lock staging test (2026-11-18)

**Asos:** v34 account lock; 585 eski fayl saqlangan. Qaror matnlari/statuslari o'zgarmadi, 40 migration o'zgarmadi.

1. Manual `mine` real user/customer identity'ni `FOR UPDATE OF c,u` bilan tekshiradi va session pause bilan serialize qiladi; offer status validligini DB soati bilan hisoblaydi. Inactive account 401.
2. Barber list/cancel `barberId+userId` ni bitta transactionda `FOR SHARE OF b,u` bilan tekshiradi, shu bilan stale/wrong accountdan list/cancel himoyalanadi.
3. `accepted` taklifni 2 daqiqadan keyin takroriy accept qilish worker kechikishida ham 410 qaytaradi, tasdiqlanmagan offer expired qilinadi; confirmed booking replayga ta'sir qilmaydi.
4. Strict opt-in `test/smartBookingV35.postgres.integration.test.js`: ikki PG sessiyasida owned ephemeral schema bilan user+customer row lock vs account deactivation. Real server yo'qligi sabab SKIP.
5. Sakkiz yangi unit test; tanlangan backend 77/77 PASS; frontend 156/156 PASS; to'liq backend 273 PASS / 26 missing dependencies import FAIL; offline 185 qaror / 40 migration PASS; npm ci --offline ENOTCACHED. Vite build/lint, real DB/Telegram/browser E2E bajarilmadi. **Production-ready emas**.

**Yangilar:** `backend/SMART_BOOKING_V35.md`, `backend/test/smartBookingV35.unit.test.js`, `backend/test/smartBookingV35.postgres.integration.test.js`, `docs/USTARA_185_AUDIT_V35.md`. `docs/USTARA_LATEST_CHECKPOINT.md` v35 ga yangilandi. v35 ZIP asos qilib olinsin.


---

## v36 — 4-bosqich / Staging va consent lock xavfsizligi (2026-11-18)

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



---

## v37 — 4-bosqich / navbatdan ixtiyoriy chiqish va Telegram consent epoch (2026-11-18)

1. `backend/services/queueSelfExit.js` + controller/routes: QR token+receipt bilan yoki auth manual akkaunt bilan navbatni `waiting/called -> left` qilish, idempotent replay; tasdiqlanmagan takliflar va pending xabarlar bekor, haqiqiy bron saqlanadi. QR va oddiy navbat UI ikkinchi bosqichli tasdiq beradi.
2. `20261212_queue_self_exit_audit.sql` 41-forward migration: auditga `actor_source` va QR guest uchun NULL actor, CHECK invariant; eski eventga `staff` default. `bootstrap`/`verify` yangilandi.
3. `smartBookingOffers.tick`: faolsiz manual mijozlar nomzod emas. `smartBookingTelegram` va Telegram callback `offers_consent_at<=outbox.created_at` bilan eski consent epoch uchun fail-closed. Sending I/O opt-out race hali real E2E talab qiladi.
4. Backend v37 unit, frontend UI tests, `v37-staging.js` (5 test), real DB uchun ephemeral audit migration test; CSV #128 qisman bilan dalillandi. Boshqa 184 kelishuv qarori o‘zgartirilmadi.

**Tekshiruv:** tanlangan v37 backend 100/100 PASS, frontend 158/158 PASS; to‘liq backend 296 PASS / 26 dependency FAIL. Real PostgreSQL/Telegram/mobile E2E va `vite`/`eslint` build hali bajarilmadi. `audit:phase1` 185 qaror/41 forward migration offline PASS. Holat: 130 tekshiruv, 47 qisman, 7 bekor/keyinga, #175 ochiq. **Production-ready emas.**

---

## v38 — 4-bosqich / 10 ta tranzaksion, Telegram va UI yaxshilanish (2026-11-18)

**Asos:** `USTARA-4-Bosqich-Queue-Self-Exit-v37.zip` (605 fayl). 41 migration va `USTARA_185_NAZORAT.csv` o‘zgartirilmadi.

- Confirmed booking ichida end-of-queue xabar, pending Smart offer notice, subscription va invite cleanup, actor_source='customer' audit: barchasi bir xil DB transactionda, booking replay read-only.
- Telegram worker injected ACK javobini chat/message bo‘yicha ham tekshiradi, 5 marta urinib tugagan pendingni failed qiladi; known 429/unknown delivery retry siyosati saqlandi.
- ManualQueue profilga kirilmagan yoki sessiya o‘zgargan holatlarni tozalaydi, old token natijalarini e’tiborsiz qoldiradi, qayta yuklash va max 20 xizmat / timer himoyasi beradi.
- `backend/test/v38BookingLifecycle.unit.test.js`, `v38TelegramDelivery.unit.test.js`, `frontend/test/manualQueueModelV38.test.js`, `backend/SMART_BOOKING_V38.md`, `docs/USTARA_V38_10_ISH.md`, `docs/USTARA_185_AUDIT_V38.md` qo‘shildi.
- QA: backend full **303 PASS / 26 MODULE_NOT_FOUND**; frontend **162 PASS**, audit **185/41**. Real PostgreSQL/Telegram/mobile E2E **bajarilmadi**; `npm ping` DNS EAI_AGAIN, Vite build / ESLint not available. **Production-ready emas.**


---

## v39 — Telegram queue-call delivery uncertainty (2026-11-19)

**Asos:** `USTARA-4-Bosqich-Booking-Delivery-Hardening-v38.zip`; barcha oldingi fayllar saqlandi.

1. 42-chi forward-only SQL `20261213_queue_delivery_uncertain.sql`: queue-call outbox `uncertain` holati; eski yozuvlarga tegmaydi. Bootstrap/verify/reyestr nazoratlari yangilandi.
2. `queueTelegramNotifications.js`: expired `processing` lease endi avtomatik retry emas, **uncertain**; `pending` limit va stale ticket/subscription cleanup.
3. sendMessage ACK: haqiqiy xabar ID va aynan kerakli Telegram private chat id; noto‘g‘ri javob uncertain.
4. 429 known rate-limit retry max 6, 4xx blocked/failed; 5xx/timeout/transport uncertain.
5. Claim va preflight hozirgi queue status/date, chat obuna va owner lease ni qayta tekshiradi.

`backend/test/v39QueueDelivery.unit.test.js` 7 yangi unit; oldingi `queueTelegramNotifications.unit.test.js` mocklari moslandi. `backend/WALKIN_QUEUE_V39.md` qo‘llanma va `docs/USTARA_V39_5_ISH.md` dalil; 185 qaror CSV mazmuni o‘zgarmadi.

**Sinov:** tanlangan queue Telegram suite **32/32 PASS**, frontend **162/162 PASS**; full backend **310 PASS / 26 MODULE_NOT_FOUND**; offline 185 qaror/42 migratsiya audit PASS. Real PostgreSQL/Telegram/mobile, Vite build/lint bu muhitda tasdiqlanmagan, production-ready emas.


---

## v40 — 4-bosqich / Telegram consent, session isolation va staging preflight (2026-11-19)

**Asos:** v39 ZIP (619 fayl), 185 qaror va 42 migratsiya o‘zgarmadi.

1. Invite token consume SQL da database muddati, ishlatilmaganligi, bugungi active waiting queue bo‘yicha filtrlanadi.
2. Telegram invite qayta chiqarish 60s rate limit PostgreSQL soati bilan ishlaydi.
3. `/stopqueue` queue qatorini lock qiladi, keyin obunani atomar transaction ichida o‘chiradi.
4. ManualQueue akkaunt almashganda eski async amallar tokeni, natija/xato/notice to‘g‘ri sessiyaga bog‘lanadi.
5. Maxsus `v40-staging.js`: local `ustara_test_db`, `ustara_account_test`, no-superuser, opt-in flag, 42-migration CHECK preflight va 5 test fayli. Import mutatsiyasiz; ruxsatsiz ishga tushmaydi.

**Testlar:** tanlangan backend 20/20 PASS; to‘liq backend **315 PASS / 26 missing dependency FAIL**; frontend 166/166 PASS; frontend src 123 `.js/.jsx` fayl TS sintaksis parser PASS (Vite build emas); offline audit 185 qaror/42 migratsiya PASS. `npm ci --offline` cache yetishmagani uchun muvaffaqiyatsiz. Real DB, Telegram, mobil E2E, production Vite build/ESLint bajarilmadi; **production-ready emas**.

**Manba:** `USTARA-4-Bosqich-Queue-Consent-Session-Safety-v40.zip`, `docs/USTARA_V40_5_ISH.md`, `backend/WALKIN_QUEUE_V40.md`.

---

## v41 — 4-bosqich / Telegram clock, strict staging, release readiness (2026-11-19)

**Manba:** v40 ZIP, eski funksiya va 185 qaror saqlandi; yangi SQL migratsiya yo‘q, jami 42.

| № | Ish | Kod va natija | Tekshiruv / cheklov |
|---:|---|---|---|
| 1 | QR Telegram havolasi va consent sanasi faqat PG soati bilan | `queueTelegramNotifications.js` — issue/consume/offerConsent database-side today/expiry shartlari | `v41ClockAuthority.unit.test.js`; **real PG sinovi o‘tkazilmagan** |
| 2 | Staging testlar SKIP bo‘lganda noto‘g‘ri PASS bermaslik | `v40-staging.js` TAP totals tekshiradi, 0/skip/fail/todo ni rad etadi | `v41StagingStrict.unit.test.js`; **5 real PG testi bajarilmadi** |
| 3 | Staging preflightni read-only va public schema bilan cheklash | `v40-staging.js` `default_transaction_read_only=on`, `search_path=public`; rol va constraint tekshiruvi | v40/v41 unit; **real PostgreSQL tekshiruvsiz** |
| 4 | Npm/build muammolari uchun yashirmaydigan offline readiness diagnostikasi | `v41-readiness.js`; modullar, 185 qaror, 42 migratsiya va E2E NOT_RUN | `v41Readiness.unit.test.js`; `npm ci` yakunlanmadi, Vite yo‘q |
| 5 | Telegram outbox uchun maxfiylikka rioya qiladigan read-only operator monitoringi | `v41-telegram-delivery-health.js`; faqat agregat count, failed/uncertain/stale lease, resend yo‘q | `v41TelegramDeliveryHealth.unit.test.js`; real DB mavjud emas |

**QA:** tanlangan v41+regressiya backend **24/24 PASS**, frontend **166/166 PASS**; full backend **327 PASS, 26 dependency MODULE_NOT_FOUND** (353 ta test). Offline 185 qaror / 42 migration audit PASS. Frontend `vite build` — binary yo‘q; gerçek PostgreSQL/Telegram/mobile/browser E2E — NOT_RUN. **Production-ready emas.**



**Keyingi:** npm ci serverga tarmoq bilan, real PostgreSQL test DB, 5 integration test full PASS, real Telegram E2E, frontend Vite build va mobil smoke.

---

## v42 — 4-bosqich / Telegram in-flight NULL lease, strict migration preflight va manual queue refresh race (2026-11-19)

**Asos:** v41 (638 fayl/arxiv elementi). Yangi qaror yoki SQL migratsiya qo‘shilmadi; 185 qarorning asl CSV ma'nosi o‘zgarmadi (SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`); 42 ta forward SQL migratsiya saqlandi.

**5 ish:**
1. `backend/services/queueTelegramNotifications.js`: `status=processing` va `lease_until IS NULL` orphaned job `uncertain` bo‘ladi, qayta yuborilmaydi.
2. `backend/services/smartBookingTelegram.js`: `status=sending` va NULL lease `uncertain` bo‘ladi, avtomatik retry yo‘q.
3. `backend/scripts/v41-telegram-delivery-health.js`: null lease ham stale hisoblanadi, faqat umumiy sanash, maxfiy identifikatorlarsiz.
4. `backend/scripts/v40-staging.js`: faqat read-only `ustara_test_db` preflight, barcha 42 migratsiya versiyasi aynan mosligi tekshiriladi, unknown/dup/missing -> FAIL. `SKIP` hech qachon PASS emas.
5. `frontend/src/pages/queue/ManualQueue.jsx` + `requestOrderV42.js`: eski polling reply keyinroq kelsa ham yangiroq bir-akkaunt navbat ma'lumotini bosmaydi. Logout/ruxsat bekor qilinsa gate invalidatsiya qilinadi.

**Yangi testlar:** `v42DeliveryLease.unit.test.js` (3), `v42MigrationLedger.unit.test.js` (3), `manualQueueReadOrderV42.test.js` (3), jami 9. Eski v39 test null lease yangi shartiga moslandi.

**Sinov:** tanlangan backend (v39-v42 regressiya) 41/41 PASS; backend to‘liq 333 PASS / 26 dependency MODULE_NOT_FOUND; frontend 169/169 PASS; 185 qaror/42 migration offline PASS. `npm ci --offline` ikkala qismda ENOTCACHED, `vite build` binary yo‘qligi sabab BLOCKED. Haqiqiy PostgreSQL, Telegram API va mobil brauzer E2E **NOT_RUN**. Ishlab chiqarishga tayyor **EMAS**.


---

## v43 — 4-bosqich / Telegram 429 cooldown, staging read-only monitoring va session safety (2026-11-19)

**Asos:** v42 646 ta fayl; oldingi kod, 185 qaror va 42 SQL migratsiya saqlandi. Yangi migratsiya yo'q.

1. Telegram API HTTP 429 `retry_after` qayta yuborish muddatini 60 soniyaga qisqartirmasdan xavfsiz ko'rib chiqadi. 30 kundan katta muddat operator review talab qiladi.
2. Queue Telegram worker Telegram ko'rsatgan muddatdan oldin retry qilmaydi; uzoq 429 avtomatik ravishda retry qilinmaydi, unknown send no-blind-replay saqlanadi.
3. Smart Booking Telegram worker uchun bir xil qoidalar ishlaydi.
4. Operator read-only aggregati 15 daqiqadan ortiq muddati o'tgan pendinglarni sanaydi; staging TAP summary duplicate/inconsistent totals ni rad etadi; readiness v43 diagnostikasi.
5. ManualQueue 401 da butun bekor bo'lgan sessiyani tozalaydi, 403 da boshqa sahifalarni majburan logout qilmaydi.

**Sinov:** 10 yangi test PASS; backend tanlangan 38/38 PASS, frontend tanlangan 8/8 PASS, to'liq backend 342 PASS / 26 missing dependency FAIL, frontend 170/170 PASS; offline 185 qaror / 42 migration PASS. Haqiqiy DB, Telegram, mobil E2E NOT_RUN; Vite/ESLint BLOCKED (npm dependency yo'q). Production-ready EMAS.

**Manba:** `USTARA-4-Bosqich-Telegram-Retry-Readiness-v43.zip`, `docs/USTARA_LATEST_CHECKPOINT.md`, `docs/USTARA_V43_5_ISH.md`, `docs/USTARA_V43_TEST_RUNBOOK.md`.


---

## v44 — 4-bosqich / Telegram retry, staging TAP, mobil sessiya va dependency readiness (2026-11-19)

**Asos:** v43, 655 fayl. **5 ish:** 1) Telegram noto'g'ri `retry_after` xavfsiz rad etiladi; 2) Telegram operator monitoridagi duplicate aggregate aniqlanadi; 3) staging TAP natijasi 6 summary yozuvi bilan tasdiqlanadi; 4) ManualQueue xizmat so'rovlarida sessiya epoch himoyasi; 5) dependency readiness faqat ishlaydigan package entryni tan oladi va lockfile nazoratini ko'rsatadi.

**QA:** yangi/regressiya backend tanlangan 23/23 PASS; frontend tanlangan 6/6 PASS; frontend full 172/172 PASS; backend full 350 PASS / 26 FAIL (`MODULE_NOT_FOUND`); 185 qaror / 42 SQL migratsiya offline PASS. `npm ci --offline` ENOTCACHED, Vite/ESLint not installed, real PG/Telegram/mobil E2E NOT_RUN. **Production-ready emas.**

**Manba:** `USTARA-4-Bosqich-Telegram-Staging-Integrity-v44.zip`, `docs/USTARA_LATEST_CHECKPOINT.md`, `docs/USTARA_V44_5_ISH.md`, `docs/USTARA_V44_TEST_RUNBOOK.md`.

---

## v45 — 4-bosqich / staging, Telegram monitoring, mobil expiry va 185 integrity (2026-11-19)

# USTARA v45 — 5 ta ish

| № | Vazifa | Amaliy o'zgarish | Test/dalil |
|---|---|---|---|
| 1 | Staging TAP tekshiruvi | TAP sarlavhasi, `not ok`, `Bail out!` ham qat'iy tekshiriladi | `v45Integrity.unit.test.js`, v41/v43 fixture updates |
| 2 | Telegram operator aggregati | Mantiqan noto'g'ri `due/overdue/stale_lease` rad qilinadi, shaxsiy data yo'q | `v45Integrity.unit.test.js` |
| 3 | Smart Booking mobil sahifasi | Muddati o'tgan taklif uchun qabul/tasdiq yo'q, no-request on expired | `offerActionStateV45.test.js` |
| 4 | npm readiness | Paket papkasidan tashqariga resolve qiladigan entry rad | `v45Integrity.unit.test.js`, oldingi v44 testlar |
| 5 | 185 qaror yaxlitligi | CSV struktura + SHA-256 majburiy tekshiruv | `npm run v45:decisions`, v45Integrity.unit.test.js |

**Natijalar:** backend tanlangan 21/21; frontend tanlangan 9/9, full 175/175. Backend full 357 PASS / 26 missing dependency FAIL. Production build, real PostgreSQL, Telegram API va browser E2E NOT_RUN. 185 qaror ro'yxati barcha funksiyalar ishlashini bildirmaydi.

42 migratsiya saqlandi; real DB/Telegram/mobile E2E not run.

---

## v46 — 4-bosqich / walk-in ownership va booking lifecycle (2026-11-19)

**Asos:** v45 (671 fayl). **5 ish:** sartarosh navbat yozuvlari uchun `user_id` egalik + identity-first `FOR SHARE` lock; GET listda ham ownership; call-next tugallanmagan Smart Booking takliflarini transaction ichida bekor/reopen qiladi; finish ham Telegram notification/subscription/invite va Smart Booking outboxni tozalaydi; mahalliy test PG uchun ephemeral schema+6th integration test va qat'iy opt-in staging runner. **Tasdiqlangan bronlarga tegilmaydi.**

**QA:** tanlangan backend 40/40 PASS; full backend 368 PASS/26 dependency FAIL; frontend 175/175 PASS; real PostgreSQL 1 SKIP, Telegram/mobile E2E NOT_RUN, production Vite/ESLint NOT_RUN. Qarorlar 185/185 va 42 migrations offline PASS; yangi migratsiya yo'q. **Production-ready emas.**

**Keyingi manba:** `USTARA-4-Bosqich-Queue-Lifecycle-Ownership-v46.zip`, `docs/USTARA_LATEST_CHECKPOINT.md`, `docs/USTARA_V46_5_ISH.md`.


---

## v47 — 4-bosqich / Private queue read & terminal replay safety (2026-11-19)

**Asos:** v46, 680 fayl. 5 ish: (1) barber private GET repeatable-read snapshot/identity lock; (2) finished-ticket replay cleans stale pending notices and unconfirmed offers; (3) QR/manual self-exit replay cleans unsent delivery without repeat audit; (4) unified terminal cleanup helper preserving confirmed bookings; (5) Telegram polling 429 missing/invalid cooldown fails closed rather than fast replay.

**Sinov:** backend selected 39/39 PASS; full backend 378 PASS, 26 missing dependency FAIL; frontend unit 175/175 PASS. Real PG test SKIP; staging unapproved refused; Vite build blocked (vite not found); real Telegram/mobile E2E NOT_RUN. 185 decision text and 42 migrations unchanged. **Production-ready emas.**

**Manba:** `USTARA-4-Bosqich-Queue-Read-Replay-Safety-v47.zip`, `docs/USTARA_LATEST_CHECKPOINT.md`, `docs/USTARA_V47_5_ISH.md`, `docs/USTARA_V47_TEST_RUNBOOK.md`.


---

## v48 — 4-bosqich / Smart Booking taklif va Telegram xabarlarini atomar tozalash (2026-11-19)

**Asos:** v47, 687 fayl. 5 yo‘nalish: taken/too-soon opening close, pending offer expiry, accepted grace expiry, stale/slot-taken client decisions, barber cancel/replay. Barchasida faqat `pending` Telegram offer xabarlari mavjud tranzaksiya ichida tozalanadi; `sent` / `uncertain` tegilmaydi, confirmed booking saqlanadi.

**QA:** tanlangan backend 47/47 PASS (9 yangi), full backend 387 PASS / 26 dependency FAIL; frontend 175/175 PASS; 185 qaror + 42 migratsiya offline PASS. Real PostgreSQL/Telegram/mobile E2E NOT_RUN; Vite `vite: not found`. **Production-ready emas.**

**Keyingi manba:** `USTARA-4-Bosqich-Offer-Notification-Cleanup-v48.zip` va `docs/USTARA_LATEST_CHECKPOINT.md`.


---

## v49 — 4-bosqich / Consent, ticket-date, Telegram callback, QR polling, real PG test (2026-11-19)

# USTARA v49 — 5 ta bajarilgan ish (2026-11-19)

**Asos:** USTARA v48; yangi loyiha ochilmadi. **4-bosqich — QR/Navbat/Smart Booking.**

1. **Oddiy navbatning roziligi (backend):** `decideByCustomer` sartarosh qulfini olgach `ownedEntry(...,{locked:true})` bilan navbat va rozilik yozuvlarini `FOR SHARE OF q,m` orqali qaror `COMMIT`igacha himoyalaydi. Rozilikni bekor qilish bilan poyga holatida eski qaror davom eta olmaydi.
2. **Bugungi navbat sharti (backend):** taklif `accept/reject/cancel` jarayonida `q.queue_date` PostgreSQL `Asia/Tashkent` sanasiga mos bo‘lishi kerak. Kechagi, lekin holati yangilanmagan `pending` taklif 410 va `pending` Telegram xabarlarni bekor qilish bilan qaytadi; haqiqatan tasdiqlangan bronni eski so‘rov bilan tekshirish idempotent qoladi. Eski bronlar o‘chirilmaydi.
3. **Telegram callback chegarasi (backend):** chat identifikatori PostgreSQL `BIGINT` diapazoniga sig‘masa DBga murojaat qilmasdan 400 qaytariladi.
4. **QR sahifa polling xavfsizligi (frontend):** bir vaqtning o‘zida kelgan status javoblaridan faqat eng yangisi, o‘sha QR receipt egasiga tegishlisi qabul qilinadi; komponent yechilganda eski so‘rov bekor hisoblanadi; QR yuborish oldingi poll javobini invalid qiladi.
5. **Haqiqiy PostgreSQL lock testi (QA):** alohida local `ustara_test_db` va maxsus `ustara_account_test` uchun ikki sessiyali rozilik qulfi testi qo‘shildi (`v49ConsentLock.postgres.integration.test.js`), runner 7 ta real PG testini zero-skip talab bilan tekshiradi. Bu muhitda test **SKIP**, real bazada **bajarilmagan**.

Yangi fayllar: backend unit testlari, staging guard testi, ikki sessiyali PG testi, v49 runner, frontend QR polling testi va qo‘llanma. Migratsiya **qo‘shilmadi**: 42 ta. 185 qaror CSV **o‘zgarmadi**.

## Haqiqiy test holati

- Backend tanlangan: **55/55 PASS**.
- Backend to‘liq: **395 PASS / 26 FAIL**. 26 tasi zarur `express`, `pg`, `bcrypt`, `jsonwebtoken` paketlari topilmagani sabab; **to‘liq PASS emas**.
- Frontend node:test: **178/178 PASS**. Vite production build **NOT_RUN (vite yo‘q)**.
- PG yangi test: **0 PASS / 1 SKIP**, oldingi real integratsiyalar ham **NOT_RUN**; staging unauthorized guard to‘g‘ri rad etdi.
- Haqiqiy Telegram API va mobil browser E2E: **NOT_RUN**.
- Offline audit: 185 qaror, 42 migratsiya **PASS**, CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.

**Production-ready EMAS.** Unit mock testlar real DB lock/e2e kafolati emas.


---

## v50 — QR sartarosh akkaunti + PostgreSQL vaqt authority (2026-11-19)

# USTARA v50 — 5 ta QR xavfsizligi vazifasi (2026-11-19)

**Asos:** v49 ZIP, 701 fayl. Yangi loyiha ochilmadi. Bu v50 4-bosqichdagi QR/Navbat uchun xavfsizlik patchi; oldingi 185 ta qaror hamda 42 migratsiya o'zgarmaydi.

1. **QR chiqarish — akkaunt egaligi:** `tokenCreate` profilning `barbers.user_id` qiymati sessiyadagi `req.user.id`ga mos kelishini, `users.role='barber'`, tasdiq va faollikni `FOR SHARE OF b,u` bilan tekshiradi. Keyin `pg_advisory_xact_lock` olinadi. Begona ID bilan token yaratilmaydi.
2. **QR pending ro'yxati:** `pendingList` shu tekshiruvni bitta PostgreSQL tranzaksiyasiga o'tkazadi; profil ID bo'yicha boshqa hisobning ro'yxati ochilmaydi. `Cache-Control:no-store` saqlandi.
3. **QR tasdiqlash/rad etish:** `decide` ham sartarosh akkauntini profil bilan bog'laydi va shaxsiyat qulfini navbat qulfidan avval oladi. Huquqsiz hisob audit yoki queue entry yaratmaydi.
4. **QR token/so'rov replay muddati:** `requestJoin` tokenning haqiqiy muddatini va avval yuborilgan pending so'rovning 30 daqiqa davrini PostgreSQL `clock_timestamp()` bilan tekshiradi — Node server soati qaror chiqarmaydi.
5. **QR status va tasdiqlash muddati:** `requestStatus` pending validity va `decide` 30 daqiqalik confirmation oynasini PostgreSQL vaqtiga ko'chiradi. Eskirgan tasdiq 410 qaytaradi.

**QA dalili:** 5 yangi test PASS; tegishli 29 backend unit test PASS; eski walkinQr testidan 15 PASS (1 route-test express dependency sabab bloklandi). Frontend 178/178 PASS. To'liq backend 400 PASS / 26 FAIL (yetishmayotgan `express`, `pg`, `bcrypt`, `jsonwebtoken`; bularni PASS hisoblamang). `audit-phase1` 185/42 PASS, `v45-decision-integrity` CSV hash unchanged PASS. Real PostgreSQL, Telegram, mobile E2E va Vite build **NOT_RUN**. **Production-ready emas.**

**Cheklov:** Mock testlar PostgreSQL'dagi haqiqiy lock/vaqt holatlarini to'liq isbotlamaydi. Ajratilgan staging DB'da v49 ikki-sessiyali testlari va v50 QR E2E, keyin mobil brauzer hamda Telegramni real muhitda tekshirish kerak.



---

## v51 — QR lock expiry va Telegram consent epoch (2026-11-19)

# USTARA v51 — 5 ta ish hisoboti

**Boshlanish:** v50 ZIP, 705 fayl. 4-bosqich — QR / navbat / Telegram. 2026-11-19.

| № | Aniq o'zgarish | Dalil / kutilgan xatti-harakat |
|---|---|---|
| 1 | Token expiry advisory-lockdan keyin DB soatida qayta tekshiriladi | Qulf kutishida muddati tugagan token 410; QR join INSERT yo'q. `v51/1` PASS |
| 2 | QR approve/reject oxirgi yozuvda 30m shartini tekshiradi | `UPDATE ... RETURNING` 0 bo'lsa 410 va yaratilgan queue/eventlar ROLLBACK. `v51/2` PASS |
| 3 | Kechagi waiting/called QR statusi jonli bo'lib chiqmaydi | `queue_status:null`, position/ETA va Telegram flaglari yashiriladi. `v51/3` PASS |
| 4 | Telegram offer consent idempotent vaqt | Qayta `true` timestampni o'zgartirmaydi, `false` keyin `true` yangi davr. `v51/4` PASS |
| 5 | Allowlist staging muhitida ham ishlatiladi | `CORS_ALLOWED_ORIGINS` sozlansa begona HTTPS QR origin 403, production allowlist bo'lmasa 403. `v51/5` PASS |

**Regressiya:** selected backend 26/26; frontend 178/178; full backend 405 PASS / 26 dependency FAIL. Real DB, Telegram va mobil E2E bajarilmadi. 42 migratsiya, 185 asl qaror o'zgarmadi. Bu release hujjati emas.

**QA/to‘siqlar:** selected 26/26, frontend 178/178; full backend 405 PASS/26 missing-dependency FAIL; live PostgreSQL, Telegram, mobil E2E va Vite build hali o‘tmagan. CSV 185 qaror SHA-256 o‘zgarmagan, 42 migratsiya saqlangan.

---

# USTARA v52 — yakuniy yozuv chegaralarini himoyalash (2026-11-19)

**Asos:** v51 ZIP (711 ta fayl), loyiha yangidan ochilmadi. 4-bosqich: QR / navbat / Smart Booking.

## 5 ta ish

1. **QR so‘rovni INSERT qilishdagi muddat:** `INSERT ... SELECT ... FROM walkin_qr_tokens WHERE expires_at>clock_timestamp() AND used_at IS NULL`. Token muddatining oxirgi payti SQL yozuvida ham tekshiriladi. `RETURNING` 0 bo‘lsa `410` va `ROLLBACK`.
2. **QR token bir marta ishlatilishi:** `UPDATE walkin_qr_tokens ... WHERE used_at IS NULL RETURNING id`. 1 ta qator o‘zgarmasa so‘rov/audit yozuvlari commit bo‘lmaydi (`409`/`ROLLBACK`).
3. **Smart Booking qarorining oxirgi SQL chegarasi:** `pending` taklif `accept/reject/cancel` bo‘lishidan oldin expiry, 5 daqiqalik kelajakdagi slot, waiting status va bugungi queue sanasi `UPDATE ... RETURNING` ichida tekshiriladi. Tekshiruv o‘tmasa taklif `expired`, yuborilmagan Telegram xabarlari `cancelled` va keyingi taklif uchun opening qayta ko‘riladi.
4. **Haqiqiy bronni yakuniy INSERT chegarasi:** 2 daqiqalik tasdiqlash muddati, 5 daqiqalik slot, active accepted offer va bugungi waiting navbat `INSERT INTO bookings ... SELECT ... WHERE` ichida ham tekshiriladi. 0 qator bo‘lsa `410`, bron yaratilmaydi.
5. **Navbat statusini atomar tugatish:** bron yaratilgach `UPDATE walkin_queue ... WHERE status='waiting' RETURNING id` 1 ta qator o‘zgartirishi majburiy; aks holda butun bron, snapshot va confirmation tranzaksiyasi `ROLLBACK`.

**Yangi:** `backend/test/v52FinalWriteFences.unit.test.js` (6 ta mock-test, 6/6 PASS), `npm run test:v52:unit`, bu runbook. Eski v51 test fixturelari yangi SQL `RETURNING` natijalariga moslashtirildi; xavfsizlik tekshiruvlari yengillashtirilmadi. **Yangi SQL migratsiya yo‘q** (42 ta mavjud).

## Haqiqiy tekshiruv (bu sessiya)
- Backend `node --test test/*.unit.test.js`: **411 PASS / 26 FAIL**, jami 437 test. 26 tasi `express`, `pg`, `bcrypt`, `jsonwebtoken` yetishmasligidan. **To‘liq PASS emas**.
- Frontend `node --test test/*.test.js`: **178/178 PASS**.
- `v52FinalWriteFences.unit.test.js`: **6/6 PASS**; oldingi tegishli 61/61 test ham PASS.
- `v45-decision-integrity.js`: **185 qaror, SHA-256 bir xil, PASS**. `audit-phase1.js`: **42 forward migratsiya tartibi PASS**. `decision-coverage.js`: 130 tekshiruvda, 47 qisman, 7 bekor/keyinga, #175 aniqlanmagan.
- **Real PostgreSQL parallel/expiry testlari, Telegram API, mobil brauzer E2E va Vite build BLOCKED (`vite: not found`)** (pg server, `pg`, vite va boshqa deps yo‘q). Unit testlar haqiqiy DB tranzaksiyasini isbotlamaydi.

**Release status:** production-ready EMAS. Maxsus test bazasida cheklarni real muddat kesishida sinab, barcha dependency va build testlarini o‘tkazmasdan deploy qilmang. `185` ro‘yxatni to‘liq amalga oshirilgan deb talqin qilmang.

---

# USTARA v52 — yakuniy yozuv chegaralarini himoyalash (2026-11-19)

**Asos:** v51 ZIP (711 ta fayl), loyiha yangidan ochilmadi. 4-bosqich: QR / navbat / Smart Booking.

## 5 ta ish

1. **QR so‘rovni INSERT qilishdagi muddat:** `INSERT ... SELECT ... FROM walkin_qr_tokens WHERE expires_at>clock_timestamp() AND used_at IS NULL`. Token muddatining oxirgi payti SQL yozuvida ham tekshiriladi. `RETURNING` 0 bo‘lsa `410` va `ROLLBACK`.
2. **QR token bir marta ishlatilishi:** `UPDATE walkin_qr_tokens ... WHERE used_at IS NULL RETURNING id`. 1 ta qator o‘zgarmasa so‘rov/audit yozuvlari commit bo‘lmaydi (`409`/`ROLLBACK`).
3. **Smart Booking qarorining oxirgi SQL chegarasi:** `pending` taklif `accept/reject/cancel` bo‘lishidan oldin expiry, 5 daqiqalik kelajakdagi slot, waiting status va bugungi queue sanasi `UPDATE ... RETURNING` ichida tekshiriladi. Tekshiruv o‘tmasa taklif `expired`, yuborilmagan Telegram xabarlari `cancelled` va keyingi taklif uchun opening qayta ko‘riladi.
4. **Haqiqiy bronni yakuniy INSERT chegarasi:** 2 daqiqalik tasdiqlash muddati, 5 daqiqalik slot, active accepted offer va bugungi waiting navbat `INSERT INTO bookings ... SELECT ... WHERE` ichida ham tekshiriladi. 0 qator bo‘lsa `410`, bron yaratilmaydi.
5. **Navbat statusini atomar tugatish:** bron yaratilgach `UPDATE walkin_queue ... WHERE status='waiting' RETURNING id` 1 ta qator o‘zgartirishi majburiy; aks holda butun bron, snapshot va confirmation tranzaksiyasi `ROLLBACK`.

**Yangi:** `backend/test/v52FinalWriteFences.unit.test.js` (6 ta mock-test, 6/6 PASS), `npm run test:v52:unit`, bu runbook. Eski v51 test fixturelari yangi SQL `RETURNING` natijalariga moslashtirildi; xavfsizlik tekshiruvlari yengillashtirilmadi. **Yangi SQL migratsiya yo‘q** (42 ta mavjud).

## Haqiqiy tekshiruv (bu sessiya)
- Backend `node --test test/*.unit.test.js`: **411 PASS / 26 FAIL**, jami 437 test. 26 tasi `express`, `pg`, `bcrypt`, `jsonwebtoken` yetishmasligidan. **To‘liq PASS emas**.
- Frontend `node --test test/*.test.js`: **178/178 PASS**.
- `v52FinalWriteFences.unit.test.js`: **6/6 PASS**; oldingi tegishli 61/61 test ham PASS.
- `v45-decision-integrity.js`: **185 qaror, SHA-256 bir xil, PASS**. `audit-phase1.js`: **42 forward migratsiya tartibi PASS**. `decision-coverage.js`: 130 tekshiruvda, 47 qisman, 7 bekor/keyinga, #175 aniqlanmagan.
- **Real PostgreSQL parallel/expiry testlari, Telegram API, mobil brauzer E2E va Vite build BLOCKED (`vite: not found`)** (pg server, `pg`, vite va boshqa deps yo‘q). Unit testlar haqiqiy DB tranzaksiyasini isbotlamaydi.

**Release status:** production-ready EMAS. Maxsus test bazasida cheklarni real muddat kesishida sinab, barcha dependency va build testlarini o‘tkazmasdan deploy qilmang. `185` ro‘yxatni to‘liq amalga oshirilgan deb talqin qilmang.

---

# USTARA v53 — QR va taklifning so‘nggi yozuv chegaralari (2026-11-19)

**Asos:** v52 ZIP (717 ta fayl); loyiha qayta qurilmadi. 4-bosqich; **production-ready EMAS**.

## Bajarilgan 5 ta ish

1. **QR tokenni yakuniy iste’mol qilish:** so‘rov `INSERT`idan keyingi `UPDATE walkin_qr_tokens` ham `expires_at>clock_timestamp()` shartini tekshiradi. Chegara vaqtida tugasa butun tranzaksiya `ROLLBACK`, javob `410 qr_expired`; boshqa token nizosi `409 qr_used`.
2. **QR tasdiqlashning oxirgi chegarasi:** sartarosh tasdiqlashi (`approve`) paytida ish vaqti yopilsa, `UPDATE walkin_qr_requests ... RETURNING` yana jadvalni SQL ichida tekshiradi. Oldingi `walkin_queue` yozuvi ham rollback; rad etish (`reject`) ish vaqtiga bog‘lanmaydi.
3. **Smart Booking taklif yaratish:** worker nomzodni qidirayotganda slotning 5 daqiqalik chegarasi tugab qolsa, oxirgi `INSERT ... SELECT` `0 row` bo‘ladi, yangi taklif/Telegram outbox yaratilmaydi va opening yopiladi. SQL bugungi navbatni va `waiting` holatini ham tekshiradi.
4. **2 daqiqalik muddatni rejalashtirish:** taklif qabul qilingan vaqtdagi `smart_booking_offers.decided_at` asosida PostgreSQL `next_check_at=decided_at+interval '2 minutes'` hisoblaydi; oldinroq o‘qilgan JS vaqtiga tayanmaydi. Rad etish/cancel uchun DB `clock_timestamp()` ishlatiladi.
5. **Haqiqiy PG xavfsiz test tayyorgarligi:** `v53QrFinalBoundaries.postgres.integration.test.js` QR tokenning oxirgi yozuvda eskirishi hamda QR tasdiqlash davomida ish vaqti yopilishi va `ROLLBACK` uchun maxsus ephemerаl schema yaratadi; `v53-staging.js` eski 7 qat’iy SQL suite va yangi 8-suite’ni faqat aniq test opt-in bilan yuritadi. **Real PostgreSQL bu muhitda yo‘q: test `SKIP`, PASS emas.**

## Tekshiruv natijasi

- `npm run test:v53:unit`: **77/77 PASS** (v53 yangi 10 ta unit test, oldingi muhim testlar bilan).
- `node --test test/*.unit.test.js`: **421 PASS / 26 FAIL**; yiqilganlari oldingi `express`, `pg`, `bcrypt`, `jsonwebtoken` va ularga bog‘liq npm modullari mavjud emasligi bilan bog‘liq. Full PASS emas.
- `frontend: node --test test/*.test.js`: **178/178 PASS**.
- `node --test test/v53QrFinalBoundaries.postgres.integration.test.js`: **0 PASS / 1 SKIP** (real database mavjud emas).
- `npm run test:v53:staging`: opt-in yo‘qligi sabab to‘g‘ri **BLOCKED**; PostgreSQL, Telegram, mobil E2E **NOT_RUN**; Vite build **FAIL: vite not found**.
- 185 qaror CSV **SHA256 o‘zgarmagan**; 42 forward migratsiya offline audit **PASS**; yangi migratsiya yo‘q.

**Cheklov:** unit-test SQL ifodasi va rollback mock’ini tekshiradi, real PostgreSQL atomarligini isbotlamaydi. 185 qarorning barcha funksiyalari tayyor degani emas.



---

## v54 — QR yakuniy ish vaqti va worker due qulf xavfsizligi

# USTARA v54 — QR ish vaqti, akkaunt va worker poygasi (2026-11-19)

**Asos:** v53 ZIP, 725 fayl. Bu v54 versiya USTARA 4-bosqichga qo‘shimcha xavfsizlik choralari; **production-ready EMAS**.

## Bajarilgan 5 ta ish

1. **QR akkaunt himoyasi:** QR bilan navbatga kirishda sartarosh profili va `users` yozuvi `FOR SHARE OF b,u` bilan tekshiriladi. Akkaunt o‘chirilayotgan paytda so‘rov uzilgan huquq bilan davom etmaydi. Qulf sartarosh advisory lock’idan oldin olinadi.
2. **QR oxirgi SQL vaqt chegarasi:** `UPDATE walkin_qr_tokens SET used_at` endi QR muddati bilan birga `ustara_effective_day_schedule` orqali **shu ondagi ish vaqtini** tekshiradi. Ish vaqti yopilgan bo‘lsa, `409 barber_closed` va `ROLLBACK`; QR eskirsa `410 qr_expired`.
3. **Smart Booking worker takroriy ishga tushishi:** worker dastlab muddati kelgan opening’ni o‘qigandan so‘ng advisory qulf kutib qolishi mumkin. Qulf olingach `AND clock_timestamp()>=next_check_at FOR UPDATE` qayta tekshiradi. Boshqa worker muddatni surgan bo‘lsa `raced`, muddatidan oldin taklif yo‘q.
4. **Haqiqiy PostgreSQL concurrency sinovi:** `v54QrShopWorker.postgres.integration.test.js` test uchun alohida schema yaratadi. Birinchi ssenariyda QR kiritilgandan keyin ish vaqti yopiladi va rollback tekshiriladi; ikkinchisida **ikki DB ulanishi**, advisory lock kutishi va `next_check_at` poygasi haqiqiy PostgreSQL’da tekshirilishi uchun yozilgan. Bu muhitda test `SKIP`.
5. **Qat’iy staging runner va regressiya:** `v54-staging.js` mavjud 8 suite ustiga 9-suite qo‘shadi; oldingi ruxsatlar ham kerak va har qanday `SKIP`/`FAIL` muvaffaqiyat deb olinmaydi. Yangi 8 ta unit test ham qo‘shildi; eski v50/v52 mock’lari haqiqiy SQL javoblariga moslashtirildi.

## QA — qayd qilingan natijalar

- Backend `npm run test:v54:unit`: **63 PASS / 0 FAIL**.
- Backend `node --test test/*.unit.test.js`: **429 PASS / 26 FAIL** (yetishmagan `express`, `pg`, `bcrypt`, `jsonwebtoken` va ularga bog‘liq kutubxonalar). **To‘liq backend PASS emas**.
- Frontend `node --test test/*.test.js`: **178 PASS / 0 FAIL**.
- Yangi haqiqiy PG suite: **0 PASS / 1 SKIP** (PostgreSQL server/driver yo‘q).
- Npm offline: `ENOTCACHED` (`xtend-4.0.2.tgz`); frontend build `vite: not found`.
- Staging ruxsatsiz ishga tushirish: **BLOCKED**, to‘g‘ri xavfsizlik natijasi.
- 185 qaror CSV SHA256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, byte-for-byte o‘zgarmagan. **42 forward migratsiya** offline PASS, real DB migratsiya sinovi yo‘q.
- Real Telegram API, mobil E2E: **NOT_RUN**.

**Izoh:** testlar PostgreSQL’ning real ishlashini isbotlamaydi, toki 9 ta staging suite izolyatsiyalangan real baza bilan PASS bo‘lmaguncha.


---

## v55 — izolyatsiyalangan CI PostgreSQL + dalil gate

# USTARA v55 — izolyatsiyalangan PostgreSQL CI va ishonchli release evidensiyasi

**Manba:** v54 ZIP (732 ta fayl). **Natija:** v55, 4-bosqich. **Production-ready EMAS.**

## Bajarilgan 5 ta ish

1. **Izolyatsiyalangan PostgreSQL sinov muhiti:** `.github/workflows/v55-verify.yml` faqat GitHub Actions'da bir martalik `postgres:18` service yaratadi, `ustara_test_db` va superuser bo‘lmagan `ustara_account_test` foydalanuvchisini tayyorlaydi. `btree_gist` sharti va 42 forward migratsiyali `bootstrap.sql` alohida konteynerdagi Unix socket orqali bajariladi. **Bu yerda ishga tushirilmagan — CI sozlangan, uning real natijasi hali yo‘q.**
2. **Backend+frontend haqiqiy npm muhitida QA:** CI lock fayllardan ikkala tomonda `npm ci`, to‘liq Node unit-testlar, `v54-staging.js` dagi **9 ta real PostgreSQL suite**, frontend unit-testlar va Vite production build'ni ketma-ket bajaradi. Biror buyruq muvaffaqiyatsiz bo‘lsa (`set -euo pipefail`), job to‘xtaydi; testlar `SKIP` bo‘lsa staging yashil emas.
3. **Haqiqiy TAP protokol tekshiruvi:** `backend/scripts/v40-staging.js` raqamlardan tashqari yagona TAP header, `1..N` reja va tartibli `ok` qatorlarini talab qiladi. Faqat yasama `# pass N` qatorlarini haqiqiy test deb qabul qilmaydi. v41/v43/v44/v45 oldingi mocklar moslashtirildi.
4. **Deterministik QR vaqt sinovi:** `v53QrFinalBoundaries.postgres.integration.test.js` vaqtdan qat’i nazar qayta ishlashi uchun `pg_sleep` o‘rniga testning o‘z izolyatsiyalangan tranzaksiyasi ichida QR muddati nazoratli eskirtiriladi. Dastlab token 10 daqiqaga yaroqli, keyin so‘nggi `UPDATE` oldidan bekor qilinadi. Tasodifiy kechikishga bog‘liqlik kamayadi; **haqiqiy PG bilan bu test hali ishlatilmagan**.
5. **Qat’iy release dalil tekshiruvi:** `v55-release-gate.js` haqiqiy backend/frontend TAP loglarini, **9 ta alohida PostgreSQL suite** natijasini, dist'dagi real JS assetini, **185 qaror** hashini va **42 migratsiyani** birgalikda talab qiladi. Ma’lumot yo‘q, xato yoki `SKIP` bo‘lsa `NOT PASS`. Hatto CI PASS bo‘lsa ham alohida Telegram live va mobil E2E bajarilmaguncha **productionReady=false**.

## Muhitdagi haqiqiy QA

- `npm run test:v55:unit`: **29 PASS / 0 FAIL**.
- `node --test test/*.unit.test.js` backend: **434 PASS / 26 FAIL**. 26 tasi `jsonwebtoken` (9), `express` (8), `bcrypt` (6), `pg` (3) paketlari yo‘qligi bilan bog‘liq.
- `node --test test/*.test.js` frontend: **178/178 PASS**.
- `node --test test/v54QrShopWorker.postgres.integration.test.js`: **1 SKIP**, real PG yo‘q; `v54-staging.js` opt-in bo‘lmaganda to‘g‘ri rad etiladi.
- `npm ci --offline`: **ENOTCACHED** (`xtend`); `npm run build`: **FAIL (`vite: not found`)**.
- 185 qaror CSV hash o‘zgarmagan; 42 forward migratsiya offline PASS; **CI hali bu suhbatda ishga tushirilmagan**.
- Telegram real sandbox va mobil brauzer E2E: **NOT_RUN**.

**Muhim:** GitHub Actions'ga kod joylashtirib, workflow ishga tushirib, PASS natijasini ko‘rmaguncha v55 izolyatsiyalangan PG testlari tasdiqlangan hisoblanmaydi.


---

## v56 — tasdiqlangan CI ga bog‘langan Pages deploy (2026-11-19)

# USTARA v56 — tekshirilgan commit uchun Pages deploy zanjiri

**Manba:** v55 ZIP (739 fayl). **Natija:** v56, 4-bosqich. **Production-ready EMAS**.

## 5 bajarilgan ish

1. **Deploy-ni CI'ga bog'lash.** `.github/workflows/deploy-pages.yml` dagi bevosita `push` va `workflow_dispatch` deploy triggerlari olib tashlandi; endi faqat `USTARA v55 isolated verification` workflow'ining `workflow_run.completed` hodisasi ishlaydi. `success`, `push`, `main`, aynan shu repository bo'lishi shart.
2. **Aynan tekshirilgan commit va eski natijani to'sish.** Frontend qurilishi oldidan va deploy boshlanishidan oldin GitHub API orqali `main`'ning yangi SHA qiymati tekshiriladi; `actions/checkout` har ikkala job'da oldin CI tekshirgan `workflow_run.head_sha`'ni yuklaydi. Vaqti o'tgan run yangi sahifani bosib ketmasligi uchun concurrency ham SHA bo'yicha ajratildi. Baribir tashqi holat o'zgarishi bilan bog'liq juda qisqa poyga oynasi qolishi mumkin; GitHub branch protection / environment approvals ham tavsiya qilinadi.
3. **Maxfiy ma'lumot chiqarmaydigan CI diagnostikasi.** `v56-ci-summary.js` faqat aniq statuslar va sanash natijalarini JSON tarzida beradi; xato bo'lsa `NOT_VERIFIED`. CI har safar shunday xulosa faylini artifact sifatida saqlaydi; to'liq TAP loglari, DB URL va tokenlar artifactga yuklanmaydi.
4. **9 ta PostgreSQL test to'plami natijasini qat'iy tekshirish.** Release gate to'qqizta natijani aynan rejalashtirilgan tartibda talab qiladi; yagona yakuniy marker oxirida turishi kerak. Takroriy va eski/yopishtirilgan marker `NOT PASS`.
5. **v56 regressiya va checkpoint.** Yangi `v56ReleaseChain.unit.test.js` 7 ta vaziyatni tekshiradi; loyiha ichidagi oxirgi checkpoint va progress v56 gacha yangilandi, v54–v55 bosqichlari ham ichki jurnalga qaytarildi. 185 qaror CSV hash va 42 forward migratsiya o'zgarmagan.

## Haqiqiy sinov natijalari (2026-11-19)

- `npm run test:v56:unit`: **19 PASS / 0 FAIL** (v56 yangi 6 ta, boshqa qayta tekshirilgan unit testlar bilan).
- Backend `node --test test/*.unit.test.js`: **441 PASS / 26 FAIL** (466 jami). Yetishmayotgan paketlar: `jsonwebtoken` (9), `express` (8), `bcrypt` (6), `pg` (3). **To'liq PASS emas.**
- Frontend `node --test test/*.test.js`: **178/178 PASS**.
- YAML tuzilishi offline parser bilan tekshirildi: `v55-verify` push/PR/manual trigger, `deploy-pages` faqat `workflow_run` trigger.
- PostgreSQL testi **1 SKIP**; staging opt-in yo'q paytda **bloklandi** (kutilgan natija).
- `npm ci --offline` backend/frontend **ENOTCACHED**, `npm run build` **FAIL: vite not found**.
- GitHub Actions real run **NOT_RUN**: kodni GitHub'ga yuborish va GH workflow natijasini olish imkoni hali tasdiqlanmagan.
- Telegram test boti va mobil brauzer E2E **NOT_RUN**.
- Offline audit **185 ta qaror / 42 forward migratsiya PASS**; CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.

**Muhim:** release-gate `PASS` bo'lsa ham Telegram live, mobil E2E va barcha qarorlarning haqiqiy implementatsiyasi tekshirilmasdan production-ready bo'lmaydi. GitHub Pages faqat frontend statik sayti; backend alohida serverda sinovdan o'tishi shart.

## v57 — GitHub Pages release proof, API HTTPS va deploy tartibi (2026-11-19)

1. Pages deploy turli commitlar orasida `ustara-pages-main` concurrency bilan serialize qilinadi. `cancel-in-progress: false` — kechikkan eski event yangi deployni bekor qilmaydi. SHA boshida va deploydan oldin qayta tekshiriladi; o‘ta qisqa tashqi race oynasi mutlaq yo‘qolmaydi.
2. GitHub Pages va CI `vars.VITE_API_BASE_URL` orqali **bir xil production HTTPS API** sozlamasini tekshiradi. `localhost`, HTTP, raw IP, credentials, fragment/query, path va private hostname rad etiladi; noto‘g‘ri config build ni to‘xtatadi.
3. Upstream GitHub CI natijasi `sourceSha` va API URL ning SHA-256 qiymatini maxfiy URL ni chop qilmasdan hisobotga yozadi. Release gate GitHub checkout SHA ni tasdiqlaydi.
4. Pages faqat **aynan shu upstream run ID** dan redacted `ci-summary.json` artifactni olib, PASS/9 suite/commit/config hash va build dalillarini tekshiradi. Repo variable bir vaqtda o‘zgarsa, deploy bo‘lmaydi.
5. Build dalillariga `.env`, `.map`, symlink yoki nomaqbul fayl kirsa release gate rad etadi. `404.html` SPA fallback `index.html` bilan bir xil bo‘lishi tekshiriladi. 9 ta yangi v57 test bilan tekshirildi.

**Lokal natija:** `test:v57:unit` **21/21 PASS**; to‘liq backend **450 PASS / 26 FAIL** (npm dependency yo‘q); frontend **178/178 PASS**; 185 qaror/42 forward migratsiya offline PASS. Real GitHub CI, PostgreSQL, Telegram va mobil E2E **NOT_RUN/SKIP**. Production-ready **yo‘q**.

## v58 — CI qayta ishga tushirish dalillari va Pages buildni qayta tekshirish (2026-11-19)

1. GitHub Actions `upload-artifact@v4` uchun yagona `run_id` avvalgi `re-run`da takrorlanishi mumkinligi hisobga olindi: artifact nomi endi **run ID + attempt** bilan yaratiladi; Pages aynan shu urinishni oladi.
2. CI release gate (`v55-release-gate.js`) haqiqiy GitHub `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` butun musbat sonlarini validatsiya qiladi va tekshirilgan release.json daliliga qo‘shadi.
3. Maxfiy ma'lumotlardan tozalangan CI hisoboti oldingi urinishning `PASS` dalilini qabul qilmaydi; `sourceRunId`, `sourceRunAttempt`, `sourceSha`, `apiBaseSha256` mos bo‘lishi kerak.
4. Pages `verify-pages-evidence.mjs` ishida exact `workflow_run.id`, `workflow_run.run_attempt` va commit/config hash solishtiriladi; JSON o‘lchamiga ham limit bor.
5. CI va Pages bitta paket talab qilmaydigan build tree validator ishlatadi. Pages o‘z qayta qurilgan `dist` papkasini **artifact upload oldidan** tekshiradi: JS entry, SPA 404/index mosligi, `.env`, `.map`, symlink, `.npmrc` taqiqlari.

**Lokal:** v58 tanlangan backend **29/29 PASS**, to‘liq backend **458 PASS / 26 dependency FAIL**, frontend **178/178 PASS**, 185/42 offline audit PASS. Real GitHub Actions **NOT_RUN**, PG **SKIP**, Vite build **BLOCKED**, Telegram/mobil E2E **NOT_RUN**. Production-ready **EMAS**.

## v59 — real Chrome login E2E majburiy CI gate (2026-11-19)

1. Izolyatsiyalangan PostgreSQL service ichida bootstrapdan so‘ng `ustara_login_test` nomli alohida **non-superuser** test roli yaratiladi; u faqat vaqtinchalik `ustara_account_test` huquqini oladi. Hech qanday production akkaunti ishlatilmaydi.
2. CI `login.browser.e2e.test.js` ni `google-chrome` bilan, maxsus `NODE_ENV=test` va yozishga ongli ruxsat flaglari ostida ishga tushiradi. **390px mijoz, 1440px sartarosh, admin** login/limiter ssenariylari tekshiriladi. Browser test 9 ta PG suite va release gate orasida bajariladi.
3. `v55-release-gate.js` endi `browser.tap` mavjudligini, TAP o‘tganini, 3 ta brauzer ssenariysi haqiqiy `ok` natijasi borligini va **0 SKIP/FAIL** talab qiladi. `release.json` dagi `browserTests` ham dalil bilan birga yoziladi.
4. `v56-ci-summary.js` raw login yozuvlari, telefonlar yoki tokenlarni artifact’ga yozmasdan faqat sanitizatsiyalangan `browser: {status,tests}` chiqaradi; Pages evidence validator ham browser `PASS` bo‘lmasa deployni bloklaydi.
5. `v59BrowserGate.unit.test.js` 5 ta yangi fail-closed unit test qo‘shildi; avvalgi v55–v58 test mocklari yangi browser daliliga moslashtirildi. Oldingi 185 qaror / 42 forward migratsiya o‘zgarishsiz.

**Lokal natija:** tanlangan backend **34/34 PASS**, to‘liq backend **463 PASS / 26 dependency FAIL**, frontend **178/178 PASS**. Browser real E2E **1 SKIP**; PostgreSQL haqiqiy staging **NOT_RUN**, Vite build **BLOCKED** (`vite: not found`), GitHub Actions **NOT_RUN**, Telegram va mobil real E2E **NOT_RUN**. Production-ready **EMAS**.

## v60 — Chrome login E2E evidence va transport qat’iyligi (2026-11-19)

1. `validateBrowserTranscript()` browser TAP uchun **bitta parent** va aynan **3 tartibli nested test** (customer 390px, barber 1440px, admin), `1..3` plan, `tests=pass=4` talab qiladi. Soxta ortiqcha `ok`, boshqa label, boshqa plan yoki `SKIP/TODO/FAIL` qat’iy rad etiladi.
2. `v56-ci-summary.js` endi faqat JS assetni emas, haqiqiy `dist` publish tree’ni tekshiradi va uning fayl soni hamda JS asset sonini release gate dalili bilan solishtiradi; `.env`, `.map`, symlink bo‘lsa `NOT_VERIFIED`. Report foydalanuvchi telefon/tokenlarini ochmaydi.
3. GitHub Pages frontend evidence validator browser test sonini **aniq 4** talab qiladi (`>=4` emas). Qo‘shimcha noma'lum test bilan e’lon qilish bloklanadi.
4. Chrome DevTools websocket manzili faqat `ws://127.0.0.1:<o‘z porti>/devtools/page/...` bo‘lishi kerak; boshqa host, boshqa port, credentials, browser endpoint yoki query rad etiladi. CDP transportda `send()` bounded timeout va browser crash/connection close’da pending promises reject.
5. Chrome E2E browser start/target olish 5s timeout bilan fail-fast; 6 ta yangi `v60ChromeProof.unit.test.js` regressiya testi, v56–v59 mocklar yangi dalil qoidalariga moslashtirildi. 185 qaror va 42 forward migratsiya o‘zgarmadi.

**Lokal sinov:** tanlangan backend **40/40 PASS**; to‘liq backend **469 PASS / 26 dependency FAIL**; frontend **178/178 PASS**; real Chrome/PG login **1 SKIP**; Vite `vite: not found`; PostgreSQL/Actions/Telegram live **NOT_RUN**. **Production-ready EMAS**.


## v61 / 4-bosqich — Chrome E2E lifecycle, TAP va Pages release integrity (2026-11-19)

Asos: v60 ZIP; Chrome signal cleanup va local listener, 3 xil browser executable allowlist, nested TAP fail/skip nazorati, Pages maxfiy fayl va hajm nazorati, GitHub CI Chrome fallback; 10 ta yangi unit test. **53 selected backend PASS, full backend 479 PASS/26 dependency FAIL, frontend 178 PASS**, Chrome E2E 1 SKIP, PG/GitHub NOT_RUN. 185 qaror SHA-256 o‘zgarmagan, 42 migratsiya saqlandi. Production-ready emas. Asos: USTARA-4-Bosqich-Chrome-CI-Release-Safety-v61.zip.


## v62 / 4-bosqich — Verified CI build artifact, Pages qayta rebuild qilmaydi (2026-11-19)

V61 ZIP asosida CI bir marta Vite build yaratadi va SPA fallback’ni tekshiradi. `sha256PublishTree()` filename + bytes bo‘yicha deterministik SHA-256 iz hosil qiladi. CI gate `publishTreeSha256`ni release daliliga qo‘shadi, redacted summary aynan shu hashni talab qiladi. CI faqat testlar PASS bo‘lsa run ID+attempt bilan tayyor build artifactini yuklaydi. Pages xuddi shu artifactni yuklab olib, commit/run/attempt/production API/SPA/sha256 tekshiruvlari bilan deploy qiladi, `npm ci` va ikkinchi Vite build yo‘q. 8 ta yangi unit, **58/58 selected backend PASS; full backend 487 PASS / 26 dependency FAIL; frontend 178/178 PASS**. 185 qaror SHA-256 va 42 forward migratsiya o‘zgarmagan. GitHub/PG/Chrome live real run hali **NOT_RUN/SKIP**. Production-ready emas.


## v63 / 4-bosqich — Production dist Chrome smoke release gate (2026-11-19)

V62 ZIP asosida izolyatsiyalangan loopback `frontend/dist` statik server, real Chrome production build smoke (390px mobile login, 1440px admin login, forgot-password SPA fallback), `published-browser.tap` release/Pages proof nazorati, 6 ta yangi unit va eski v55–v62 mock mosligi. **64/64 selected PASS**, full backend **493 PASS / 26 dependency FAIL**, frontend **178/178 PASS**. 185 qaror SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` va 42 forward migratsiya o‘zgarmagan. GitHub CI/PG/real Vite production Chrome smoke hali NOT_RUN/NOT_VERIFIED, production-ready emas. Asos: `USTARA-4-Bosqich-Published-Chrome-Gate-v63.zip`.


## v64 / 4-bosqich — Pages HTML asset / Chrome route integrity (2026-11-19)

v63 ZIPdan JS/CSS/modulepreload/icon/image HTML resurslarini mahalliy `dist` ichida tekshirish, zararli/missing URLni rad etish, production Chrome smoke'da aniq SPA pathname, navigation retry va runtime exception'ni fail qilish qo‘shildi. 9 yangi test; **73/73 selected backend PASS**, full **502 PASS / 26 dependency FAIL**, frontend **178/178 PASS**. 185 qaror SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, 42 migratsiya o‘zgarmagan. Real GitHub/PG/production Chrome CI NOT_RUN; production-ready emas. ZIP: `USTARA-4-Bosqich-Pages-Asset-Route-Integrity-v64.zip`.


## v65 / 4-bosqich — Transitive CSS, HTML srcset va Chrome asset integrity (2026-11-19)

v64 ZIP asosida HTML CSS`@import`/`url()` lokal fayllari, `srcset`/manifest, Chrome CDP local asset 404/network failure, static server MIME/HTTP tekshiruvlari kiritildi. 14 yangi unit test. **87/87 selected backend PASS**, full **516 PASS/26 missing dependency FAIL**, frontend **178/178 PASS**. 185 CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, 42 forward migratsiya o‘zgarmadi. GitHub Actions/real PG/production Chrome E2E NOT_RUN/BLOCKED; production-ready emas. ZIP: `USTARA-4-Bosqich-Transitive-Asset-Chrome-v65.zip`.


## v66 / 4-bosqich — CI/DB readiness + JS chunk / manifest integrity (2026-11-19)

v65 ZIP asosida lazy JS chunk va PWA manifest resurslarini offline tekshiruvchi modullar, mahalliy test-baza va HTTPS API uchun xavfsiz CI preflight, 42 migratsiyali read-only DB readiness hamda workflow guardlari qo‘shildi. **12 yangi test**, tanlangan **99/99 backend PASS**, to‘liq **528 PASS/26 missing npm modules FAIL**, frontend **178/178 PASS**. 185 CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, 42 forward migratsiya saqlangan. Real PG/CI/Chrome E2E hali NOT_RUN/SKIP; production-ready emas. ZIP `USTARA-4-Bosqich-CI-DB-Bundle-Readiness-v66.zip`.


# USTARA v68 — #138 Akkauntdan chiqish xavfsizligi

Asos: v67 (807 fayl). Asosiy yo‘nalish: 185 qaror ichidagi #138 (akkauntlar o‘rtasida chiqish/kirish).

## Bajarilgan besh ish
1. Logout localStorage signali orqali bir origin'dagi boshqa ochiq tablarda sessiyani bekor qiladi; token signalga qo‘shilmaydi.
2. Logout paytida backend sessiyasi bilan birga eski local account metadata ham tozalanadi.
3. Eskirgan yoki mos kelmagan JWT/session juftligi aniqlanganda tabdagi credential va sessiya qiymatlari o‘chiriladi.
4. Storage cheklanganida logout boshqa kalitlarni tozalashni davom ettiradi; boshqa tabdagi logout qayta tarqatilmaydi.
5. 5 ta yangi regression test qo‘shildi va barcha frontend testlari qayta ishga tushirildi.

## Sinov va yaxlitlik
- frontend `node --test test/*.test.js`: **183/183 PASS** (shu jumladan v68: 5/5).
- `node --check` session.js: PASS.
- 185 qaror CSV hash: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — oldingi v67 bilan bir xil.
- 42 forward SQL va 2 rollback SQL o‘zgarmagan; jami 45 fayl checksum solishtirildi (CSV+SQL).
- Backend, haqiqiy PostgreSQL, Chrome, GitHub Actions, Telegram, real ko‘p-tabli browser E2E: **NOT_RUN**.

## Qolganlar
- #138 qat'iy to‘liq deb belgilangan emas: cross-device login/logout, server-side sessiya revoke va mobil E2E tasdiqlanishi kerak.
- 185 qaror dastlabki ro‘yxati va ularning statuslari o‘zgartirilmadi.
- Production-ready EMAS.
- Keyingi bosqich v69: #77 / #137 signup-role onboarding yoki #134 Privacy Center dastlabki funksional tekshiruvi, mavjud kodga mos implementatsiya va test.


# USTARA v69 — registration/onboarding integriteti

Asos: v68 arxivi. 185 qarorlar va avvalgi SQL migratsiyalariga tegilmadi.

## Besh yaxshilanish
1. Pending registration holati yagona qat'iy validator bilan tekshiriladi (rol, telefon, specialty, OTP, deadline).
2. Cross-tab yuborilgan noto'g'ri va eskirgan registration snapshotlari rad etiladi; boshqa token joriy in-flight registratsiyani almashtirmaydi.
3. OTP resend/verify faqat OTP bosqichida ishlaydi; kechikkan javob verified bosqichini orqaga qaytarmaydi.
4. Ism va familiya Unicode whitespace va NFC bilan normallashtirilib yuboriladi; noto'g'ri input xatosiz qaytariladi.
5. Registration va OTP error qiymatlari null yoki noto'g'ri turda bo'lsa UI buzilmaydi; 6 ta yangi test qo'shildi.

## Sinovlar
- Frontend: 189/189 PASS, v69 6/6 PASS.
- Registration flow eski testlar: 16/16 PASS.
- Original CSV SHA-256: bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71
- SQL migratsiyalar: v68 bilan byte-for-byte bir xil.
- Haqiqiy backend, PostgreSQL, Chrome va Telegram integratsiya testlari: NOT_RUN.
- Production-ready: YO'Q.

## Cheklov
Bu sinovlar real browser cross-tab transportini tasdiqlamaydi. Server-side role authorization va haqiqiy foydalanuvchi onboarding E2E tekshiruvi keyingi bosqichlarda bajarilishi kerak.

## v70 — profil va onboarding xavfsizligi (2026-11-19)

Manba: v69 arxiv. `profileIdentity.js` umumiy normalizatsiya/validatsiyasi; formda profil ismlarini kanonik yuborish; `hasProfileName` bir xil siyosatda; ekrandagi ko‘rinuvchi ism Unicode normalizatsiyasi; `registration.js` cross-tab eski OTP, muddati va cooldown holatlaridan himoya. 12 yaxshilanish va 16 ta yangi test. Frontend 205/205 PASS, 185 ta qaror checksum bir xil, 42 SQL migratsiya offline PASS; haqiqiy browser/DB/Telegram NOT_RUN.


## v71 (2026-11-19) — registration cross-tab snapshot safety
- Telefon, rol, mutaxassislik va muddatlar regressiyasini rad etish.
- 20 ta yangi test, frontend 225/225 PASS.
- 185 qaror va 42 migratsiya saqlangan; real integratsiya NOT_RUN.

## v74 — xizmat katalogi va narx yaxlitligi

1. Public xizmatlar katalogida ID faqat canonical musbat INTEGER bo‘lishi.
2. PostgreSQL INT32 oralig‘idan tashqari ID lar rad etilishi.
3. `1e3`, `01`, `+1`, bo‘shliqli va kasrli ID lar rad etilishi.
4. Sartaroshning authenticated xizmatlar ro‘yxati ID tekshiruvi bilan moslashtirildi.
5. Yakka xizmat o‘qishida owner yoki approved+active+non-deactivated shartlari SQL da tekshiriladi.
6. Inactive yoki o‘chirilgan sartarosh katalogidan ma’lumot chiqmasligi shartlari qo‘shildi.
7. Xizmatning bir dona API javobida faqat kerakli ustunlar chiqariladi.
8. Egasi o‘zining inactive xizmati holatini ko‘ra oladi.
9. API o‘qish javobi cache qilinmasligi uchun no-store.
10. Update va delete ID lariga bir xil qat’iy tekshiruv.
11. Bron xizmatlari narxi PostgreSQL NUMERIC satridan tiyin aniqligida hisoblanadi.
12. Eksponent, Infinity, manfiy, nol va 2 dan ortiq kasr xonali DB narxlari rad etiladi.
13. Tanlangan xizmatlar tartibi va tranzaksiyadagi server narx nazorati o‘zgarmadi.
14. 37 ta yangi backend regressiya testi qo‘shildi.




## v77 (2026-11-19) — Bron quote/duration integrity

- Manba: v76, 828 eski faylning hech biri yo‘qolmasligi tekshirildi. 185 qaror CSV va barcha SQL byte-for-byte saqlangan.
- 10 ta amaliy himoya: duration quote revalidate, 409 duration_changed, 400 invalid_expected_duration, migration_required fail-closed, int4 ID checks, PG transient 409, no-store slots, aniq frontend xabari; price snapshot va FOR SHARE lock saqlandi.
- 35 yangi unit test; frontend 278 PASS, backend tanlangan 85 PASS. Real DB/CI/Chrome/Telegram NOT_RUN; production-ready EMAS.


## v78 — booking transaction retry & PostgreSQL concurrency test readiness
- - Frontend: **278 PASS / 0 FAIL**.
- - Yangi + tegishli backend unit: **69 PASS / 0 FAIL**, shundan **25 yangi**.
- - To‘liq backend unit: **653 PASS / 26 FAIL**; 26 ta FAIL avvalgi `MODULE_NOT_FOUND` (npm paketlari o‘rnatilmagan) guruhidir.
- - Real PostgreSQL, ikkita ulanishli sinovlar, frontend production build, Chrome, Telegram: **NOT RUN**.
- - CSV `USTARA_185_NAZORAT.csv` SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- - 42 forward + 2 rollback SQL: **byte-for-byte v77 bilan bir xil**.


## v79 (2026-11-19) — service transaction consistency
- v78 (836 fayl) asos: POST/DELETE/PUT/PATCH COMMIT noaniqligida pool connection discard; POST/DELETE lock timeout/deadlock/serialization xavfsiz qayta ishlash.
- 20 yangi backend unit: 138 targeted PASS; to‘liq backend 673 PASS / 26 MODULE_NOT_FOUND FAIL; frontend 278 PASS.
- 2 yangi opt-in haqiqiy PostgreSQL race ssenariyi yozildi, lekin ishlatilmadi.
- 185 qaror CSV va 42 forward migratsiya o‘zgarmagan. Production-ready EMAS.


## v80 (2026-11-19) — booking COMMIT fence
- v79 (840 fayl) ustidan: create/replay, reschedule, slot o‘qish, legacy single-service COMMIT noaniqligida PG poolga yaroqsiz connection qaytarmaslik.
- 22 yangi backend test; v80 focused 60/60 PASS; frontend 278/278 PASS. Keng backend 695 PASS / 26 MODULE_NOT_FOUND FAIL.
- 185 qaror CSV va 42 SQL forward migratsiya saqlandi. Real PostgreSQL NOT_RUN, production-ready EMAS.


## v81 / 4-bosqich — #144 Booking Recovery GET (2026-11-19)

**Manba:** v80 — 845 fayl. Read-only recovery GET orqali noaniq network javobidan keyin oldingi bronni tiklash, yangi slotni o‘z-o‘zidan qayta band qilmaslik, 12 frontend + 9 backend unit test. Frontend 290/290, backend focused 123/123 PASS. Keng backend 704 PASS / 26 dependency FAIL. Real PG va browser E2E bajarilmadi. 185 qaror asl CSV o‘zgarmadi, 42 forward migratsiya saqlandi. #144 **qisman**; production-ready EMAS. Yangi loyiha ZIP va `USTARA_LATEST_CHECKPOINT.md` saqlansin.


## v82 / 4-bosqich — Booking Recovery account/parallel guards (2026-11-19)

- v81 (852 fayl) asos. In-flight duplicate faqat bir xil tanlov+account uchun shared Promise; farqli tanlov/akkaunt parallel POST ni bloklaydi. Recovery UUID noaniq akkauntga avtomatik biriktirilmaydi; eski ID yo‘qotilmaydi. UI GET oldin/so‘ng current accountni solishtiradi. Negative GET uchun `uncertain:true` kontrakti majburiy; response no-store xatolarda ham qo‘yiladi.
- 13 ta yangi frontend + 6 ta yangi backend unit test, 1 ta opt-in PG uncommitted-read/commit/replay ssenariysi yozildi.
- Frontend 303/303 PASS, backend focused 20/20 PASS. Keng backend unit 710 PASS /26 MODULE_NOT_FOUND FAIL; real PG/Chrome/Telegram NOT_RUN.
- 185 qaror va 42 migratsiya saqlandi. #144 QISMAN; production-ready EMAS.


## v83 (2026-11-19) — #98/#99 guest draft and progressive booking
- v82 (858 fayl) asosida: 12 ta himoya/tuzatish, 22 ta yangi frontend test. 325/325 frontend PASS, `test:v83:unit` 28/28 PASS.
- Qoralama tozalash, eskirgan katalog/sana rad etish, 20 xizmat limiti, storage whitelist/size/time/fallback.
- 185 qaror CSV SHA-256 va 42 SQL o‘zgarmagan, offline PASS. Build `vite: not found`, real Chrome/PG/Telegram NOT_RUN. #98/#99 QISMAN, production-ready EMAS.


## v84 (2026-11-19) — #6/#99 availability quote consistency
- v83 (862 fayl) asosida 5-daqiqalik slot va server quote validatsiyasi: PG int4, kalendar kun, amount, duration, canonical available/candidates equality, duplicates, paused/nonworking javob.
- 37 ta yangi frontend test, jami 362/362 PASS; decisionCoverage 3/3; 185 qaror va 42 migratsiya offline PASS.
- Build `vite: not found`; real PG/Chrome/Telegram/GitHub Actions NOT_RUN, #6/#99 QISMAN, production-ready EMAS.


## v85 (2026-11-19) — #6/#99 confirmation quote snapshot
- v84 (866 fayl) asosida ko‘rsatilgan narx, xizmat, vaqt, duration va policy immutable snapshoti; 120 s quote TTL, slot fetch/version race, oyna ochiqligida selection mismatch va sessiya almashish himoyasi.
- 40 yangi frontend test, jami 402/402 PASS; tanlangan backend 39/39 PASS; 185 qaror va 42 migratsiya offline audit PASS.
- Real Vite build BLOCKED (`vite: not found`); PostgreSQL, Chrome/mobil, Telegram va GitHub CI NOT_RUN; #6/#99 QISMAN, production-ready EMAS.


## v86 (2026-11-19) — Bron receipt va recovery integrity
- v85 (871 fayl) asosida bronning server javobiga qat’iyroq validatsiya: id/status/time/quote/duration/customer/service, noaniq 2xx response ID saqlash, recovered booking owner guard, bekor/yakunlangan replay holatlarini to‘g‘ri ko‘rsatish va aniq detal link.
- +28 frontend test; 430/430 PASS; tanlangan backend 38/38 PASS. 185 qaror SHA va 42 forward migratsiya offline PASS.
- Vite build (deps yo‘q), real PG, Chrome/mobil, Telegram/CI NOT_RUN; #6/#99/#144 QISMAN. Production-ready EMAS.


## v87 (2026-11-19) — cancel/reschedule status va session
- v86 (876 fayl) asosida cancellation COMMIT noaniq connection discard, strict Postgres ID, reschedule receipt customer/barber/status/time/quote/service validation va akkaunt almashgandagi late response guard.
- Frontend 457/457 PASS; tanlangan backend 22/22 PASS; keng backend 726 PASS/26 dependency FAIL. 185 qaror va 42 migratsiya offline PASS. Real PostgreSQL, Vite, Chrome va Telegram NOT_RUN; #17/#106 QISMAN.


## v88 (2026-11-19) — #159 customer contact privacy
- v87 (881 fayl) asosida sartarosh customer directory/detail so‘rovlari telefon raqamini olmaydi va explicit public allowlist qaytaradi. O‘z bronida customer_phone maydoni saqlanadi. Admin telefoniga tegilmagan.
- Cache-Control: no-store (mijoz ma’lumotlari va bronlar); strict int4 profile/customer IDs.
- 25 yangi backend unit, 751 backend PASS/26 MODULE_NOT_FOUND FAIL; frontend 457/457 PASS.
- 185 qaror CSV va 42 forward SQL migratsiya o‘zgarmadi. Real PostgreSQL/browser/Telegram NOT_RUN; #159 QISMAN, production-ready EMAS.


## v89 (2026-11-19) — #173 public queue/slot privacy
- v88 (885 fayl) asosida multi-service public availability faqat free candidates/slots qaytaradi; frontend legacy busy payloadlarni ham yashiradi.
- Int4 strict decimal ID, queue aggregate fail-closed; 38 backend + 4 frontend yangi test PASS. Frontend 461/461, backend 789 PASS / 26 dependency FAIL.
- CSV 185 qaror SHA o‘zgarmadi; 42 forward + 2 rollback SQL offline PASS; real PG/Chrome/Telegram NOT_RUN, #173 QISMAN; production-ready EMAS.


## v90 (2026-11-19) — #35 queue ETA va eskirgan ma’lumot himoyasi
- v89 890 fayl bazasida public queue ETA >24h bo‘lsa unknown, waiting/called sana bir SQL statement stable.
- Frontend fresh timestamp+ID+public whitelist tekshiruv, latest-only abortable polling, offline/hidden-tab/online/focus UX; eski ma’lumotni live deb ko‘rsatmaydi.
- 55 yangi frontend va 12 backend test PASS; frontend 516/516, backend 801 PASS / 26 missing-dependencies FAIL.
- 185 CSV SHA o‘zgarmadi, 42 forward + 2 rollback SQL OFFLINE PASS, real PG/Chrome NOT_RUN, #35 QISMAN, production-ready EMAS.


## v91 (2026-11-19) — #128 Queue Self Exit hardening
- v90 bazasidan davom: COMMIT uncertain pool connection discarded; strict manual queue ID; queue exit 503 result unknown, DB 40001 retryable 409.
- Manual queue response minimal whitelist validation, failed refresh clears old ticket/actions, offline/retry/visibility; QR status failure hides stale ticket/actions.
- 58 yangi unit test PASS (frontend 26, backend 32); frontend 542/542, backend 833 PASS/26 dependency FAIL.
- 185 CSV hash saqlandi, 42 forward+2 rollback offline PASS; haqiqiy PG/Chrome/Telegram NOT_RUN; #128 QISMAN. Production-ready EMAS.


## v92 (2026-11-19) — QR status fail-closed + barber queue COMMIT safety
- v91'dagi 902 fayldan davom etildi. QR status response strict parser, no private extras, error stale action hide; account-switch result guard.
- Barber queue join/call-next/finish/reorder COMMIT uncertain -> no rollback, connection discard, 503 recheck-only. Read-only list commit failure discards connection.
- 31 yangi test PASS; frontend 567/567 PASS; backend 839 PASS / 26 missing npm deps FAIL. 185 CSV va 42 SQL migratsiya o‘zgarmagan.
- Haqiqiy PG, browser, Telegram, CI NOT_RUN; #128 QISMAN; production-ready EMAS.


## v93 (2026-11-19) — Barber navbat UI fresh read + session/action gate
- v92'ning 908 faylidan davom etildi. Barber Queue API qat’iy parser, BIGINT ID normalization, privacy allowlist, duplicate ID fail-closed.
- Read epoch gate + session subscribe + stale refresh error clear: eski queue bilan amallar bloklanadi. Parallel ikki mutation bir vaqtda yuborilmaydi.
- 58 yangi test PASS; frontend 615/615 PASS; backend 849 PASS / 26 dependency FAIL. 185 CSV, 42 forward/2 rollback SQL o‘zgarmagan.
- Real PG/Chrome/Telegram/CI NOT_RUN; production-ready EMAS.


## v94 (2026-11-19) — Barber queue optimistic call/finish preconditions
- v93 (914 fayl) asosida. Frontend latest queue snapshot expected_next_id/expected_status yuboradi; backend shared lock ichida stale call/finish amallarini 409 queue_changed qaytaradi.
- Eski API mijozlariga moslik va idempotent replay saqlandi. Real "xizmat boshlandi" statusi hali qo‘shilmadi.
- 51 yangi unit test PASS (31 backend,20 frontend). Frontend 635/635 PASS; backend 880 PASS/26 dependency FAIL. Postgres opt-in integration ssenariysi SKIP.
- Asl 185 CSV va 42 migratsiya o‘zgarmadi. PostgreSQL/Chrome/Telegram/CI production sinovlari NOT_RUN; production-ready EMAS.


## v95 (2026-11-19) — Walk-in service started lifecycle
- v94 (921 fayl) asosida. #23: `called -> in_service -> served`, `started_at`, audit `started`, bir vaqtda faqat bitta called/in_service, oldingi 42 migratsiya saqlandi + 1 yangi = 43 forward.
- Backend POST `/:id/start` barber-only optimistic status, replay va COMMIT safety; client QR/manual/status/ETA bir xil holatni tushunadi.
- 59 yangi unit test PASS (39 backend, 20 frontend). Frontend 655/655 PASS; backend 919 PASS / 26 missing dependency FAIL; PostgreSQL opt-in integration 1 SKIP.
- 185 CSV xeshi o‘zgarmadi, 43 migratsiya offline auditi PASS. Chrome/Telegram/CI/Postgres live testlar NOT_RUN, production-ready EMAS; #23 QISMAN.


## v96 (2026-11-19) — Keldi / arrived lifecycle
- v95 (928 fayl) asosida #23 `called → arrived → in_service → served` qo‘shildi. Backward compatibility: eski `called → in_service` API ishlashda davom etadi.
- Yangi 44-forward SQL migratsiya arrived_at, status, audit arrived, unique active index; oldingi 43 migratsiya o‘zgarmagan.
- Yangi 38 backend va 26 frontend test PASS. Full frontend 681 PASS, backend 957 PASS / 26 missing dependency FAIL. Real PostgreSQL SKIP.
- 185 qaror bir xil SHA; 44 migratsiya offline audit PASS. `#23` hali qisman, production-ready EMAS.


## v97 (2026-11-19) — Arrived self-exit + read-only DB preflight
- v96 (935 fayl) asosida #23 va #128: QR/manual navbatdan `arrived` holatida chiqish, `in_service`da bloklash; yagona UI va server status qoidalari.
- 44 migratsiya va 185 CSV o‘zgarmagan. 49 yangi unit test PASS; frontend 696/696, backend 991 PASS / 26 missing npm dependency FAIL.
- PostgreSQL read-only preflight va ikki qurilmali race ssenariysi yozildi, haqiqiy PG serverida NOT_RUN/SKIP. Production-ready emas.


## v98 (2026-11-19) — Walk-in queue day-boundary safety
- v97 (943 fayl) asosida #23/#128: faol navbat faqat bugun, kechagi idempotency replay 410, `finish` bugungi `queue_date` bilan cheklanadi. Terminal replay va `recent` tarixi saqlandi.
- 12 yangi unit test PASS; tanlangan 43/43 PASS; frontend 696/696 PASS; keng backend 1003 PASS / 26 missing-dependency FAIL.
- 44 forward + 2 rollback migratsiya va asl 185 qaror fayli o‘zgarmadi. PostgreSQL v98 day-boundary ssenariysi kengaytirildi, lekin real DB yo‘q: SKIP.
- PostgreSQL/Chrome/Telegram/CI real tekshiruvlari NOT_RUN, production-ready EMAS.


## v99 (2026-11-19) — Navbat yozishlarida yarim tun chegarasi
- v98 (947 fayl) asosida #23/#128: `callNext` UPDATE endi Tashkent bugungi `queue_date` bilan cheklanadi.
- `reorder` UPDATE ham ayni shartni tekshiradi. UPDATE barcha kutayotgan qatorlarga tegmagan bo‘lsa, tranzaksiya ROLLBACK qilinadi va audit yozilmaydi.
- Yangi 9 ta test PASS; keng frontend 696 PASS, backend 1012 PASS / 26 missing dependency FAIL.
- 185 qaror CSV va 44 forward + 2 rollback SQL o‘zgarmadi. Haqiqiy PostgreSQL SKIP, production-ready EMAS.


## v100 (2026-11-19) — Xizmat tugadi Ha/Yo‘q (#157)
- v99 (951 fayl) asosida. `Queue.jsx` endi `in_service`ni bevosita `served`ga yubormaydi: Ha/Yo‘q tasdig‘i, session epoch va navbat ID/status himoyasi, 30 soniya expiry.
- O‘zgargan navbat yoki akkaunt eski tasdiqni bekor qiladi. Kechagi navbatdagi yaroqsiz «Yakunlash» tugmasi olib tashlandi.
- 37 yangi frontend test PASS; frontend 733 PASS, backend 1012 PASS / 26 dependency FAIL.
- 185 qaror CSV va 44 SQL migratsiya o‘zgarmadi. Real E2E/PG yo‘q, #157 QISMAN, production-ready EMAS.


## v101 (2026-11-19) — Bekor qilishdan keyin muqobil vaqtlar (#105)
- v100 (956 fayl) asosida: tasdiqlangan cancellationdan keyin shu sartarosh/xizmatga 3 kun ichida real bo‘sh vaqtlarni o‘qish (ko‘pi bilan 6 ta); eski vaqtning o‘zini muqobil sifatida berilmaydi.
- Sessiya, ID, 5-daqiqa qadam, noto‘g‘ri vaqtlar va network xatolari bo‘yicha 29 yangi test PASS. Jami frontend 762/762 PASS.
- Backend unit 1012 PASS / 26 missing-dependency FAIL. 185 CSV va 44 SQL forward migratsiya o‘zgarmadi. Real DB, brauzer va CI yo‘q: #105 QISMAN, production-ready emas.

## v102 — #105 tasdiqlangan cancellation alternatives
Server tasdiqlagan cancellation, session change guard, qat’iy slot/sana shartlari, sorting; frontend 780 PASS; backend 1012 PASS / 26 dependency FAIL. 44 SQL va 185 qaror o‘zgarmadi. Production-ready EMAS.


## v103 (2026-11-20) — #106 Bronni ko‘chirish xavfsizligi

Bo‘sh vaqtlar, davomiylik, narx, ses­siya va noaniq PATCH natijasi himoyalari kuchaytirildi. Frontend 816/816 PASS; backend tanlangan 15/15 PASS; PostgreSQL/Chrome NOT_RUN. v102 185 qaror/44 migratsiya o‘zgarmadi. Qisman bajarilgan.


## v104 (2026-11-20) — #106 bron ko‘chirish quote authorization
- GET quote faol customer account/profile mosligi, paused-barber price privacy, expired-day, server clock va duration tekshiruvlari; PATCH expected time 5 daqiqalik grid. Private API no-store.
- 33 yangi backend unit test PASS; keng frontend 816 PASS; backend 1045 PASS / 26 missing dependency FAIL.
- 185 qaror hash va 44 migratsiya o‘zgarmadi; real PG/Chrome/Telegram/CI NOT_RUN. #106 QISMAN.

## v105 / 4-bosqich — #152 Safe No-Show tasdiqlash (2026-11-20)

Manba: v104 ZIP. Sartaroshning `Kelmadi` amali ikki bosqichli `Ha/Yo‘q` tasdiqlashga o‘tkazildi. Tasdiq faqat `called` status, ayni navbat ID, queue_date va called_at, bir xil sartarosh sessiyasi va 30 soniya chegarasida ishlaydi. Refreshed snapshot/akkaunt almashishi va muvaffaqiyatsiz o‘qish tasdiqni tozalaydi. Mijozning ism/telefon/QR kabi ma’lumoti tasdiq holatiga ko‘chirilmaydi. Backendning avvalgi `expected_status`, ownership, date va transaction himoyalari o‘zgarmadi.

**Testlar:** Frontend 853/853 PASS; backend unit 1061 PASS/26 missing dependency FAIL; 37 yangi frontend va 16 yangi backend testlari PASS. JSX syntax 0 diagnostics; 185 CSV checksum va 44 forward migratsiya offline PASS. PostgreSQL, Vite build va haqiqiy browser NOT_RUN. #152 hali QISMAN.

## v106 / 4-bosqich — #153 Safe Day Closing preflight (2026-11-20)

Manba v105 ZIP. Tasdiqlangan sartarosh uchun read-only `GET /api/queue/day-close/preview` qo‘shildi. `waiting/called/arrived/in_service`, bugungi tasdiqlanmagan bronlar, 30 daqiqalik QR, Smart Booking openings va kechadan qolgan navbatlar sanaladi. UI natijani shaxsiy ma’lumotsiz ko‘rsatadi; akkaunt o‘zgarsa yoki navbat amali boshlansa preview bekor bo‘ladi. Kun doimiy yopilmaydi, hech qanday ommaviy bekor qilish yo‘q. 43 yangi test PASS, frontend 877/877 PASS; backend 1080 PASS/26 dependency FAIL, 185/44 offline audit PASS. Real PG/Vite/browser NOT_RUN, #153 QISMAN.

## v107 / 4-bosqich — #153 persisted safe day closing (2026-11-20)

v106 ZIP'dan davom etildi. Bugungi kun uchun sartarosh tasdig‘i bilan tranzaksiyali yopish/qayta ochish, 45-SQL, audit, optimistic revision, 30 soniyalik preview va 8 blocker qayta tekshiruvi, markaziy jadval gate, QR va public queue banner kiritildi. v107 SQL va backend unit/front regressiya offline tekshirilgan; PostgreSQL/Vite/mobile NOT_RUN. 185 qaror intact; #153 QISMAN, production-ready emas.

## v108 / 4-bosqich — Safe day closing DB-readiness / QR commit recovery (2026-11-20)

v107 ZIP davomidan: QR tranzaksiyasi COMMIT natijasi yo‘qolsa alohida `queue_result_unknown` qaytaradi, ishonchsiz DB ulanishi pool’ga qaytarilmaydi. Public queue as_of PostgreSQL statement vaqtidan olinadi. Faqat lokal, ruxsatli, READ ONLY v108 PostgreSQL/locking preflight qo‘shildi. Unit regressiya va 185/45 offline audit tekshirildi; real PG/Vite/Chrome NOT_RUN. Production-ready emas.

## v109 / 4-bosqich — Safe Day Closing / QR issue final fence (2026-11-20)

v108 ZIP’dagi 1004 fayl asosida #153 bo‘yicha QR token faqat ochiq ish jadvalida yaratiladigan bo‘ldi va final INSERT ichida jadval qayta tekshiriladi. QR expiry hamda rate/capacity hisoblagichi noto‘g‘ri bo‘lsa fail-closed; kunni qayta ochish uchun server va brauzerda 30 soniyalik yangi tasdiq kerak. Day-close sana/vaqt Asia/Tashkent bilan mosligi backend va frontendda tekshiriladi. Preview mutatsiyasiz, identity-lock xavfsizligida qoladi; COMMIT xato tasnifi read/write uchun ajratildi. Kun yopilganda navbat va QR yaratish tugmalari o‘chadi. 46 yangi unit test PASS, frontend 902 PASS, backend 1179 PASS / 26 oldingi npm dependency FAIL; 185 qaror / 45 forward migratsiya offline PASS. Real PostgreSQL / Vite / Chrome NOT_RUN; #153 QISMAN, production-ready EMAS.

## v110 / 4-bosqich — QR/queue midnight DB final fences (2026-11-20)

v109’dagi 1008 fayl asosida QR token, QR request, approve, status va pending ro‘yxati uchun PostgreSQL Asia/Tashkent sanasi cheklovlari; manual navbat yaratishdagi final INSERT jadval/date tekshiruvi; day-close QR blocker bugungi kunga bog‘landi. 19 yangi backend test PASS, frontend 902 PASS, backend 1198 PASS / 26 oldingi dependency FAIL. 185 qaror va 45 forward/2 rollback SQL o‘zgarmadi; real PostgreSQL, Vite, mobil NOT_RUN. #153 QISMAN, production-ready emas.

## v111 / 4-bosqich — Calendar write owner / transaction lock harmonization (2026-11-20)

v110’dagi 1011 fayl asosida sartarosh identity/user lock tekshiruvi kalendar exception save/remove va break weekly/dated mutatsiyalariga qo‘shildi. Lock ordering QR/navbat/kun yopilishi bilan bir xillashdi. Dated writes PostgreSQL soatini lockdan keyin va COMMITdan oldin qayta tekshiradi. COMMIT natijasi noaniq bo‘lsa connection tashlanadi va 503 `calendar_result_unknown` qaytariladi; rollback failure/deadlock yashirin SQL bermasdan boshqariladi. 33 yangi backend unit PASS, frontend 902 PASS, backend 1231 PASS/26 avvalgi dependency FAIL. 185 qaror, 45+2 SQL saqlandi; real PG/Vite/Chrome NOT_RUN. #153 QISMAN.

## v112 / 4-bosqich — Kalendar o‘qish owner/snapshot himoyasi (2026-11-20)

v111’dagi 1014 fayl asosida calendar exceptions GET va break rules GET serverda faol, tasdiqlangan barber/user juftligi bilan tekshiriladi. Ikkala o‘qish PostgreSQL `REPEATABLE READ READ ONLY` snapshot'ida; tanaffus weekly/dated natijalari endi bitta Pg ulanishi orqali izchil keladi. Sana filtri `transaction_timestamp()`; no-store/private SQL sanitization va bad-connection discard mavjud. Faqat local test PostgreSQL uchun read-only opt-in preflight/testlar qo‘shildi. 23 yangi unit PASS, tanlangan 71 PASS, frontend 902 PASS, backend 1254 PASS/26 oldingi npm dependency FAIL. 185 CSV va 45 forward/2 rollback migratsiya saqlandi. Real PostgreSQL/Vite/browser/Telegram E2E NOT_RUN, #153 QISMAN, production-ready emas.

## v113 / 4-bosqich — Dependency readiness va kalendar transport/5-minut himoyasi (2026-11-20)

v112’dagi 1018 fayl asosida kalendar/break vaqtlarini 5-daqiqa qadamida frontend/backend moslashtirish, calendar save/remove va weekly/dated break mutation’da SQLSTATE 08*, admin shutdown yoki socket uzilganda pg connection’ni pool’ga qaytarmaslik, snapshot read uchun umumiy failure classifier va no-store invalid responses qo‘shildi. Backend/frontend lockfile va o‘rnatilgan paketlarni xavfsiz tekshiruvchi no-install preflight qo‘shildi. Yangi backend 27 unit PASS, frontend 6 unit PASS; keng frontend 908 PASS, backend 1281 PASS/26 aynan avvalgi dependency FAIL. 185 qaror CSV va 45 forward/2 rollback SQL o‘zgarmadi; npm ci offline ENOTCACHED, haqiqiy PG/Vite/mobil NOT_RUN, #153 QISMAN va production-ready EMAS.


## Reconstructed v114 / PostgreSQL transport consistency (2026-11-20)

Manba v113 ZIP SHA va CRC tekshirildi. Tarixiy v114 arxivini ko‘chirmay, v114 manifestdagi 4 yangi / 9 o‘zgargan fayl talablari v113 asosida mustaqil qayta tiklandi. Ulangan transport classifier barcha schedule, queue, QR, legacy booking va available-slot pooled transactionlarda xato socketni discard qiladi. Legacy booking COMMIT noaniqligi 503 booking_result_unknown qaytaradi va ROLLBACK qilmaydi. Targeted 90/90 PASS, backend 1327 PASS/26 dependency FAIL, frontend 908/908 PASS; 185 qaror hash va 45+2 migration offline audit PASS. PostgreSQL real DB, browser, Vite build, Telegram E2E, deployment NOT_RUN. Production-ready EMAS. Batafsil docs/USTARA_LATEST_CHECKPOINT.md va docs/v114-pg-transport-queue-qr-booking-evidence.md.


---

# USTARA v115 / 185 qaror — Smart Search va bron yo‘li (2026-11-20)

**Asos:** `USTARA-v114-Reconstructed-From-v113.zip` (1027 fayl), SHA-256 `a3d28aeba797a9be7ba3207cf7baf742ef7e2a21ee8e2a90d55069460f8fa190`.
Bu tarixiy v114 ning byte-to-byte nusxasi emas, foydalanuvchi yuborgan v113 dan qayta tiklangan ishchi baseline.

## Aynan foydalanuvchi belgilagan qarorlar

- **#16 — Smart Search qidirish va filtrlar:** eski qidiruv endi ism/familiya, mutaxassislik, salon, xizmat, ko‘rsatilgan manzil bo‘yicha ko‘p so‘zli izlaydi; mavjud narx va xizmat filtrlari saqlandi. **QISMAN** (server miqyosida reyting/sort, matnli qidiruv ko‘lami va haqiqiy brauzer tekshiruvi qolgan).
- **#164 — Manzil va tuman bo‘yicha qidiruv:** katalogdagi `address` matniga asoslanuvchi mustaqil `area` filtri va uning URL parametri/chiqarib tashlash tugmasi qo‘shildi. **QISMAN** (strukturaviy tuman DB ustuni va geokodlash yo‘q; faqat sartarosh kiritgan manzil qidiriladi).
- **#42 — Profil bron qilish tugmasining ustuvorligi:** karta ichida `Bron qilish` tezkor tugmasi qo‘shildi, xizmatlari mavjud bo‘lgan tasdiqlangan sartarosh uchun xizmatlar tabiga olib boradi; booking avtomatik ochilmaydi/tasdiqlanmaydi. **QISMAN** (real mobil E2E qolgan).
- **#1 / #58 — Responsiv uy/card interfeysi va mobil dizayn:** Explore actions hamda filtrlari kichik ekranlarda joylashishi yaxshilandi, Home qidiruv placeholderi aniqlashtirildi. **QISMAN** (barcha sahifa responsive tekshiruvi emas).

## 7 ta bajarilgan kichik ish

1. Original 185 qatorli CSV va baseline yaxlitligi tekshirildi; user qarorlari o‘zgartirilmadi.
2. Qidiruv matnida katta-kichik harf, apostrof va takror bo‘shliq normalizatsiyasi saqlandi/yaxshilandi.
3. Ko‘p kalit so‘zli izlash ism, kasb, salon, xizmat va manzilni birgalikda qidiradi.
4. Mustaqil manzil/tuman filtri `area` qo‘shildi; manzili yo‘q profilga tuman to‘qib chiqarilmaydi.
5. URL-parametr, tanlangan filtr chiplari va tozalash funksiyasiga yangi filtr qo‘shildi.
6. Sartarosh karta havolasida bevosita profilning xizmatlar sahifasiga tez o‘tish tugmasi, bron xizmatlari bo‘lmasa esa bunday tugma yo‘q.
7. Mobil CSS, tushunarli qidiruv matni va yangi regressiya testlari qo‘shildi.

## Tegilgan kod

- `frontend/src/pages/user/explore/catalog.js`
- `frontend/src/pages/user/Explore.jsx`
- `frontend/src/pages/user/Explore.css`
- `frontend/src/pages/user/explore/ResultCard.jsx`
- `frontend/src/pages/user/UserHome.jsx`
- `frontend/test/exploreCatalog.test.js`

## Tekshiruv va cheklovlar

- `node --test frontend/test/exploreCatalog.test.js`: **18 PASS**, 0 FAIL (shundan 9 yangi test).
- `npm test` (`frontend`): **917 PASS**, 0 FAIL, 0 SKIP.
- `node scripts/v67-decision-audit.cjs`: 185 qaror, CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — OFFLINE PASS.
- `node scripts/v67-migration-audit.cjs`: 45 forward + 2 rollback SQL — OFFLINE PASS.
- Backend kodiga tegilmadi. Avvalgi backend test xatolari hozir qayta tekshirilmagan.
- `frontend/node_modules` yo‘q. Vite production build, real brauzer/E2E, PostgreSQL, Telegram va deploy: **NOT_RUN**.
- **Production-ready: YO‘Q.**

## Keyingi 7 ishning tavsiya etilgan yo‘nalishi

#1/#58 mobil dizaynni real ko‘rinishda, #3/#42 public profil va bron oqimi, #16/#164 yangi qidiruvni API bilan real ma’lumotlarda, #92 bo‘sh 7-kunlik slotlar ko‘rinishini tekshirish. Sinovlar asosida aniq topilgan nuqsonni tuzatish; 185 qaror CSV va eski SQL migratsiyalarni o‘zgartirmaslik.



---

# USTARA v116 — 185 qaror: public profil, bron CTA va mobil mustahkamlik (2026-11-20)

**Asos:** `USTARA-v115-185-Smart-Search-Site.zip` SHA-256 `9bd0e57a2f9d8706218cf16afc7b487122f8a27e6bc11fac529ef978aa2f1fed`.
Bu dastlabki v113 dan mustaqil qayta tiklangan v114 → v115 zanjirining davomi; *tarixiy v114 baytma-bayt nusxasi* degani emas.

## 7 vazifa: foydalanuvchining 185 qaroriga mos

1. **Manba va qarorlar** — 185 qatorli asl CSV SHA-256 bilan tekshirildi; qarorlarga tegilmadi, soxta 'TAYYOR' statuslari yozilmadi.
2. **#3 Instagram uslubidagi public profil** — mavjud post grid/galereya, ish vaqti, sharhlar bo‘limlari URL tab holati bilan bog‘landi (`?tab=posts/services/hours/reviews`), invalid tab xavfsiz `services`ga qaytadi.
3. **#42 Bron ustuvorligi** — profil sarlavhasi ostiga asosiy `Bron qilish` CTA qo‘shildi; mavjud `InlineBooking`ga o‘tadi, hech bir bron avtomatik yozilmaydi.
4. **#42/no-service holati** — xizmat bo‘lmasa bosilganda ishlamaydigan tugma o‘rniga aniq xabar chiqadi; katalog tezkor CTA'si qidiruvga qaytish (`from`) holatini saqlaydi; rebooking `services` query parametri yo‘qolmaydi.
5. **#3 Post API barqarorligi** — noto‘g‘ri media/post bo‘lsa post qismi aniq xatoga o‘tadi, butun booking profili ishdan chiqmaydi. Video/rasmga asoslangan post tugma nomi yordamchi texnologiyalar uchun yaxshilandi.
6. **#1/#58 Mobil UI** — 320–359px o‘lchamda stats/tab/CTA joylashuvi, 44px+ touch nishonlari, dark blue theme tokenlari, post/review ko‘rinishi va modal media o‘lchovi yaxshilandi. Brauzer screenshot / real device hali tekshirilmagan.
7. **Regression va offline integrity** — yangi URL, qidiruvdan kelgan CTA, post validation, video uchun unit testlar; butun frontend va 185 qaror / SQL migratsiyalar auditlari.

## Aynan qarorlarning holati

- **#3:** QISMAN — public profil, post grid, media sheet, tab navigation; social follow/comment kabi barcha Instagram funksiyalari shu bosqichda to‘liq tekshirilmagan.
- **#42:** QISMAN — UI va tab yo‘li; haqiqiy bron E2E, DB tranzaksiya tasdig‘i qolgan.
- **#1/#58:** QISMAN — CSS va kod ko‘rib chiqildi; mobil Chrome/Safari qurilmalarda E2E qolgan.
- **#16/#164:** v115 funksiyalari saqlandi; to‘liq server/DB qidiruv tekshiruvi keyingi ish.
- **#92:** 7 kunlik Smart Availability Explorer hali bajarildi, deb e'lon qilinmaydi.

## Test dalillari

- `node --test frontend/test/profileNavigationV116.test.js frontend/test/publicProfile.test.js`: **20 PASS**, 0 FAIL, 0 SKIP (8 yangi navigation, 2 yangi adapter test).
- `npm test` frontend: **927 PASS**, 0 FAIL, 0 SKIP (v115: 917).
- JSX TypeScript parser smoke: **2/2 PASS**.
- `node scripts/v67-decision-audit.cjs`: **185 qaror**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` PASS.
- `node scripts/v67-migration-audit.cjs`: **45 forward + 2 rollback** OFFLINE PASS.
- Backend application / PostgreSQL / Vite build / haqiqiy mobil-brauzer / Telegram E2E: **NOT_RUN**. `node_modules` va tarmoqga ulanish yo‘q. Production-ready **YO‘Q**.

## Keyingi v117 (7 ish)

#92 foydalanuvchi tanlayotgan xizmatga mos 7 kunlik bo‘sh vaqt ko‘rinishi (faqat API dalili asosida, soxta availability yo‘q), #16/#164 API qidiruv contract testi, haqiqiy Vite/browser test imkon bo‘lsa va endpointlar/bron/QR/slot sinovlari. 185 CSV va SQL migratsiyalarni saqlash.

## v117 / 185 qarorga mos 7 kunlik Smart Availability Explorer (2026-11-20)

v116 asosida #92 profil ichidagi serverga tayanuvchi 7 kunlik availability, 14 kunni 2 hafta ko‘rinishida ko‘rish, 2 parallel GET limiti, eskirgan so‘rovlarni abort qilish, har bir kun xatosi va retry, mobil klaviatura interfeysi. #16/#164 qidiruv real katalog contract regressiya qo‘shildi. Original 185 CSV/45 forward+2 rollback SQL o‘zgarmadi. Frontend 939/939 PASS; yangi 12/12 PASS; JSX parse PASS; Vite va haqiqiy PG/Chrome/Telegram E2E bajarilmadi. Qisman, production-ready emas. Dalil: `docs/v117-185-weekly-availability-evidence.md`.

## v118 / 185-qaror: haftalik slot retry va noaniq bron xatosi (2026-11-20)

v117 asosida #92/#42/#52/#100 uchun 7 ish: ketma-ket ISO-kun va ID validatsiyasi; faqat xato kunni qayta tekshirish; tekshirilgan eng yaqin bo'sh kunga o'tish; hafta almashganda oldingi sana/time/confirmationni tozalash; haftani yangilaganda selected-day quote/slotni ham yangilash; `booking_result_unknown` uchun noaniq COMMIT ogohlantirishi va oldingi idempotency ID'ni saqlash. Frontend **952/952 PASS**, yangi **13 PASS**; backend unit **1327 PASS/26 MODULE_NOT_FOUND FAIL**, Vite/PG/browser/Telegram **NOT_RUN**. 185 qaror CSV va 45+2 SQL o'zgarmagan. Qisman, production-ready emas. Tafsilot: `docs/v118-185-availability-recovery-evidence.md`.

## v119 / 185 qaror: booking auth transport va recovery contract (2026-11-20)

v118 asosida 7 ish: baseline/185 qaror audit; `createBooking` POST uchun Bearer JWT va AbortSignal options tuzatish; `booking_in_progress` da idempotency keyni saqlash; recovery GET natijasida sessiya token/profile/almashtirilgan akkauntni ajratish; haqiqiy HTTP client va GET→quote→POST/recovery contractni mock fetch bilan tekshirish; dependency/readiness audit. Frontend **965/965 PASS**, yangi 13/13 PASS; backend 1327 PASS/26 oldingi `MODULE_NOT_FOUND` FAIL. Offline `npm ci` ENOTCACHED, registry EAI_AGAIN; Vite `vite: not found` (BUILD BLOCKED), real DB/browser/Telegram **NOT_RUN**. 185 qaror CSV va 45+2 migratsiya o'zgarmadi. Production-ready emas. `docs/v119-185-booking-transport-contract-evidence.md`.

## v120 / 185 qaror — bron receipt va recovery xavfsizligi (2026-11-20)

Asos v119 (1041 fayl). #5/#42/#52/#100/#144 bo'yicha 7 o'zgarish: quoted narx server javobida bo'lmasa false success emas, multi-service receipt to'liq, qoidalar/UUID validatsiyasi, pending selection'ni read-only recovery natijasi bilan bog'lash, in-flight token/profile/quote mismatchni bloklash, noto'g'ri recovery/schema/storage'ni rad qilish. `docs/v120-185-booking-confirmation-recovery-evidence.md` ga qarang. Frontend 976 PASS, backend unit 1327 PASS/26 missing-dependency FAIL (kengaytirilgan backend 1327 PASS/52 FAIL/20 SKIP). npm ci offline ENOTCACHED, Vite BUILD BLOCKED, real DB/browser/Telegram NOT_RUN; production-ready YO'Q. Asl 185 qaror CSV va 47 SQLni o'zgartirmadik.


## v121 / 185 qaror: profil va Smart Search (2026-11-20)


1. **#3 / #42:** Explore'dagi «Profilni ko‘rish» endi katalog ichidagi qisqa detail emas, `(/user)/barbers/:id` to‘liq public profiliga yo‘naltiradi; `location.state.from` orqali qidiruvga qaytish holati saqlanadi.
2. **#3 / #164:** Xarita markeridan profilga o‘tganda ham avvalgi `q`, `area`, `sort` va boshqa URL filtrlari qaytish uchun saqlanadi.
3. **#16:** Query berilganda public ism/familiya eng ustuvor, keyin salon, mutaxassislik, xizmat va manzil bo‘yicha asosli relevance reytingi qo‘shildi. Bir xil score'larda server tartibi saqlanadi; soxta reyting yaratilmaydi.
4. **#16:** Narx (arzon→qimmat / qimmat→arzon) va ism bo‘yicha saralash; narxi noma’lum profillar oxirida; saralash URL'da saqlanadi, mobil select UI qo‘shildi.
5. **#164:** Manzildagi vergul, chiziqcha va `8-mavze` kabi belgilar moslashuvchan normallashadi; faqat serverda ko‘rsatilgan manzil/tuman qidiriladi, koordinatadan tuman taxmin qilinmaydi.
6. **#16:** Manfiy, `Infinity`, `NaN` va ters min/max narx oralig‘i filtrlari fail-closed rad etiladi, xato interfeysda ko‘rsatiladi.
7. **#3:** Post thumbnail'lari media URL'i almashganda eski «rasm ochilmadi» holatini yangi postga ko‘chirmaydi. Xato yuklangan video uchun dekorativ video belgisi yashiriladi. Yangi holatlar uchun regressiya testlari qo‘shildi.


**Frontend 992/992 PASS, backend 1327 PASS/26 FAIL (dependency). 185 CSV va 47 migratsiya byte-identical. Real PostgreSQL/Vite/browser NOT_RUN. Production-ready NO.**


## v122 / 185 qaror — xizmat narxi va qidiruv yaxlitligi (2026-11-20)

- Asos: v121 ZIP, 1045 fayl; #16/#42/#164 talablariga yo‘naltirilgan 7 vazifa.
- Katalogda `service` filtri bo‘lsa, narx chegarasi, saralash va ko‘rsatiladigan qiymat aynan tanlangan xizmatdan olinadi; narx noma’lum bo‘lsa taxmin qilinmaydi.
- Profildagi bron havolasi faqat shu sartaroshga tegishli xizmat ID bilan preselect qiladi; yakuniy bronni mijoz alohida tasdiqlaydi.
- Noto‘g‘ri URL filtrlar rad etiladi, 160 belgilik qidiruv chegarasi bor; server xizmat ID/price/provider mosligi tekshiriladi.
- Xarita koordinatasi yo‘q profillar soni ochiq ko‘rsatiladi, soxta koordinatalar kiritilmaydi.
- Izolyatsiyalangan unit-testlar va audit; `npm ci --offline` ENOTCACHED, registry DNS EAI_AGAIN. Vite/PG/browser/Telegram **NOT_RUN**; production-ready **YO‘Q**.
- Dalil: `docs/v122-185-service-price-search-evidence.md`; asl 185 qaror CSV va eski SQL migratsiyalarni o‘zgartirmang.


## v123 / 185 qaror — yaqinlik va qidiruv xavfsizligi (2026-11-20)

- v122 ZIP bazadan, #16/#164 bo‘yicha `distance_asc` va koordinatasi noma’lumlarni oxiriga qo‘yish; profil manziliga tayangan holda faqat to‘g‘ri chiziq masofasi ko‘rsatildi.
- Noto‘g‘ri va takroriy `sort/map/type/profile`/filtr URL qiymatlari, takroriy approved barber ID rad etiladi.
- #42 bosh sahifadagi bron CTA faqat e’lon qilingan xizmat bilan chiqadi; qidiruvga 160 belgi chegarasi.
- `frontend/test/v123DistanceSearchAndLinkSafety.test.js`: 12 ta yangi test. Frontend 1019 PASS, backend 1327 PASS / 26 dependency FAIL.
- 185 qaror va 45 forward + 2 rollback SQL saqlandi. Vite/PG/real brauzer/Telegram E2E NOT_RUN; production-ready emas.
- Dalillar: `docs/v123-185-location-search-booking-evidence.md`.


## v124 / 185 qaror — xaritadan profilga va bron bo‘limiga o‘tish (2026-11-20)

- #3/#164 popup profil havolasi va oldingi qidiruv holatini qaytarish.
- #42 xaritada faqat mavjud xizmat bilan bron CTA; tanlangan xizmat IDsi mos bo‘lgandagina uzatiladi.
- #164 xaritada koordinata bo‘lmasa ro‘yxatga qaytish; no map pin fabrication.
- #16 xarita tile xatosida ro‘yxatga qaytish; masofa filtri uchun manzil yo‘qligi aniq ko‘rsatiladi.
- #16 katalog API javobi `no-store`, yangi backend isolated 2 test.
- Frontend 1034 PASS, backend 1329 PASS / 26 dependency FAIL; barcha real PG/build/mobil/Telegram E2E NOT_RUN.
- 185 asl CSV va 45+2 SQL saqlandi. Batafsil: docs/v124-185-map-booking-evidence.md.


## v125 / 185 qaror — bron tafsilotida kontakt, manzil va navigatsiya (2026-11-20)

- #174 customer-only owner-scoped booking list/detailga barber manzili, koordinatalari va telefon manbasi qo‘shildi.
- #159 customer phone backend SELECTga kiritilmadi va customer frontend modelda tasodifiy customer_phone olib tashlanadi.
- #141 Google/Yandex/2GIS/OpenStreetMap havolalari validatsiyalangan koordinatalar asosida.
- #174 mavjud bo‘lmagan manzil/telefon uchun hech qanday link yaratilmaydi.
- #58 mobil aloqa tugmalarining joylashuvi yaxshilandi.
- Yangi frontend/back testlar, asl 185 CSV va 45+2 migratsiyalar baytma-bayt o‘zgarmagan; docs/v125-185-booking-contact-navigation-evidence.md.
- Real DB, npm, Vite, mobil Chrome va Telegram E2E hali bajarilmadi; production-ready emas.


## v126 / 185 qaror bo‘yicha bronni xavfsiz o‘qish (2026-11-20)

Manba v125 ZIP, 7 vazifa: customer GET list/detail va services GET’da eski sessiya javobi bloklanadi; xizmat katalogi owner/duplicate/active validatsiyadan o‘tadi; faqat ruxsat etilgan booking maydonlari UI’da saqlanadi; backend owner profile ID fail-closed; services GET no-store. Frontend **1053/1053 PASS**, backend **1350 PASS / 26 oldingi dependency FAIL**. 185 CSV va 47 SQL migratsiya o‘zgarmadi. Vite build `vite: not found`, real PG/browser/Telegram NOT_RUN. **Production-ready emas.** Tafsilotlar `docs/v126-185-booking-read-session-privacy-evidence.md`. Keyingi asos `USTARA-v126-185-Booking-Read-Privacy.zip`.


## v127 / 185 qaror — bron tarixi va receipt yaxlitligi (2026-11-20)

#17/#37/#52/#87: kelgusi bronlar faqat kelajak sanalari, muddati o'tgan confirmed/pending tarixda haqiqiy holat bilan; cancel faqat bron boshlanguncha va cutoff ichida; noto‘g‘ri xizmatlar uchun rebooking URL xavfsiz; server receipt start/end/duration tekshiriladi va noto‘g‘ri sanalar bloklanadi; 60 soniyada tab count yangilanadi. Frontend **1068 PASS / 0 FAIL**, backend **1350 PASS / 26 eski dependency FAIL**. **185 CSV va 47 SQL o‘zgarmagan**, real PostgreSQL, Vite build, brauzer/Telegram **NOT_RUN**; production-ready emas. Manba `USTARA-v127-185-Booking-Timeline-Receipt-Guard.zip`. Batafsil `docs/v127-185-booking-timeline-receipt-evidence.md`.

## v128 / 185 qaror — profil xatosini yuborish va admin moderatsiyasi (2026-11-20)

#178/#49/#83: mijozning tasdiqlangan sartarosh profilidagi xatoni tanlangan sabab va 10–500 belgili izoh bilan yuborishi; takroriy faol xabar uchun partial UNIQUE; `profile_issue_reports` yangi 46-chi forward migratsiya; admin-only 100 xabar ro‘yxati va `resolved`/`dismissed` review (qayta review 409). Mijoz telefonlari admin hisobotida chiqmaydi. Ommaviy profil formasi va Admin panel yangi bo‘limi qo‘shildi. **Frontend 1078 PASS**, backend **1362 PASS / 26 eski dependency FAIL**. Offline npm ENOTCACHED, Vite NOT_FOUND, PostgreSQL/Chrome/Telegram NOT_RUN. Original 185 CSV va avvalgi 45+2 SQL o‘zgarmagan; qo‘shimcha 1 migratsiya bor. **Production-ready emas**. Yangi arxiv `USTARA-v128-185-Profile-Issue-Reports.zip`, batafsil `docs/v128-profile-issue-report-evidence.md`.


## v129 / 185 qaror — profil shikoyati uchun moderatsiya navbati (2026-11-20)

#178/#49/#83/#159: `GET /api/admin/profile-reports` ga status filtri va 100 tadan sahifalash, server allowlist, admin UI filtri/navigatsiya, request abort+session guard, barber profili almashganda xabar formasi cleanup, review receipt tasdig‘i va no-auto-retry siyosati. **Frontend 1087 PASS, backend 1373 PASS / 26 eski dependency FAIL**. 185 CSV va avvalgi 46 forward + 2 rollback SQL o‘zgarmagan, yangi migratsiya YO‘Q. Npm EAI_AGAIN/ENOTCACHED, Vite BUILD NOT_RUN, PG/browser/Telegram NOT_RUN; production-ready YO‘Q. Batafsil: `docs/v129-185-profile-issue-queue-evidence.md`.


## v130 / 185 qaror — shikoyat holati va moderatsiya navigatsiyasi (2026-11-20)

#178/#49/#83: authenticated customer own pending reason GET (`/api/barbers/:id/profile-report/status`), UI guard/dedup, profile/session abort; admin 101-sentinel pagination (100 visible), stricter params/response validation and review unknown-outcome response. **Frontend 1097/1097 PASS**, backend **1385 PASS / 26 eski dependency FAIL**; yangi **10 frontend + 12 backend tests PASS**. 185 original CSV va 46 forward+2 rollback SQL o‘zgarmadi. Real PG, Vite build, mobil va Telegram E2E tasdiqlanmagan; production-ready YO‘Q. Batafsil `docs/v130-185-profile-issue-status-evidence.md`.


## v131 / 185 qaror — kuzatilgan sartaroshlar Home boshida (#38; 2026-11-20)

Bosh sahifada tasdiqlangan katalog bilan kesishgan kuzatuvlar alohida birinchi bo‘limga olib chiqildi (eng ko‘pi 6 ta, qolganlar katalogda); bron CTA faqat xizmat bo‘lsa. Social follow/reklama ID whitelist, account/token swap abort + render-time guard, retry va qisman so‘rov xatolari ko‘rsatildi. **Frontend 1110/1110 PASS**, backend **1385 PASS / 26 eski missing-dependency FAIL**. Asl 185 CSV va 46+2 SQL migratsiya baytma-bayt saqlandi. Real PostgreSQL, npm ci, Vite build, Chrome/Telegram E2E hali tasdiqlanmagan; production-ready emas. Batafsil: `docs/v131-185-followed-home-safety-evidence.md`.


## v132 / 185 qaror — sartaroshlarni 2–3 ta solishtirish (2026-11-20)

Asos v131 (1080 fayl); #95/#16/#94/#143 uchun tanlab solishtirish (2–3 ta), ID/filtr/xizmat oldi himoyasi, aniq xizmat narxi va ko‘rsatilmagan ma’lumotni yashirmaslik, masofa/review faqat ma’lum bo‘lsa, profil/bron linklari, mobil accessibility. 16 yangi frontend unit-test; frontend 1126 PASS, backend unit 1385 PASS/26 eski dependency FAIL. Offline npm ci ENOTCACHED, Vite build BLOCKED, PostgreSQL/browser/Telegram NOT_RUN. 185 original qaror CSV va 46 forward+2 rollback SQL o‘zgarmadi. Production-ready YO‘Q. Dalil: `docs/v132-185-barber-comparison-evidence.md`.


## v133 / 185 qaror — #93 ommaviy profilni mijoz ko‘rinishida tekshirish (2026-11-20)

Asos v132 (1084 fayl), sartarosh Profil/Portfolio/Dashboard'dan haqiqiy ommaviy guest sahifaga xavfsiz o‘tish, approved/current-account/readiness ID cheklovi, saqlanmagan tahrir ogohlantirishi, nom/manzil/xarita/About/xizmat/ish vaqti/post 7 ta ready/unknown holati, guest yo‘lida barber JWT uzatilmasligi va a11y/mobil UI. Frontend 1143 PASS (17 yangi), backend 1385 PASS /26 oldingi dependency FAIL. Original 185 CSV va 46+2 SQL saqlandi; npm ci ENOTCACHED, Vite, real PostgreSQL, browser/mobile, Telegram E2E NOT_RUN. Production-ready YO‘Q. Dalil: `docs/v133-185-public-preview-evidence.md`.


## v134 / 185 qaror — #107 ommaviy profil havolasi va #165 ulashish qisman (2026-11-20)

Asos v133 (1088 fayl). Guest public kanonik `/barbers/:id` link, ID va origin tekshiruvi, shaxsiy token/telefon/draft/bron ma’lumotini ulashmaslik, mobile Web Share → clipboard → manual fallback, owner approved guard, stale async result himoyasi va 16 yangi test. Frontend 1159 PASS, backend 1385 PASS / 26 eski dependency FAIL. Original 185 qaror CSV va 46+2 SQL saqlangan. **Telegram/WhatsApp dinamik OG kartochka mavjud emas**, Vite build, PG, browser E2E bajarilmadi; #165 QISMAN, production-ready emas. `docs/v134-185-profile-sharing-evidence.md`.


## v135 / 185 qaror — #165 Smart Link Preview server implementatsiyasi (2026-11-20)

Asos v134 (1092 fayl). Approved-only public SQL dan Open Graph va Twitter Card HTML, maxfiy ma’lumotlardan xoli statik JPEG, qat’iy ID/HTTPS konfiguratsiya va XSS escaping. Vite frontend faqat `VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN` sozlanganda bot HTML havolasini ulashadi. Yangi 17 backend + 9 frontend test PASS; frontend umumiy 1168 PASS, backend 1402 PASS / 26 eski dependency FAIL. CSV 185 va 46+2 SQL o‘zgarmagan. Haqiqiy Telegram crawler, PostgreSQL, Vite build, mobile E2E **NOT_RUN**; #165 **QISMAN**, production-ready emas. `docs/v135-185-smart-link-preview-evidence.md`.


## v136 / #165 Smart Link Preview fallback & preflight (2026-11-20)

Vite GitHub Pages `/USTARA-New/` subpath fallback fixed without exposing token/search params; strict path validator and safe Unicode sharing text. OG image alt/type/secure_url tags added. Offline read-only 6-check deployment preflight (`READY_FOR_LIVE_VERIFICATION` is not deployment success). 11 new frontend + 10 backend tests; full regressions separately recorded in checkpoint. Original 185 CSV and 46+2 SQL preserved. Real HTTPS/Telegram/PostgreSQL/Vite build: NOT_VERIFIED; #165 QISMAN, production-ready emas. `docs/v136-185-preview-deployment-preflight-evidence.md`.


## v137 / 185 qaror — Smart Support va kontekstual yordam (#74/#75/#78; 2026-11-20)

Ommaviy /help route, 8 lokal FAQ, O‘zbek apostrof qidiruvi va kategoriya filter, allowlist topic deep-link, guest/customer/barber navigatsiya yordam havolalari, 3 qadam ixtiyoriy ko‘rsatma, mobil/a11y. **19 yangi frontend test PASS**, umumiy frontend 1198 PASS; backend 1412 PASS / 26 eski dependency FAIL. Original 185 CSV, 46+2 SQL saqlangan. npm ci ENOTCACHED, Vite build NOT_RUN, PG/Chrome/mobile NOT_RUN. Bu *AI chat emas*, statik yordam. Production-ready emas. Dalil: `docs/v137-185-help-center-evidence.md`.


# USTARA — latest checkpoint v138 (2026-11-20)

**Asos:** `USTARA-v137-185-Smart-Support-Contextual-Help.zip` — 1108 fayl; SHA-256 `88fe8510aeaaadf17babf8f0d7ffdb8ae29f92db7a1bb06bef1838c44fbb2906`. Bu bosqichda 185 reyestridagi **#76: o‘zbek, rus, ingliz tillari va Admin tarjimasi** talabi bo‘yicha **faqat ommaviy `/help` qismi** uch tilga moslashtirildi. #76 **QISMAN**, butun sayt yoki Admin paneli tarjima qilinmadi.

## Bajarilgan 7 ta vazifa

1. **8 FAQ × 3 til:** avvalgi 8 ta o‘zbekcha savol saqlanib, rus va inglizcha savol, javob, kalit so‘z hamda havola matnlari qo‘shildi. Mavjud xizmatlar doirasidan chiqilmaydi.
2. **Til tanlash:** `/help` yuqorisiga oddiy `select` orqali O‘zbekcha/Русский/English tanlovi; `lang` atributi, klaviatura focusi va mobil joylashuv qo‘shildi.
3. **Xavfsiz URL:** `?lang=ru` va `?lang=en` oq ro‘yxat bilan qabul qilinadi; takroriy, noto‘g‘ri yoki `__proto__` kabi qiymatlar o‘zbekchaga qaytadi. Til tanlanganda eski qidiruv so‘zi tozalanadi.
4. **Mahalliylashtirilgan boshqaruvlar:** sarlavha, kategoriya, tugma, xato/bo‘sh qidiruv holati, maxfiylik eslatmasi va hisoblagich matnlari tarjima qilindi.
5. **Uch tilli qidiruv:** foydalanuvchi tanlagan tildagi savol, javob va kalit so‘zlar bo‘yicha lokal qidiruv ishlaydi; izlanayotgan matn serverga yuborilmaydi.
6. **Deep-link va onboarding:** `topic` va `lang` havolada birga saqlanadi, ixtiyoriy 3 bosqichli yo‘riqnoma ham tarjima qilindi; mavjud o‘zbekcha eski `/help?topic=...` havolalar buzilmaydi.
7. **Regressiya va yaxlitlik:** 25 ta yangi unit/kontrakt testi, eski 19 ta help testi, barcha frontend testlari, backend unit-testlari, JSX parser, ZIP va 185 qaror/SQL migratsiya auditi.

## Haqiqiy lokal test natijalari

- `frontend: node --test test/*.test.js` → **1223 PASS / 0 FAIL / 0 SKIP / 0 TODO**.
- `frontend: node --test test/v138HelpLanguages.test.js` → **25 PASS / 0 FAIL**.
- `backend: node --test --test-concurrency=8 test/*.unit.test.js` → **1412 PASS / 26 FAIL**, 0 SKIP/TODO; **26 FAIL nomlari v137 bilan bir xil**. Asosan o‘rnatilmagan dependencylar bilan bog‘liq. Backend kodi bu bosqichda o‘zgarmadi.
- `node --check helpModel.js`, `node --check helpTranslations.js` va global TypeScript JSX parser (`HelpCenter.jsx`): **PASS**, 0 parser error.
- `npm ci --offline --ignore-scripts` frontend/backend: **ENOTCACHED**; `npm run build`: **vite: not found**.
- `docs/USTARA_185_NAZORAT.csv`: **185 qaror**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`; **o‘zgarmagan**. 46 forward + 2 rollback SQL **o‘zgarmagan**.

## Cheklovlar

- #76 **faqat HelpCenter UI** uchun qisman ishladi. Admin tarjima vositasi, saytning qolgan qismlari, tilni akkauntda saqlash va server email/SMS/Telegram tarjimalari **bajarilmadi**.
- `lang` tilda UI maslahatini o‘zgartiradi, login/booking marşrutlarini avtomatik tarjima qilmaydi; mavjud havolalar saqlangan.
- Vite build, haqiqiy Chrome/mobil test, PostgreSQL integratsiyasi, Telegram E2E **NOT_RUN/BLOCKED**. **Production-ready: YO‘Q**.

## Keyingi v139

1. Ishlaydigan npm registry/cache muhitida `npm ci`, `vite build` va real brauzerning `/help?lang=ru` / `?lang=en` deep-link sinovini bajarish.
2. Alohida `ustara_test_db` bilan ilgari qo‘shilgan bron, QR va profil shikoyatlari SQL integratsiyasini sinash (ishchi DB’ga ulanmaslik).
3. 185 qarordan keyingi amalga oshirilmagan talablardan yana 7 tasini muvofiqlashtirib bajarish; #76 Admin tarjimasi va umumiy i18n keyingi alohida dizayn bosqichi.

## v139 / 185 qaror — Admin til tanlash va qisman tarjima (2026-11-20)

Asos: v138 (1111 fayl). #76 talabi uchun Admin login, o‘nta navigatsiya bo‘limi, umumiy statistika va profil xatolari moderatsiya interfeysi uz/ru/en tillariga moslashtirildi. `?lang` ruxsatli va takrorlanmagan bo‘lishi shart; noto‘g‘ri qiymat uzbekchaga qaytadi. Tilni almashtirish autentifikatsiya holatini, API ID'larini yoki SQL ma'lumotlarini o‘zgartirmaydi. Mobil CSS va 15 ta yangi test qo‘shildi.

**Test dalillari:** frontend **1238/1238 PASS**, backend **1412 PASS / 26 eski dependency FAIL**, JSX/JS sintaksisi PASS; `npm ci --offline` ENOTCACHED, Vite build `vite: not found`. 185 qaror va 46+2 SQL byte-to-byte saqlangan. Haqiqiy PG/Chrome/Telegram E2E bajarilmadi. #76 **QISMAN**, production-ready **YO‘Q**. Keyingi bosqichda Admin qolgan amallarini tarjima qilish va build/PG sinovlarini alohida muhitda bajarish.

## v140 / 185 qaror — Admin operatsion UI uch tilda (#76, 2026-11-20)

Asos v139 (1114 fayl). Admin foydalanuvchilar, sartaroshlar, bronlar, post shikoyatlari, akkaunt tiklash, reklama, QR va Telegram diagnostikasi UZ/RU/EN formatiga moslashtirildi. API status/rol/so‘rov identifikatorlari o‘zgartirilmadi. 20 yangi frontend test PASS; jami frontend 1258 PASS, backend 1412 PASS /26 oldingi FAIL. 185 CSV SHA-256 va 46 forward+2 rollback SQL saqlangan. npm ci offline ENOTCACHED, Vite build NOT_RUN (`vite: not found`), real PG/mobile/Telegram NOT_RUN. **#76 QISMAN**, production-ready EMAS. Dalil: `docs/v140-admin-operational-languages-evidence.md`.

## v141 / 185 qaror — #76 navigatsiya va umumiy shellni uch tilga moslash (2026-11-20)

Asos v140 (1117 fayl). #76 uchun 7 ish: (1) xavfsiz allowlist locale + ichki havola, (2) ommaviy Navbar, (3) Footer, (4) mijozning 5 tabi, (5) bron bildirishnoma qobig‘i, (6) sartaroshning 5 tabli menusi, (7) Help ichki havolalarida tilni saqlash. Tillar: uz/ru/en. Yangi 18 test PASS, to‘liq frontend **1276 PASS**, backend unit **1412 PASS / 26 avvalgi dependency FAIL**. JSX parser PASS. Original 185 qaror va 46+2 migratsiya SQL saqlandi. `npm ci --offline` ENOTCACHED, Vite build `vite: not found`, PostgreSQL/browser/mobile NOT_RUN. #76 QISMAN, production-ready YO‘Q. Dalil: `docs/v141-site-shell-languages-evidence.md`.

## v142 / 185 qaror — #76 mijozning Home, Explore va bron UI uch tilda (2026-11-20)

Asos v141 (1121 fayl). UZ/RU/EN uchun yagona customer core copy, Home qidiruvi va kuzatilganlar, uslub galereyasi, Explore filtrlar/kartalar/solishtirish, bronning 7 kunlik ko‘rinishi va tasdiqlash oynasi asosiy matnlari tarjima qilindi. Til almashtirilganda faqat to‘g‘ri ommaviy filterlar va xizmat tanlovi saqlanadi; OTP/tokenlar yo‘qotiladi. **13 yangi test PASS, frontend 1289 PASS, backend unit 1412 PASS / 26 oldingi FAIL**. Original 185 CSV va 46+2 SQL byte-to-byte saqlandi. `npm ci --offline` ENOTCACHED, Vite build `vite: not found`, real PG/browser/Telegram NOT_RUN. #76 QISMAN, production-ready YO‘Q. Dalil: `docs/v142-customer-core-languages-evidence.md`.


## v143 / 185 qaror — #76 auth, OTP va ommaviy profil UZ/RU/EN (2026-11-20)

Asos v142 (1124 fayl). 7 ishda auth UI/language selector, Login, RegistrationForm, 5-digit OTP UI va xabarlar, ommaviy sartarosh profil tablari/statuslari va xavfsiz tilga mos navigatsiya yangilandi. OTP expiry, qayta yuborish va backend auth/booking mantiqi o‘zgarmadi. **19 yangi test PASS, frontend 1308 PASS, backend unit 1412 PASS /26 avvalgi FAIL**, JSX parser PASS. Vite build `vite: not found`, haqiqiy PG/Chrome/Telegram NOT_RUN. 185 qaror va 46+2 migratsiya o‘zgarmagan; #76 QISMAN, production-ready YO‘Q. Dalil: `docs/v143-auth-otp-public-profile-languages-evidence.md`.

## v144 / 185 qaror — #76 hisobni tiklash va ichki profil UI tillari (2026-11-20)

Asos v143 (1128 fayl). ForgotPassword, AccountRecovery, CompleteProfile, mijoz profili va sartaroshning dastlabki ish joyi/ish vaqtini belgilash oynalaridagi UZ/RU/EN ko‘rinishlar yangilandi. OTP/15 daqiqalik ro‘yxatdan o‘tishni yakunlash, API payloadlar va server tekshiruvlari o‘zgarmadi. **23 yangi test PASS**, jami frontend **1331 PASS**, backend unit **1412 PASS / 26 eski FAIL**. Asl 185 CSV va 46+2 migratsiyalar saqlandi. Vite `vite: not found`, real PG/mobil brauzer NOT_RUN. **#76 QISMAN, production-ready EMAS**. Dalil: `docs/v144-account-profile-inner-languages-evidence.md`.

## v145 / 185 qaror — #76 hisob xavfsizligi va sartarosh profil matnlari (2026-11-20)

Asos v144 (1131 fayl). Telefon almashtirish, qurilmalar, barcha sessiyalardan chiqish, vaqtincha deaktivatsiya, sartarosh profilini tahrirlash, haftalik ish vaqti va Telegram bog‘lash ekrani UZ/RU/EN tillariga moslashtirildi. `accountLocaleV145.js` qo‘shildi, eski Telegram request-helper test loaderi faqat UI importlari uchun moslashtirildi. API request body/statuslari, OTP, SQL va backend fayllar o‘zgarmadi. Yangi **19 test PASS**, frontend **1350/1350 PASS**, backend **1412 PASS / 26 eski FAIL**, JSX/JS parser PASS. Vite `vite: not found`; real PG/mobil/Telegram **NOT_RUN**. #76 **QISMAN**; production-ready **EMAS**. Dalil: `docs/v145-account-security-barber-languages-evidence.md`.


## v146 / 185 qaror — #76 sartarosh operatsion oynalari UZ/RU/EN (2026-11-20)

Asos v145 (1134 fayl). 7 ish: xizmatlar/narx/davomiylik; portfolio va post formasi; jadval va bron qabul qilish; maxsus kalendar; haftalik/sanali tanaffuslar; bekor qilish siyosati; ommaviy profil oldindan ko‘rish. Rus/ingliz/uzbek matnlari, faqat ommaviy xavfsiz `lang` parametri saqlanadi. Server rol, API, 5-minut narx/vaqt, SQL va muhim biznes qoidalari o‘zgartirilmadi. Yangi 18 test PASS, frontend **1368 PASS**, backend **1412 PASS / 26 oldingi FAIL**. Asl CSV/55 SQL byte-to-byte saqlandi. Vite `vite: not found`; haqiqiy PG/mobile/Telegram NOT_RUN. #76 QISMAN, production-ready EMAS. Dalil: `docs/v146-barber-operations-languages-evidence.md`.


## v147 / 185 qaror #76 — daromad, statistika, sharhlar, bronlar, navbat (2026-11-20)

v146 arxiv asosida 7 ish: dashboard, earnings analytics, reviews/replies, bookings, booking cards, QR/FIFO/open-slot navbat, kun yakuni audit/tasdiqlari. Yangi tarjima manbasi + 39 yangi test. Frontend **1407/1407 PASS**, backend **1412 PASS / 26 eski FAIL**. Barcha 185 qaror CSV, SQL migratsiyalar va backend manba saqlangan. Vite build bloklangan (`vite: not found`); haqiqiy PG/browser/Telegram NOT_RUN. Production-ready emas. Dalil: `docs/v147-barber-insights-queue-languages-evidence.md`.


## v148 / 185 qaror #76 — mijoz bronlari, muqobil vaqtlar, xarita va Ilhom (2026-11-20)

v147 asosida 7 ish: bron filtrlari, bron kartasi, reschedule, xavfsiz bekor qilish va muqobil vaqtlar, xarita, Ilhom lentasi, xavfsiz tilni almashtirish. 21 yangi frontend testi bilan jami **1428/1428 PASS**; backend **1412 PASS / 26 oldingi FAIL**, ayni muhitda v147 bilan nosozlik nomlari bir xil. v147 ning barcha 185 qaror CSV, SQL va backend fayllari saqlangan. Vite build `vite: not found` va offline `npm ci` ENOTCACHED sabab bajarilmadi; PG/browser/Telegram E2E NOT_RUN. Production-ready emas. Dalil: `docs/v148-customer-journeys-languages-evidence.md`.


## v149 / 185 qaror #76 — Ilhom postlari va QR mijoz oqimi uch tilda (2026-11-20)

v148 asosida 7 ish: Composer media/AI, PostCard, MediaGallery, QR check-in, Smart Booking/Telegram, ommaviy navbat xulosasi va xavfsiz til yo‘llari. 157 ta UZ/RU/EN UI nusxa; 61 yangi frontend testi PASS, jami **1489 PASS**, backend **1412 PASS /26 avvalgi FAIL**. 185 CSV va 55 SQL, 491 backend fayli saqlangan. npm registry EAI_AGAIN, offline ENOTCACHED, Vite `vite: not found`, PostgreSQL/browser/Telegram NOT_RUN. **#76 QISMAN**; production-ready EMAS. Dalil: `docs/v149-social-qr-languages-evidence.md`.


## v150 — GitHub Pages loading resurslari va dependency-free release preflight (2026-11-20)

7 ish: loading.css, favicon, bootstrap logo `%BASE_URL%` prefiksi; source HTML/CSS/router/Vite-base preflight; package-lock va real o‘rnatilgan Vite diagnostikasi; CI oldin/keyin fail-closed gate; compiled artifact loader, logo va 404 fallbacks; 26 yangi maqsadli test. **Frontend 1507/1507 PASS**; backend **1420 PASS / 26 eski FAIL**, no new backend regressions. `npm ci --offline`: ENOTCACHED, Vite build: `vite: not found`; real browser/DB/Telegram NOT_RUN. **Production-ready emas**. 185 qaror va 55 SQL baytma-bayt saqlandi. Dalil: `docs/v150-pages-bootstrap-readiness-evidence.md`.


## v151 — first-paint UZ/RU/EN, hujjat tili va Pages locale gate (2026-11-20)

v150 asosida 7 ish: paket talab qilmaydigan initial locale shell, loader matnlari, React hujjat tili, xavfsiz route title, description, preflight/publish-tree gate va haqiqiy Chrome E2E ga til tekshiruvlari. Yangi 29 frontend + 7 backend test PASS. **Frontend 1536/1536 PASS**; backend **1427 PASS / 26 eski FAIL** (v150 bilan nomma-nom bir xil). Vite build bloklangan, npm DNS `EAI_AGAIN`, offline cache `ENOTCACHED`; Chrome localhost `ERR_BLOCKED_BY_ADMINISTRATOR`; real SPA/PG/Telegram E2E NOT_RUN. 185 qaror va 55 SQL saqlangan. #76 QISMAN. Production-ready emas. Dalil: `docs/v151-document-locale-first-paint-evidence.md`.


## v152 — offline dependency audit, real-build gate va localized first-paint VM (2026-11-20)

v151 asosida 7 ish: locked npm tarball SHA-512/origin audit; Vite/plugin Node engine; 17 direct dependency tekshiruvi; Vite binary va `--require-installed`; browserless real UZ/RU/EN bootstrap smoke; CI pre/post install gate; 38 yangi unit-test. **Frontend 1568/1568 PASS**, backend **1433 PASS / 26 eski FAIL** (v151 bilan aynan bir xil). Source/lock/runtime PASS, ammo 0/17 installed — Vite build `vite: not found`, offline npm ENOTCACHED. Chrome/PG/Telegram real E2E NOT_VERIFIED. 185 qaror va SQL o‘zgarmadi. Production-ready emas. Dalil: `docs/v152-build-readiness-first-paint-ci-evidence.md`.


## v153 — GitHub Pages image fix, dependency-free source graph va 185 qaror status audit (2026-11-20)

v152 asosida mijoz galereyasining root-absolute URL xatosi BASE_URL orqali tuzatildi. 176 JS/JSX, 31 CSS va 587 local importni tekshiruvchi offline source graph CI ga qo‘shildi. 185 CSV SHA-256 asosida 130 tekshiruv kerak, 47 qisman, 7 keyinga qoldirilgan/bekor, 1 bloklangan/other; asl reyestrga tegilmadi. 19 frontend + 10 backend yangi test PASS; to‘liq frontend **1587/1587 PASS**, backend unit **1443 PASS /26 oldingi FAIL**. Vite `vite: not found`, offline npm ENOTCACHED, production/browser/PG/Telegram NOT_RUN. **Production-ready emas.** Dalil: `docs/v153-source-graph-decision-progress-evidence.md`.


## v154 — QR GitHub Pages routing va offline CI contract (2026-11-20)

v153 asosida QR orqali navbatga kirish URLi Vite `BASE_URL` (`/USTARA-New/`) bilan moslashtirildi; UZ/RU/EN query saqlanadi, eski root so‘rovlar ham ishlaydi. Server origin/CORS va QR path/locale qat’iy validatorlarini o‘zgarmas SQL/TTL/hash/FIFO bilan himoyaladi. Package-free QR contract CI preinstall gate va 33 yangi unit-test PASS. Full frontend 1604/1604 PASS, backend 1459 PASS/26 oldingi FAIL. Vite build ENOTCACHED/vite not found sabab NOT_RUN; real PostgreSQL/QR browser/Telegram NOT_RUN; production-ready emas. Dalil: `docs/v154-qr-pages-route-integrity-evidence.md`.


## v155 — yetti muhim qaror dalillari va production QR/Help smoke (2026-11-20)

Asl 185 qaror o‘zgartirilmagan; #5/#6/#27/#75/#76/#107/#165 uchun source/test izlari topildi (NOT production verification). CI preinstall gate va Chrome dist smoke ichiga QR/Help deep linklar qo‘shildi, 21 yangi test PASS. Frontend 1609/1609, backend 1475 PASS/26 avvalgi FAIL. Npm offline ENOTCACHED, Vite build NOT RUN, PostgreSQL/Chrome/Telegram real integratsiya NOT RUN. Source dalil: `docs/v155-critical-flow-release-evidence.md`.


## v156 — complete unit-matrix gate va yana 7 source trace (2026-11-20)

Backend/frontend testlar sonini kamaytirib yuboradigan muvaffaqiyatli TAP reliz bo‘lib ketmasligi uchun `v156-unit-coverage.js` source/runner/TAP nazoratini CI preinstall, posttest va release gate ga qo‘shdi. 14/185 qarorning kod/test manbalari izlangan, 171 hali izlanmagan; barchasi production bo‘yicha NOT_VERIFIED. 23 yangi backend test PASS; frontend 1609/1609 PASS, backend 1498 PASS/26 avvalgi FAIL. Vite, PostgreSQL, Chrome, Telegram E2E NOT RUN. Dalil: `docs/v156-full-unit-matrix-and-seven-source-traces.md`.

## v170 — #102–#108 bron check-in, sartarosh tasdig'i va manba auditi (2026-11-21)

v169 ZIP asosida: #102 uchun mijoz kelganini bildirishi va faqat o'z sartaroshi buni tasdiqlashi mumkin bo'lgan alohida DB/API/UI qo'shildi (status/vaqtga ta'sir qilmaydi). 53-forward migratsiya va verify inventory yangilandi, lekin SQL real bazaga bajarilmadi. #103–#108 manbalari audit qilindi; #107 avvalgi indeksdan hisoblandi, #108 `ustara.uz/@username` HALI YO'Q. Jami 109/185 source trace, 76 indekslanmagan. 13/13 yangi test, 1660/1660 frontend, backend 1620/1649 (29 avvalgi dependency FAIL), source graph PASS. Haqiqiy DB/CI/browser/Telegram NOT_RUN. Dalil: `docs/v170-seven-checkin-profile-decisions.md`.


## v210 — PostgreSQL CI subprocess-tree containment (2026-11-21)

v209 ZIP asosida: POSIX Node test jarayoni alohida process group, timeout/TAP/stderr limitida group kill va 1.5 sekundlik close watchdog. 8 ta yangi offline regression-test (jumladan 3 ta haqiqiy parent/grandchild holati), **149/149 PASS**. Manual GitHub Actions workflow v210 unit-testni bajaradi; source biznes funksiyalari va 185 qaror reyestri o‘zgarmagan. Haqiqiy PostgreSQL/Docker va GitHub Actions/production NOT_RUN; kod repoga yuborilmadi. Dalil: `USTARA_v210_PROCESS_GROUP_CONTAINMENT_HISOBOT.md`; keyingi asos: `USTARA-v210-Postgres-Process-Group-Containment.zip`.

## v223 — real deployni tekshirish uchun read-only readiness (2026-11-21)

v222 ZIP asosida 15 asosiy jadval uchun `/api/ready` va Cloudflare/Render uchun 6 public smoke tekshiruv qo‘shildi; yozuvchi DB sinovi yo‘q. Tafsilot: `USTARA_v223_LAUNCH_READINESS_HISOBOT.md`. Haqiqiy hosting/DB/Telegram E2E NOT_RUN.
