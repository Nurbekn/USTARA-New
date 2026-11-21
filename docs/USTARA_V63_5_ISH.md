# USTARA v63 — besh ish: production build uchun haqiqiy Chrome smoke gate

**Asos:** v62 arxivi (777 fayl). **Natija:** v63 kod va package-free regressiya tayyor. **Production-ready EMAS**.

1. **Production bundle uchun izolyatsiyalangan statik server.** `backend/test/helpers/v63StaticPages.js` faqat `127.0.0.1` da ishlaydi, faqat `frontend/dist` ichidagi tayyor fayllarni beradi, `/USTARA-New/` bazasiga rioya qiladi. SPA yo‘llarida `404.html` fallback, `Content-Type`, `nosniff`, `Cache-Control: no-store` va tarmoqni bloklaydigan CSP qo‘yilgan. `..`, yashirin `.env`, boshqa prefiks, yetishmagan asset va POST so‘rovlar rad etiladi; hech qanday API proxy yo‘q.
2. **Haqiqiy mobil Chrome smoke.** `backend/test/pagesBuild.browser.e2e.test.js` CI yaratgan Vite **production dist** fayllarini Chromium/Chrome orqali ochib, 390px mobil login sahifasi va kirish formasi haqiqatan render qilinganini tekshiradi. Oldingi `login.browser.e2e.test.js` esa Vite dev server + PostgreSQL uchun mustaqil ravishda qoladi.
3. **Desktop, fallback va modal xavfsizlik.** Xuddi shu build smoke 1440px admin login sahifasini, `forgot-password` deep-link SPA fallback’ni va brauzerda React route render bo‘lishini tekshiradi. Chrome/CDP faqat lokal manzil orqali, bounded ulanish/komandalar va tozalash bilan ishlaydi. Server tashqi API aloqasiga ruxsat bermaydi: bu smoke funksional backend integratsiyasi emas.
4. **GitHub Actions va release/Pages fail-closed isboti.** `.github/workflows/v55-verify.yml` Vite build va `404.html` tekshiruvidan KEYIN Chrome production bundle smoke testini ishga tushiradi va `published-browser.tap` saqlaydi. `v55-release-gate.js`, redacted `v56-ci-summary.js` va `frontend/scripts/verify-pages-evidence.mjs` aynan 3 nested scenario / 4 jami PASS dalilini talab qiladi. `SKIP`, `FAIL`, yo‘q/soxta TAP yoki nomuvofiq `publishBrowserTests` bo‘lsa, Pages deploy bloklanadi.
5. **Offline regressiya va invariantlar.** 6 ta yangi v63 unit test va eski v55–v62 fixture mosligi; `npm run test:v63:unit` qo‘shildi. 185 qaror CSV SHA-256 o‘zgarmagan; 42 forward migratsiya o‘zgarmagan.

## O‘tkazilgan sinovlar (2026-11-19)

- Tanlangan backend **64/64 PASS** (6 yangi v63 testi).
- To‘liq backend **493 PASS / 26 dependency FAIL**, 26 xato o‘rnatilmagan `express`, `bcrypt`, `jsonwebtoken`, `pg` paketlariga bog‘liq; to‘liq PASS emas.
- Frontend unit **178/178 PASS**, YAML parser **2/2 PASS**.
- 185 qaror/42 migratsiya offline audit **PASS**; CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` avvalgi versiyaga aynan teng.
- Production build Chrome smoke: GitHub CI **NOT_RUN**; lokal ish muhitidagi Chromium `127.0.0.1` manzilini bloklagan, shu sabab tayyor USTARA build’i orqali browser E2E **NOT_VERIFIED**. `frontend/dist` uchun haqiqiy Vite build ham npm cache/registry cheklovi sabab **BLOCKED**. `SKIP` yoki demo sahifa bu yerda PASS emas.
- Real PostgreSQL (9 suite), GitHub Actions, Telegram live va to‘liq mobil E2E **NOT_RUN/SKIP**.

**Chegara:** v63 real chiqariladigan Vite build’ni brauzerda sinovdan o‘tkazish uchun gate qo‘shadi; ammo GitHub workflow’dagi real natija olinmaguncha release tasdiqlangan emas. 185 qaror = 185 tayyor feature emas.
