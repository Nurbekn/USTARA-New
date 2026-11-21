# USTARA v59 — bajarilgan 5 ta ish

**v58 → v59. Ko‘zlangan natija: browser E2E bo‘lmasa deploy mumkin emas. Real integratsiya natijasi hali NOT_RUN/SKIP.**

## 1. Alohida PostgreSQL test roli
`.github/workflows/v55-verify.yml` migratsiyalar tugagach vaqtinchalik Docker xizmatida `ustara_login_test` LOGIN rolini yaratadi. `ustara_account_test` esa 42 migratsiyaning egasi bo‘lib qoladi; yangi rol uning faqat test bazasidagi huquqini meros oladi. Boshqa URL, production DB yoki production bot tokenlari ishlatilmaydi.

## 2. Haqiqiy Chrome login E2E CI qadami
9 ta PG suite o‘tganidan keyin `backend/test/login.browser.e2e.test.js` maxsus `USTARA_LOGIN_E2E=1`, `USTARA_LOGIN_WRITE_TESTS=I_AUTHORIZE_TEST_DATA`, `NODE_ENV=test` bilan ishga tushadi. GitHub runnerda Chrome mavjudligi tekshiriladi. Haqiqiy React ilovasi (Vite dev-server), Express login HTTP, test PostgreSQL va Chrome DevTools yordamida **customer 390px, barber 1440px, admin** ssenariylari bajariladi. TAP fayl faqat local runner temporary directory ichida qoladi.

## 3. Browser natijasi release gate uchun shart
`backend/scripts/v55-release-gate.js` `validateBrowserTranscript()` endi top-level parent `ok`, uchta nested `ok` va TAP xulosa sonlarini talab qiladi; `SKIP`, `TODO` yoki `FAIL` dalili release’ni bloklaydi. Hisobotdagi `browserTests` — o‘tgan testlar soni, ammo bu to‘liq production-ready dalili emas.

## 4. Redacted report va Pages evidence
`backend/scripts/v56-ci-summary.js` browser testlarining faqat status/sonini beradi, raw log, telefon, login tokenlari va database URLni artifact’ga chiqarmaydi. `frontend/scripts/verify-pages-evidence.mjs` browser `PASS` bo‘lmasa upstream ishonch dalilini qabul qilmaydi.

## 5. Regressiya va oldingi qarorlar
`backend/test/v59BrowserGate.unit.test.js` 5 yangi test: browser TAP real label/hisoblar, CI config/role isolation, missing/failed browser report, Pages rejection, source E2E coverage. Oldingi test fixture’lari browser dalili bilan sinxronlashtirildi. **185 qaror CSV byte-for-byte bir xil; 42 SQL forward migratsiya o‘zgarmadi.**

## Mahalliy sinov dalillari
- `npm run test:v59:unit`: **34/34 PASS**.
- To‘liq backend: **463 PASS / 26 FAIL**, kutubxonalar (`bcrypt`, `express`, `jsonwebtoken`, `pg`) mavjud emas. FULL GREEN EMAS.
- Frontend: **178/178 PASS**.
- Browser E2E: **1 SKIP** (test bazasi va npm kutubxonalarisiz ruxsat flaglari berilmagan). GitHub Actions va haqiqiy PostgreSQL staging **NOT_RUN**. Vite build **BLOCKED**.
- 185 qaror yaxlitligi va 42 migratsiya offline audit **PASS**.

**Muhim:** bu v59’da real Chrome + PG login testi GitHub’da bajarilgani yo‘q. Faqat CI pipeline kodiga kiritildi va uning fail-closed talablari lokal unit-testlarda tasdiqlandi. Production-ready emas.
