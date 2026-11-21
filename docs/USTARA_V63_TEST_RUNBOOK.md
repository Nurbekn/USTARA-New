# USTARA v63 — CI/Pages, PostgreSQL va real production Chrome smoke

## 1. Lokal unit va audit (npm paketi bo‘lmasa ham bir qismi ishlaydi)

```bash
cd USTARA-New/backend
node --test test/v63ProductionBundle.unit.test.js
npm run test:v63:unit
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
node --test test/*.test.js
```

## 2. Haqiqiy build va browser smoke (Node 22 va to‘liq npm o‘rnatilishi kerak)

```bash
cd USTARA-New/frontend
npm ci
VITE_API_BASE_URL=https://YOUR-REAL-HTTPS-API.example npm run build
cp dist/index.html dist/404.html
node scripts/verify-pages-build.mjs dist
cd ../backend
npm ci
NODE_ENV=test USTARA_PAGES_BUILD_SMOKE=1 USTARA_CHROME_BINARY=chromium \
  node --test test/pagesBuild.browser.e2e.test.js
```

Bu komandalar haqiqiy backend API manzilini tasdiqlash emas; demo yoki maxfiy kalitlarni qo‘ymang. Chrome smoke lokal statik serverdan build fayllarini oladi; unda `connect-src 'none'` — tashqi API chaqiruvlari bloklanadi. Test `SKIP/FAIL` bo‘lsa release `PASS` hisoblanmaydi. **Bu muhitda frontend npm/Vite build ishlamagan va Chromium lokal IP’ni bloklagan.**

## 3. GitHub Actions — real tekshiruv uchun

1. v63 manbasini nazoratingizdagi repo `main`ga joylang. `.env` yoki production JWT/TG tokenlarini qo‘shmang.
2. GitHub Actions Variables’da `VITE_API_BASE_URL`ni real HTTPS origin sifatida sozlang.
3. `USTARA v55 isolated verification`da PostgreSQL 18 service, 42 forward migratsiya, 9 integration suite, alohida login Chrome E2E, Vite build, SPA `404.html`, so‘ng **Published bundle Chrome smoke** qadamlarini kuzating. Brauzer test `published-browser.tap`da 3 nested + parent = 4 PASS va 0 SKIP/FAIL bo‘lishi kerak.
4. `release.json`da `publishBrowserTests:4`, `ci-summary.json`da `publishedBrowser:{status:'PASS',tests:4}` bo‘lsa ham, faqat haqiqiy CI muvaffaqiyatli run ishonchli dalildir. Barcha testlar muvaffaqiyatli tugamaguncha Pages bloklanadi.
5. Pages aynan CI testdan o‘tgan `dist` artifactni SHA-256 bilan tekshiradi, qayta Vite build qilmaydi.

## 4. Hali bajarilishi kerak

GitHub Actions real PASS natijasi, PostgreSQL suite’lar real PASS, browser production bundle real PASS, yakuniy mobil interaktiv E2E, Telegram live sandbox va security audit. **Production-ready EMAS.**
