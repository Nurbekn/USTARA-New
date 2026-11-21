# USTARA v97 — test yo‘riqnomasi

## Avtomatik va offline (hozir bajarilgan)

Loyiha ildizidan:

```bash
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
npm --prefix frontend run test:v97:unit
npm --prefix backend run test:v97:unit
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
```

26 ta `MODULE_NOT_FOUND` backend testi NOT PASS, dependency o‘rnatishni talab qiladi.

## Faqat maxsus izolyatsiyalangan lokal PostgreSQL test DB

**Quyidagi buyruqlar real foydalanuvchi bazasiga qo‘llanmaydi.** Avval disposable `ustara_test_db`ni yangi test foydalanuvchisi `ustara_account_test` orqali yarating va review qilingan 44 migratsiyani shu test bazasida alohida qo‘llang; avtomatik skript buning o‘rniga DDL qilmaydi. Parolni shell tarixida yoki repoda saqlamang; o‘zingizning local secret manager/env orqali bering.

```bash
export NODE_ENV=test
export USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:<TEST_SECRET>@127.0.0.1:5432/ustara_test_db'
export USTARA_V97_QUEUE_READINESS='I_AUTHORIZE_READ_ONLY_TEST'
node backend/scripts/v97-queue-readiness.js
export USTARA_V96_QUEUE_DB_TESTS='I_AUTHORIZE_TEST_DATA'
node --test backend/test/v96QueueArrival.postgres.integration.test.js
```

*Haqqoniy qayd:* v97 tuzilgan muhitda PostgreSQL serveri va `pg` paketi mavjud emas. Yuqoridagi integratsiya testlari bajarilmadi; output **SKIP/NOT_RUN**, **PASS emas**.

## Browser + CI

`npm ci` bajarilib dependencies to‘liq o‘rnatilgandan so‘ng `npm --prefix frontend run build`, devtools va real Chrome/Android E2E tekshirish kerak. Frontend tugma ko‘rinishi unit testlardan tashqari qo‘lda ham tekshirilishi lozim.
