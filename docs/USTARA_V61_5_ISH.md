# USTARA v61 — 5 ta ish (Chrome CI va release himoyasi)

**Asos:** v60 ZIP (767 fayl). **Holat:** v61 kodi/unit testi tayyor, real CI va PostgreSQL integratsiya sinovi hali bajarilmagan. Production-ready **YO‘Q**.

1. **Chrome jarayonini xavfsiz yopish.** `backend/test/helpers/v61ChromeLifecycle.js` signal bilan allaqachon to‘xtagan jarayonni yana kutmaydi; faol jarayonga `SIGTERM`, qisqa chegaralangan muddatda javob bo‘lmasa `SIGKILL` ishlatadi. E2E testining `t.after` tozalashi profil papkasini `finally`da o‘chiradi.
2. **Chrome E2E ishga tushish va lokal CDP.** `login.browser.e2e.test.js` spawn `error` hodisasini ushlaydi va debugging listener’ini aniq `127.0.0.1`ga bog‘laydi. `USTARA_CHROME_BINARY` faqat `google-chrome`, `chromium`, `chromium-browser` bo‘lishi mumkin; buyruq yoki parametr injeksiyasi rad etiladi.
3. **TAP protokoli qat’iyligi.** `backend/scripts/v40-staging.js` ichki/nested `not ok`, `# SKIP`, `# TODO`ni ham rad etadi, haqiqiy observed nested va top-level testlar sonini yakuniy hisob bilan solishtiradi. Endi ortiqcha `# tests N` hisoboti muvaffaqiyatli bo‘la olmaydi.
4. **Pages fayllarini nashr qilish xavfsizligi.** `scripts/publish-tree-check.cjs` yashirin fayllar (`.nojekyll`dan tashqari), katta-kichik harf bilan yozilgan source map, credential/backup/SQL fayllar, tashqi symlink root, 25 MB dan katta bitta fayl yoki 120 MB dan katta umumiy buildni bloklaydi.
5. **GitHub CI portability va regressiya.** `v55-verify.yml` Chrome mavjudligini aniq tekshiradi va uchta ruxsat etilgan executable’dan birini E2E testiga uzatadi. `test:v61:unit` bilan 10 ta yangi unit-test (Chrome lifecycle, noto‘g‘ri TAP, Pages maxfiy/og‘ir fayllar, CI guard) qo‘shildi. Eski v41/v59/v60 testlari yangi qat’iy qoidalarga moslashtirildi.

## Lokal testlar — haqiqiy natija

- `cd backend && npm run test:v61:unit`: **53/53 PASS**.
- Backend `npm test`: **479 PASS / 26 FAIL**; FAIL sabab mavjud bo‘lmagan `bcrypt`, `express`, `jsonwebtoken`, `pg` dependency’lari (npm cache/offline muhit).
- Frontend `npm test`: **178/178 PASS**.
- `backend/test/login.browser.e2e.test.js`: **1 SKIP**; real PostgreSQL va Chrome+HTTP+React E2E tasdiqlanmadi.
- Workflow YAML parser: **2/2 PASS**; GitHub Actions remote run **NOT_RUN**.
- `backend/scripts/audit-phase1.js`: **185 qaror, 42 forward migratsiya** strukturaviy PASS. `backend/scripts/v45-decision-integrity.js` SHA-256 **o‘zgarmagan**.
- Production Vite build, PostgreSQL integration, Telegram live, Pages deployment: **NOT_RUN/BLOCKED**, haqiqiy foydalanuvchi sinovi emas.

**Qaror:** yangi commitni GitHub’ga yuborib, `USTARA v55 isolated verification` workflow’ni haqiqiy GitHub-hosted runner’da ishga tushirish va natija asosida tuzatishlar qilish kerak. Maxfiy tokenlar/production DB hech qachon testda ishlatilmasin.
