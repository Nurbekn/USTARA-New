# USTARA v43 — qayta tekshirish yo'riqnomasi

1. `cd backend && npm ci` (faqat ishonchli npm registry mavjud bo'lganda, `package-lock.json` asosida). Keyin `npm run test:v43:unit`, `npm run test:unit`, `npm run v43:readiness`, `npm run audit:phase1`, `npm run audit:decisions`.
2. `cd frontend && npm ci`, keyin `npm run test:v43:unit`, `npm run test:unit`, `npm run build`, `npm run lint`.
3. PostgreSQL uchun faqat ajratilgan mahalliy **ustara_test_db** ma'lumotlar bazasida, superuser bo'lmagan **ustara_account_test** roli bilan, 42 migratsiya tegishli o'rnatilganidan keyin `NODE_ENV=test USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING USTARA_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/ustara_test_db npm run test:v42:staging`. Parol va URLni shell tarixida oshkor qilmaslik kerak; `.env` ni ZIPga qo'shmang. Staging runner SKIP -> FAIL va ruxsatsiz bazaga ulanmaydi.
4. Telegram haqiqiy test bot va rozilik bergan test chat bilan tekshiriladi: 429 uzoq retry_after; noaniq tarmoq; opt-out; ikki marta xabar yuborish. Test bot tokenini log qilmaslik kerak.
5. Android/iOS brauzerda `ManualQueue` logout, 401, 403, akkaunt almashuvi, kechikkan polling, 5 min offer va 2 min confirmation oqimlarini E2E tekshiring.

**Bu muhitdagi natija:** npm paketlari va real PostgreSQL serveri yo'q. Bu buyruqlar ko'rsatma, hozir muvaffaqiyatli o'tgan real integration natijalari emas. **Production-ready emas.**
