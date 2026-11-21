# USTARA v99 test buyruqlari

Repo ildizida:

```bash
npm --prefix backend run test:v99:unit
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
```

Izolyatsiyalangan test PostgreSQL bazasi tayyorlanganidan **keyin** va faqat test muhitida (hech qachon production DB'da emas):

```bash
# USTARA_TEST_DATABASE_URL ni faqat mahalliy, izolyatsiyalangan test DB'ga sozlang.
# Avval zarur migratsiyalar test DB'da review qilib qo'llangan bo'lsin.
NODE_ENV=test \
USTARA_V94_QUEUE_DB_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_V96_QUEUE_DB_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_TEST_DATABASE_URL=postgresql://ustara_account_test:REDACTED@127.0.0.1:5432/ustara_test_db \
npm --prefix backend run test:v99:db
```

Oldin `backend/scripts/v97-queue-readiness.js` bilan xavfsiz, read-only preflight bajaring. Integratsiya testlari disposable ma'lumot yaratishi mumkin, lekin production bazaga ulanmasligi kerak. Ishga tushirilmagan testni PASS deb hisoblamang. Real midnight-race ssenariysi unit mock bilan o‘tgan, lekin live DB da vaqt o‘tishi bilan poyga testi hali yo‘q.
