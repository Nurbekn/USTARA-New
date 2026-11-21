# USTARA v60 — real CI / Chrome E2E tekshirish yo‘riqnomasi

## 1. Unit va offline audit
```bash
cd USTARA-New/backend
npm ci
npm run test:v60:unit
npm test
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
npm ci
npm test
npm run build
```

Bu chatdagi container npm registriga chiqa olmadi; backendda `bcrypt`, `express`, `jsonwebtoken`, `pg` yo‘q. Frontend `vite: not found`. Real PostgreSQL server ham yo‘q. `npm ci` ishlamagan bo‘lsa, unit regressiya PASS'ini full-stack test PASS deb qabul qilmang.

## 2. GitHub Actions’da izolyatsiyalangan test
1. Repo `main`ga v60 manba + `.github/workflows/v55-verify.yml` va `deploy-pages.yml`ni yuboring; maxfiy `.env`, JWT, Telegram tokeni yoki production ma'lumotlarini yubormang.
2. GitHub Actions **repository variable** `VITE_API_BASE_URL`ni tegishli HTTPS API origin qilib belgilang. Uni GitHub CLI orqali tekshirish yoki GitHub integratsiyasini ulash mumkin.
3. `USTARA v55 isolated verification`: vaqtinchalik postgres:18 service → 42 migratsiya → backend/frontend unit → 9 DB suite (0 SKIP) → **Chrome E2E** → production API build → release gate. Barcha qadamlar green bo‘lmaguncha Pages chiqmasin.
4. `backend/test/login.browser.e2e.test.js` uchun `NODE_ENV=test`, `USTARA_LOGIN_E2E=1`, `USTARA_LOGIN_WRITE_TESTS=I_AUTHORIZE_TEST_DATA` va faqat `ustara_login_test@127.0.0.1/ustara_test_db` shart. **Production DB ishlatilmasin**.
5. `browser.tap`da 3 aniq nested ssenariy + 1 parent, 4 PASS, 0 SKIP/FAIL. `release.json`da `frontendJsAssets` va `publishFiles` haqiqiy `dist` bilan bir xil bo‘lishi kerak. Maxfiy loglar Pages’ga upload qilinmaydi.
6. `ci-summary.json`: `releaseGate=PASS`, `browser.tests=4`, `postgres.suites=9`, SHA, run attempt va hash tekshiruvlari o‘tgandagina Pages deploy bo‘lishi mumkin.

## 3. Ssenariylar va cheklovlar
Chrome testi **mijoz 390px**, **sartarosh 1440px**, **admin** login/rate-limit oqimini qamraydi. OTP, barcha Smart Booking, Telegram live, to‘liq mobil UX va parallel real booking E2E sinovlari bundan mustasno. Agar real CI ishlamagan bo‘lsa, status `NOT_RUN` qoladi. **Production-ready emas**.
