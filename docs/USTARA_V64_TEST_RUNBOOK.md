# USTARA v64 — HTML asset / Chrome smoke testlari va GitHub CI

## 1) Paketlar to‘liq bo‘lmasa ham unit-test

```bash
cd USTARA-New/backend
node --test test/v64ProductionResource.unit.test.js
npm run test:v64:unit
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
node --test test/*.test.js
```

## 2) Haqiqiy Pages build (Node 22 va npm paketlari kerak)

```bash
cd USTARA-New/frontend
npm ci
VITE_API_BASE_URL=https://YOUR-AUTHORIZED-API.example npm run build
cp dist/index.html dist/404.html
node scripts/verify-pages-build.mjs dist
cd ../backend
npm ci
NODE_ENV=test USTARA_PAGES_BUILD_SMOKE=1 USTARA_CHROME_BINARY=chromium \
  node --test test/pagesBuild.browser.e2e.test.js
```

**Faqat ruxsat berilgan HTTPS production API manzilini ishlating.** Test statik serverida `connect-src 'none'` sabab real API chaqiruvlar taqiqlangan. `1 SKIP` yoki `FAIL` production Chrome smoke `PASS` hisoblanmaydi.

## 3) GitHub Actions va Pages

1. Loyiha manbasini GitHub `main`ga chiqarishdan oldin `.env`, token, production DB kalitlari ZIP ichida emasligini tekshiring.
2. GitHub Actions variable `VITE_API_BASE_URL`ni haqiqiy HTTPS API originiga moslang.
3. `USTARA v55 isolated verification` ishini amalda bajarib, npm install, 42 migratsiya, 9 PostgreSQL suite, Chrome login E2E, Vite build va **production bundle Chrome smoke** qadamlarining NATIJALARINI tekshiring.
4. Bittasi `SKIP/FAIL` bo‘lsa Pages upload gate yopiqligini ko‘ring. Agar `index.html`dagi CSS/ikonka yo‘q bo‘lsa `verify-pages-build.mjs` endi xato beradi; kodni qayta tuzatib sinang.
5. Pages aynan CI bilan tekshirilgan `frontend/dist`ni SHA-256 orqali tekshiradi, qayta build qilmaydi.

**Mahalliy sinovda npm registry/paketlar yetishmagan, haqiqiy PostgreSQL va Chrome build E2E bajarilmagan. Production-ready EMAS.**
