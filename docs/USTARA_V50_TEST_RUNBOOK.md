# USTARA v50 — QR xavfsizligi test yo'riqnomasi

`backend` ichida:

```bash
node --test test/v50QrAccountClock.unit.test.js
npm run test:v50:unit
node --test --test-concurrency=4 test/*.unit.test.js
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
```

`frontend` ichida:

```bash
node --test test/*.test.js
npm ci
npm run build
```

Real DB integratsiya faqat maxsus `ustara_test_db` + test-only credential va oq ro'yxatdagi runner orqali, ishlab chiqarish bazasiga emas. Mavjud `backend/scripts/v49-staging.js` yo'riqnomasiga rioya qiling. Real DB yo'q bo'lsa `NOT_RUN/SKIP` deb yozing, PASS demang. Telegram API test boti va telefon browser E2E alohida talab.

Barcha 185 qaror ro'yxati borligi ularning barchasi ishlashini anglatmaydi. `docs/USTARA_185_NAZORAT.csv`ni alohida asrang.
