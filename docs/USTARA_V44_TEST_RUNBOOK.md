# USTARA v44 — tekshiruv yo'riqnomasi

Ishchi katalogda ikki alohida terminal:

```bash
cd USTARA-New/backend
npm ci    # faqat ishonchli internet/mirror bilan; lockfile asosida
npm run test:v44:unit
npm run test:unit
npm run v44:readiness
```

```bash
cd USTARA-New/frontend
npm ci
npm run test:v44:unit
npm run test:unit
npm run build
npm run lint
```

**DB:** faqat maxsus lokal, testga ajratilgan `ustara_test_db` va `ustara_account_test` roli, `NODE_ENV=test`, aniq staging opt-in bilan `npm run test:v42:staging`. Hech qachon production DB URL bilan sinamang. V41/42/v43 staging guard o'tmaguncha DB testi ishlamaydi. Tokenni chatga/ZIPga kiritmang.

**Telegram:** maxsus sinov bot/chatda, inson roziligi bilan; real API xabar yetganini va noaniq `uncertain` holatning avtomatik takrorlanmasligini alohida tekshiring. Bot tokenini git/ZIPga qo'shmang.

**Mobil:** ikki akkaunt almashishi, past/uzilgan internet, xizmat ro'yxati kechikib kelishi va QR/oddiy navbat sahifasida vaqt tugashi holatlarini qo'lda tekshiring.

**Natija formatida ajrating:** PASS / FAIL / BLOCKED / SKIP. Test ishlamasa PASS deb yozmang.

**2026-11-19 ushbu muhit:** backend `npm ci --offline` ENOTCACHED, Vite va ESLint yo'q; real DB, Telegram, mobil E2E NOT_RUN.
