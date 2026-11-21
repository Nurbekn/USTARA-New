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

# USTARA v49 — testlarni bajarish bo‘yicha qo‘llanma

v49 arxivni maxfiy `.env` va tokenlarsiz saqlaydi. Testlar uchun alohida mashina / ajratilgan database ishlating. Production bazasini ishlatmang.

```bash
cd USTARA-New/backend
npm ci
npm run test:v49:unit
npm run test:unit
npm run audit:phase1
npm run v45:decisions
```

Frontend (alohida terminal):

```bash
cd USTARA-New/frontend
npm ci
npm test
npm run build
```

**Real PostgreSQL lock test** faqat lokal `ustara_test_db`, `ustara_account_test` roli va maxsus ruxsat bilan; PG roli superuser bo‘lmasin, public applar ma’lumoti o‘zgartirilmaydi. Test izolyatsiya qilingan `test_v49_consent_*` sxema yaratib, faqat o‘zi yaratgan sxemani o‘chiradi.

```bash
cd USTARA-New/backend
export NODE_ENV=test
# USTARA_TEST_DATABASE_URL ni maxfiy environment orqali o‘rnating; repo/ZIP ichiga yozmang.
export USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING
export USTARA_V46_STAGING=I_AUTHORIZE_LOCAL_STAGING
export USTARA_V49_STAGING=I_AUTHORIZE_LOCAL_STAGING
npm run test:v49:db
```

Runner 7 ta real PG test faylini tekshiradi; `SKIP`, `TODO`, `FAIL` yoki noto‘liq TAP hisobotini **PASS** deb hisoblamaydi. PostgreSQLni ishga tushirish huquqi bu muhitda yo‘q edi: v49 test **SKIP**, production/deploy uchun ruxsat emas.

Mobil browser E2E va Telegram xabar yuborish sinovlari hamon alohida sinov infratuzilmasini talab qiladi. Telegram exact-once delivery kafolatlanmaydi.
