# USTARA v42 — sinov va ishga tushirish bloklovchilari

## Offline tekshiruv (xavfsiz, DB yoki Telegramga ulanmaydi)

`cd backend && npm run test:v42:unit`

`cd frontend && npm run test:v42:unit`

`cd backend && node scripts/audit-phase1.js && node scripts/decision-coverage.js`

## To‘liq sinov uchun zarur sharoit

- Ishonchli tarmoqda backend va frontend kataloglarida `npm ci` bajaring, tokenlarni hech qachon ZIPga kiritmang. `npm ci --offline` hozir ENOTCACHED, `vite build` esa yo‘q — bu PASS emas.
- **Faqat alohida lokal TEST bazasi** `ustara_test_db`, maxsus non-superuser `ustara_account_test`, foydalanuvchi tomonidan ruxsat bilan `NODE_ENV=test`, `USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING`, `USTARA_TEST_DATABASE_URL` sozlang. Production bazada ishga tushirmang.
- So‘ng `cd backend && npm run test:v42:staging` ishga tushiring: read-only preflight v39 constraint va **42 applied migration ledger** mosligini tekshiradi; 5 suite alohida natija beradi. `SKIP`/`FAIL`/`TODO` — PASS emas.
- Telegramning alohida test-bot va rozilik bergan test chati bilan `uncertain`, `/stopqueue`, 429, expired invite va callback oqimlarini E2E tekshiring; haqiqiy foydalanuvchiga xabar jo‘natmang.
- `cd frontend && npm run build && npm run lint`, so‘ng telefon brauzerida navbat polling/log out, xizmatlar, countdown va qabul/rad/confirm oqimlarini tekshiring.

## v42 da real natija

- Backend tanlangan 41/41 PASS; barcha testlar 333 PASS, 26 `MODULE_NOT_FOUND` sabab FAIL (`jsonwebtoken` 9, `express` 8, `bcrypt` 6, `pg` 3).
- Frontend 169/169 unit PASS. Vite build BLOCKED (`vite: not found`).
- Real PostgreSQL, Telegram API, mobil E2E: NOT_RUN. Production-ready EMAS.
