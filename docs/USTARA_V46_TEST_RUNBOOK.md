# USTARA v46 — sinash qo'llanmasi

## Offline mumkin bo'lgan testlar

```
cd USTARA-New/backend
npm run test:v46:unit
npm run test:unit
npm run v45:decisions
npm run audit:phase1
cd ../frontend
npm run test:unit
npm run build
npm run lint
```

`test:v46:unit` 40/40 o'tgan. Backend full 368 PASS/26 `MODULE_NOT_FOUND` FAIL; frontend 175/175 o'tgan. Build/lintga Vite/ESLint paketlari kerak. `SKIP` hech qachon `PASS` emas.

## Faqat mahalliy test PostgreSQL (mavjud bo'lsa)

**Production yoki haqiqiy mijozlar bazasida ishga tushirmang.** Faqat `ustara_test_db` nomli local test DB, alohida `ustara_account_test` (superuser emas) hisobini tashkil eting va avvalgi 42 migratsiyani test DBga qo'llang. Npm paketlarini o'rnating. URLni faylga/ZIPga yozmang.

```
cd USTARA-New/backend
NODE_ENV=test \
USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING \
USTARA_V46_STAGING=I_AUTHORIZE_LOCAL_STAGING \
USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test@127.0.0.1/ustara_test_db' \
npm run test:v46:staging
```

URL faqat mahalliy test hisobiga misol; real secretlarni buyruq tarixida yoki loglarda oshkor qilmang. Staging runner avval 5 ta mavjud DB testini, keyin v46 ning isolated schema testini ishlatadi; jami oltitasi ham ishga tushmasa qat'iy xato bo'ladi. O'z ephemeral sxemasini o'chirishdan oldin owner va schema OIDni tekshiradi. PostgreSQL bo'lmaganda yangi test `SKIP`, runner esa fail-closed.

## Real Telegram/mobile

Private test bot, opt-in test chat, vaqt va retry ssenariylar, browser E2E; shaxsiy chat ID, token, SMS OTP, DB URL log/arxivda saqlanmasin. Manual operator holatini tekshirish talab etiladi; Telegram exactly-once kafolatlamaydi.
