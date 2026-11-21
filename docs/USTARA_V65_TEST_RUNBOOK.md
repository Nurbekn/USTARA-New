# USTARA v65 — transitive asset va production Chrome tekshiruvlari

## 1. Offline unit sinovlari (npm paketlari bo‘lmasa ham)

```bash
cd USTARA-New/backend
node --test test/v65PublishedAssets.unit.test.js
npm run test:v65:unit
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
node --test test/*.test.js
```

## 2. Haqiqiy Vite build va Chrome smoke (Node 22, internet/npm va Chrome zarur)

```bash
cd USTARA-New/frontend
npm ci
VITE_API_BASE_URL=https://YOUR_AUTHORIZED_API.example npm run build
cp dist/index.html dist/404.html
node scripts/verify-pages-build.mjs dist
cd ../backend
npm ci
NODE_ENV=test USTARA_PAGES_BUILD_SMOKE=1 USTARA_CHROME_BINARY=chromium \
  node --test test/pagesBuild.browser.e2e.test.js
```

`VITE_API_BASE_URL` aynan ruxsatli production HTTPS API origin bo‘lishi shart. Static production Chrome sinovi CSP bilan tashqi API chaqiruvlarini bloklaydi. `SKIP`, vaqt tugashi yoki asset yuklash xatosi `PASS` hisoblanmaydi.

## 3. Haqiqiy PostgreSQL va GitHub CI

- GitHub `main`ga kod o‘rnatib, Actions variable `VITE_API_BASE_URL`ni moslang. GitHub Actions `USTARA v55 isolated verification` workflow’ni push orqali ishlatadi.
- `npm ci`, 42 SQL migratsiya, 9 PG integration suite, login Chrome E2E, Vite build, production Chrome smoke, release gate va Pages artifact nazoratini ko‘ring.
- `verify-pages-build.mjs` endi HTML/srcset va lokal CSS `@import`/`url()` resurslarini ham tekshiradi. Bittasi yo‘q bo‘lsa build/release chiqmasligi kerak.
- GitHub Pages oldin tekshirilgan ayni CI fayllarini SHA-256 orqali qabul qiladi. `SKIP` yoki `FAIL` bo‘lsa deployni to‘xtatadi.
- Real GitHub/PG test loglari mavjud bo‘lmasa bu testlar bajarildi deb yozmang.

**Mahalliy muhit:** npm paketlari va PostgreSQL serveri mavjud emas; release hali production-ready **EMAS**.
