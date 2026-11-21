# USTARA v95 — tekshiruv qo‘llanmasi

Loyiha `USTARA-New` papkasida Node 22+:

```bash
node --test backend/test/v95QueueServiceStarted.unit.test.js
node --test frontend/test/v95QueueServiceStarted.test.js
node --test backend/test/*.unit.test.js
node --test frontend/test/*.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
node backend/scripts/audit-phase1.js
```

`backend/test/*.unit.test.js` uchun `backend/`da `npm ci`, Vite build uchun `frontend/`da `npm ci` kerak. Ularsiz bu muhitda 26 backend dependency FAIL qoldi. Har qanday 26 FAIL production-ready emasligini bildiradi.

## Eslatma: LIVE PostgreSQL (faqat oldindan yaratilgan alohida staging/test DB)

Bu test haqiqiy `users`, `barbers`, `walkin_queue` va audit jadvallariga **vaqtinchalik test yozuvlarini** kiritib, oxirida tozalaydi. Xavfsiz joylashuv va rol nazorati testning `testDatabaseTarget` yordamchisiga bog‘langan. Productionda ishlatmang; migratsiyani avtomatik yaratmaydi. Ajratilgan test bazada 43 migratsiya avval ko‘rib chiqilib qo‘llangan bo‘lishi kerak.

```bash
cd backend
npm ci
NODE_ENV=test \
USTARA_V95_QUEUE_DB_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_TEST_DATABASE_URL='postgres://ustara_account_test:<test-password>@127.0.0.1:5432/ustara_test_db' \
node --test test/v95QueueServiceStarted.postgres.integration.test.js
```

Natija `# skipped 1` bo‘lsa test **PASS emas**, live PostgreSQL hali tasdiqlanmagan. Avval `backend/database/bootstrap.sql` (fresh-only) va yangi `migrations/20261214_walkin_service_started.sql` (existing staging) o‘rtasidagi farqni DBA nazoratida tekshiring; hech qanday schema update chatda avtomatik ishlatilmadi.

Manual E2E: sartarosh mijozni chaqiradi; boshqa tabdan eski holat yuboriladi; `called -> in_service` faqat bir marta yoziladi; takror start replay; `in_service -> missed/left` rad; keyingi chaqiruv served bo‘lmaguncha rad; QR va manual hisobda 'Xizmat boshlandi' ko‘rinadi; xizmat tugatilgach keyingi mijozni chaqirish mumkin.

**Real PG, CI, Vite build va Chrome/Telegram tekshiruvlari bu muhitda bajarilmadi.**
