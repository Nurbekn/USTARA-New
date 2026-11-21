# USTARA v60 — 5 ta ish hisoboti

**v59 → v60.** Maqsad: GitHub Chrome login testini natija soxtalashuvi/aloqa uzilishiga chidamli qilish. Bu CI haqiqiy ishga tushirildi degani emas.

## 1. Qat’iy TAP/browser isboti
`backend/scripts/v55-release-gate.js`: to‘liq Node TAP parent + nested reja. Aniq ketma-ket `customer: 390px`, `barber: 1440px`, `admin` va `1..3` plan, to‘rt testning ham PASS bo‘lishi majburiy. Ortiqcha/missing/repeated yoki bekor qilingan holat release’ni bloklaydi.

## 2. Sanitizatsiyalangan dalil va publish tree soni
`backend/scripts/v56-ci-summary.js`: `validateBuiltFrontend` bilan birga `validatePublishTree` ham ishlaydi; `release.json`dagi `frontendJsAssets`, `publishFiles` raqamlariga tengligi talab qilinadi. Raw password/telefon/bot tokeni upload qilinmaydi.

## 3. GitHub Pages browser dalili
`frontend/scripts/verify-pages-evidence.mjs`: testlar soni aniq **4** bo‘lishini talab qiladi, `>=4` sharti rad etildi. Browser `PASS` va CI run ID/attempt, commit SHA, production HTTPS API hash shartlari saqlandi.

## 4. Chrome DevTools loopback va xavfsiz aloqa
Yangi `backend/test/helpers/v60ChromeCdp.js`: websocket URI faqat loopback va aynan Chrome berilgan port, sahifa endpointi bo‘lsa qabul. Boshqa host/port/protokol, credential, query/hijack rad etiladi. Chrome’ning websocket aloqasi uzilsa pending chaqiriqlar darhol rad etiladi.

## 5. Bounded CDP va yangi regressiya
`backend/test/login.browser.e2e.test.js`: Chrome’ning target discovery 5s, CDP command 7s bounded; jarayon oldin chiqib ketsa tez fail. `v60ChromeProof.unit.test.js` 6 yangi test. v56–v59 sintetik test fixture’lari qat’iy dalil formatiga moslandi, production qoidalar yumshatilmadi.

## Sinov statusi
- `npm run test:v60:unit`: **40/40 PASS**.
- To‘liq backend `npm test`: **469 PASS / 26 FAIL**. 26 failure ham `bcrypt`/`express`/`jsonwebtoken`/`pg` o‘rnatilmagani bilan bog‘liq.
- Frontend `npm test`: **178/178 PASS**.
- Browser real Chrome/PG: **1 SKIP**, GitHub Actions **NOT_RUN**, PostgreSQL staging **NOT_RUN**, Vite build **BLOCKED**.
- 185 original qaror SHA-256 va 42 SQL forward migratsiya offline **PASS**.

**Eslatma:** unit testlar brauzer dalilini parse qilishni tekshiradi, ammo haqiqiy Chrome+PostgreSQL runtime ishga tushganini tasdiqlamaydi. **Production-ready NO**.
