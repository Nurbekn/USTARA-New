# v80 — Test runbook

## Internet va PostgreSQL talab qilmaydigan sinovlar
```sh
cd USTARA-New/backend
npm run test:v80:unit
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ..
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
cd frontend
node --test test/*.test.js
```

## Hammasini o‘rnatilgan npm paketlari bilan sinash

`backend` va `frontend` papkalarida mustaqil ravishda `npm ci` bajarib, backend uchun `node --test test/*.unit.test.js`, frontend uchun `npm run build` bajaring. `npm ci` o‘rnatilmagan holatda `MODULE_NOT_FOUND` test muvaffaqiyati emas.

## Faqat maxsus lokal test PostgreSQL bazasida

`ustara_test_db`, faqat test fixture uchun chiqarilgan `ustara_account_test` (superuser emas), 42 ta migratsiya, oldindan tasdiqlangan test data bo‘lishi shart. Live / production database va odamlarning ma’lumotlarida ishlatmang. Haqiqiy login parolini Git/ZIPga yozmang.

```sh
cd USTARA-New/backend
NODE_ENV=test \
USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_TEST_DATABASE_URL='postgres://ustara_account_test:REPLACE_WITH_TEST_PASSWORD@127.0.0.1:5432/ustara_test_db' \
npm run test:v80:db
```

Izolatsiyalangan test DB yo‘q bo‘lsa, natija NOT_RUN hisoblanadi. PostgreSQL integration script/test fixture deletion faqat test bazasida ishlatilishi kerak. COMMIT result uncertainty real network fault injection bilan alohida tekshirilishi kerak.
