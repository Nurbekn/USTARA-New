# USTARA v151 — ko‘p tilli first paint va brauzer meta-ma’lumotlari

**Sana:** 2026-11-20. **Asos:** `USTARA-v150-185-Pages-Bootstrap-Build-Preflight.zip` (1 150 fayl), SHA-256 `1de4aa7a968c0b3e5b2eda81b37bfa72bb365b6d20581dda8e08dc72b0fea13b`.

## Muammo

v150 da ichki sahifa matnlarining ko‘p qismi UZ/RU/EN tarjima qilinayotganiga qaramasdan, HTML `<html lang="uz">`, brauzer tab sarlavhasi va `<meta name="description">` o‘zbekcha qolardi. Vite JavaScript hali yuklanmaguncha ko‘rinadigan birinchi loader ham faqat o‘zbekcha edi. `document.lang` noto‘g‘ri bo‘lishi screen reader talaffuziga ta’sir qiladi. #76 ni yanada to‘g‘ri bajarish uchun quyidagi 7 ta bog‘liq vazifa bajarildi.

## 7 ta amalga oshirilgan o‘zgarish

1. **Dastlabki yuklanish tilini tanish:** `frontend/public/bootstrap-locale.js` npm, React va API'siz `?lang=uz|ru|en` ni qat’iy allowlist bilan o‘qiydi. Takroriy/nomuvofiq `lang` qiymatlari o‘zbekchaga qaytadi.
2. **Loader matnlari:** birinchi `Yuklanmoqda` / `Загрузка` / `Loading` va yordam matnlari `textContent` bilan o‘zgartiriladi; URL ma’lumoti `innerHTML`, API, cookie yoki storage’ga uzatilmaydi.
3. **Brauzer tili:** React `BrowserRouter` ichidagi `DocumentLocale` marshrut/til almashganda hujjat ildizidagi `lang` ni yangilaydi.
4. **Sahifa sarlavhasi:** login, ro‘yxatdan o‘tish, tiklash, OTP, yordam, qidiruv, profil, navbat, bron va admin bo‘limlari uchun statik, uch tilli title mavjud. Mijozning ismi, OTP, token yoki ID sarlavhaga qo‘shilmaydi.
5. **Description:** dastlabki shell va SPA ichidagi `<meta name="description">` UZ/RU/EN bo‘yicha yangilanadi. Bu **dinamik backend Open Graph preview yoki SEO natijalari** tayyorligini anglatmaydi.
6. **Pages release himoyasi:** paketsiz v150 preflight va `publish-tree-check.cjs` endi locale skripti, 2 loader identifikatori va `/USTARA-New/` prefiksini talab qiladi, yo‘qolgan yoki takrorlangan locale scriptni rad etadi. GitHub Actions mavjud preflight/verification oqimi avtomatik ravishda yangi shartni qo‘llaydi.
7. **Regressiya va haqiqiy bundle E2E shartlari:** 29 frontend va 7 backend yangi test. Mavjud `pagesBuild.browser.e2e.test.js` ning mobil login RU va desktop admin EN ssenariylariga real `<html lang>`/title tekshiruvi qo‘shildi (3 eski ssenariy soni o‘zgarmadi).

## Haqiqiy sinov natijalari

- **Frontend:** 1536/1536 PASS, 0 FAIL, 0 SKIP. Oldingi 1507 + 29 yangi test.
- **Backend unit:** 1427 PASS / 26 FAIL. Oldingi 1420 PASS / 26 FAIL; barcha muvaffaqiyatsiz test nomlari v150 bilan aynan bir xil; 7 yangi test PASS.
- **Maqsadli testlar:** 29/29 frontend va 7/7 backend PASS.
- **HTML/CSS/Router/lock preflight:** PASS; bootstrap resurslar soni 4. **Haqiqiy o‘rnatilgan Vite:** BLOCKED_MISSING_VITE.
- **`npm ci --offline`: ENOTCACHED** (`zod-validation-error@4.0.2`). **`npm view vite`: EAI_AGAIN** (npm registry DNS). **`npm run build`: `vite: not found`**.
- **Chromium first-paint HTTP smoke:** muvaffaqiyatli bajarilmadi, bu muhitda localhost sahifasi `net::ERR_BLOCKED_BY_ADMINISTRATOR` bilan bloklangan. **Chrome smoke PASS emas.** Mavjud real Chrome production bundle E2E talablari CI’da mavjud, lekin bu yerda **RUN QILINMADI**.
- **PostgreSQL, Telegram real E2E, mobil to‘liq SPA:** NOT_RUN. **Production-ready: YO‘Q.**
- Asl **185 qaror CSV** va **55 SQL fayl** v150 ga nisbatan baytma-bayt saqlanadi. **#76: QISMAN.**

## Keyingi amaliy ish

Internet/registry ishlaydigan GitHub Actions yoki mahalliy muhitda (`VITE_API_BASE_URL` xavfsiz production HTTPS domeniga sozlangan holda) `cd frontend && npm ci && npm run build`, keyin `cp dist/index.html dist/404.html` va `node scripts/verify-pages-build.mjs dist` bajarish; real Chrome E2E va server/DB/Telegram integratsiyalaridan PASS dalilini olish. GitHub Pages deploy faqat CI tekshiruvi to‘liq muvaffaqiyatli tugaganda ruxsat etilishi kerak.
