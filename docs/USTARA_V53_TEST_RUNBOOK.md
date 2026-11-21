# USTARA v53 — QA / PostgreSQL xavfsiz runbook

## Mavjud muhitda ishlaydigan testlar

```bash
cd backend
npm run test:v53:unit
node --test test/*.unit.test.js
node scripts/v45-decision-integrity.js
node scripts/audit-phase1.js
node scripts/decision-coverage.js
# Real PostgreSQL yo'q bo'lsa test 1 SKIP (PASS emas):
node --test test/v53QrFinalBoundaries.postgres.integration.test.js
cd ../frontend
node --test test/*.test.js
npm run build
```

Backenddagi 26 dependency fail va `vite: not found` to'siqlari hal qilinmaguncha FULL PASS deb hisoblamang. Internet mavjud muhitda backend va frontend uchun `npm ci` bilan lockfile paketlarini o'rnating; ZIP ichiga `node_modules`, `.env` yoki token qo'shmang.

## Izolyatsiyalangan PostgreSQL (faqat maxsus test DB)

- Faqat `ustara_test_db`, localhost/loopback va `ustara_account_test` cheklangan session user'i; production ma'lumotlarini ishlatmang.
- `NODE_ENV=test`, `USTARA_TEST_DATABASE_URL` va zarur aniq opt-in'lar: `USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING`, `USTARA_V46_STAGING=I_AUTHORIZE_LOCAL_STAGING`, `USTARA_V49_STAGING=I_AUTHORIZE_LOCAL_STAGING`, `USTARA_V53_STAGING=I_AUTHORIZE_LOCAL_STAGING`.
- Ishga tushirish: `cd backend && npm run test:v53:staging`. Test boshqa schema yaratish huquqini faqat shu maxsus DBda olsin. `SKIP`, timeout yoki xato bo'lsa runner muvaffaqiyatli deb hisoblamaydi.
- Yangi v53 integratsiya testi ikki holatni tekshiradi: QR token `INSERT`dan keyin, so'nggi `used_at` yozuvidan oldin tugashi (request/used_at rollback); QR `approve` paytida jadval yopilishi (yaratilgan navbat/audit ham rollback).
- Bu test ephemerаl schema yaratadi, test oxirida o'ziga tegishli schema'ni tashlaydi; boshqa app jadvallariga tegmaydi.

## Release oldidan qolganlar

Real parallel bronlar/QR expirаtion integratsiyasi; Telegram test bot E2E; mobil brauzer E2E; Vite production build va lint; barcha dependencies bilan to'liq backend suite. **Production deploy uchun hali ruxsat yo'q.**
