# USTARA v62 — sinov / CI / Pages runbook

## Mahalliy testlar

```bash
cd USTARA-New/backend
npm ci
npm run test:v62:unit
npm test
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
npm ci
npm test
npm run build
```

Mahalliy v62 runtime’da `npm ci --offline` paket keshining to‘liq emasligi sabab ishlamaydi. PostgreSQL serveri mavjud emas; **real DB test o‘tdi deyilmaydi**.

## Izolyatsiyalangan GitHub Actions sinovini ishga tushirish

1. v62 kodini va `.github/workflows/v55-verify.yml` hamda `deploy-pages.yml`ni o‘zingiz nazorat qiladigan repo `main` tarmog‘iga joylang. `.env`, haqiqiy DB URL, bot tokeni, JWT maxfiy kaliti hech qachon GitHub’ga yuklanmasin.
2. GitHub `Settings → Secrets and variables → Actions → Variables` bo‘limida `VITE_API_BASE_URL` ni aynan haqiqiy ishlab turgan HTTPS API origin sifatida belgilang. Bu qiymat CI va Pages’da bir xil bo‘lishi zarur.
3. Actions → `USTARA v55 isolated verification` da backend/frontend `npm ci`, 42 migratsiya, 9 izolyatsiyalangan PostgreSQL suite, Chrome login E2E (mijoz 390px, sartarosh 1440px, admin), frontend build, `404.html`, release gate va `ustara-v62-pages-build-<runId>-<attempt>` artifact muvaffaqiyatli bo‘lganini tekshiring. `SKIP` va `FAIL` release’dan o‘tmasligi shart.
4. `ci-summary.json` faqat maxfiy ma'lumotlardan tozalangan hisobot. Unda `releaseGate=PASS`, `publishTreeSha256` 64 belgili hex, `browser.tests=4`, `postgres.suites=9`, source SHA va run/attempt borligini tekshiring.
5. `Deploy verified frontend to GitHub Pages` aynan shu build artifact’ni **yuklab oladi**, qayta `npm ci`/Vite build qilmaydi. `verify-ci-build.mjs` SHA-256, fallback, asset count va provenance mosligini tekshiradi. SHA yoki API origin mos kelmasa, deploy bloklanadi.

## Qo‘lda offline build dalili tekshiruvi

`frontend/scripts/verify-ci-build.mjs` faqat haqiqiy tekshirilgan `ci-summary.json` va shu CI run/attempt’dan olingan `dist` papkasi bilan ishga tushiriladi. `VERIFIED_SHA`, `VERIFIED_RUN_ID`, `VERIFIED_RUN_ATTEMPT` va `VITE_API_BASE_URL` GitHub workflow tomonidan belgilanadi. Mahalliy soxta hisobotga tayanib, haqiqiy release uchun PASS demang.

## Haligacha bajarilmaganlar

Haqiqiy GitHub Actions va PostgreSQL/Chrome E2E, real Telegram bot, mobil brauzer UX, ishlab turgan backend HTTPS API integratsiyasi va xavfsizlik auditi. **Production-ready EMAS.**
