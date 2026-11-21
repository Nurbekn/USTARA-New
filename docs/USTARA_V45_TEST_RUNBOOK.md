# USTARA v45 — testlarni qayta o'tkazish (maxfiy ma'lumotlarsiz)

Ishni v45 ZIP manbasidagi `USTARA-New` dan boshlang. Ma'lumotlar bazasi va Telegram uchun faqat alohida test muhiti hamda test bot ishlatilsin.

```bash
cd USTARA-New/backend
npm ci
npm run test:v45:unit
npm run test:unit
npm run v45:decisions
npm run audit:phase1
npm run v45:readiness
cd ../frontend
npm ci
npm run test:unit
npm run build
npm run lint
```

`v45:readiness` paket yetishmasa non-zero bilan to'xtashi kutiladi. v45 da Vite, ESLint, PostgreSQL va Telegram live E2E muhit sabab **tasdiqlanmadi**.

Staging uchun `backend/scripts/v40-staging.js` faqat maxsus lokal `ustara_test_db` va cheklangan `ustara_account_test` roli, `NODE_ENV=test` va aniq ruxsat bilan ishlaydi. Rollar/sxemalarni tekshirmasdan uni production DB ga yo'naltirmang. Test chiqishida `skipped` yoki `todo` bo'lsa natija PASS emas. Haqiqiy test bot tokenini hech qachon chatga yoki ZIPga yozmang.
