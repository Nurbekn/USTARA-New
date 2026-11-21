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
