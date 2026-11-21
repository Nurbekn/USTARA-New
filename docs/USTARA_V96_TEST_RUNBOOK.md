# USTARA v96 — test buyruqlari

`USTARA-New` ildiz papkasidan Node.js 22+: 

```bash
node --test backend/test/v96QueueArrival.unit.test.js
node --test frontend/test/v96ArrivalLifecycle.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-migration-audit.cjs
node backend/scripts/audit-phase1.js
node backend/scripts/v45-decision-integrity.js
```

**Dependency**: to‘liq backend testlari uchun `cd backend && npm ci`, frontend build uchun `cd frontend && npm ci && npm run build` kerak. Hozirgi muhitda backendning 26 ta dependency FAIL holati qolgan.

## Faqat maxsus PostgreSQL test bazasi

`v96QueueArrival.postgres.integration.test.js` alohida test bazada vaqtinchalik `users`, `barbers`, navbat va audit yozuvlarini yaratib, tozalaydi. Skript production ma’lumotlariga moslab ishga tushirilmasin. Dastlab migratsiyalar va huquqlar test DB'da tekshirilsin. Skriptning ichki `assertTestConnection` test DB nomi va roli uchun qat’iy tekshiruv qiladi; buning o‘rniga production credential ishlatmang.

```bash
cd backend
npm ci
NODE_ENV=test USTARA_V96_QUEUE_DB_TESTS=I_AUTHORIZE_TEST_DATA \
 USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:TEST_ONLY@127.0.0.1:5432/ustara_test_db' \
 node --test test/v96QueueArrival.postgres.integration.test.js
```

Bu faqat **qo‘lda** tasdiqlangan, tashqaridan tayyorlangan izolyatsiyalangan test DB uchun. Real DB bo‘lmasa test SKIP, PASS emas. Web/Chrome/Telegram E2E alohida bajarilishi shart.
