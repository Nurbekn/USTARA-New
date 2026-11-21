# USTARA v62 — 5 ta ish: CI tekshirgan aynan o‘sha frontendni nashr qilish

**Asos:** v61 ZIP (772 ta fayl). **Natija:** kod va offline testlar tayyor, real GitHub/PG/Chrome integratsiya testlari bajarilmagan. **Production-ready EMAS.**

1. **CI build va SPA fallback.** `.github/workflows/v55-verify.yml` endi frontend Vite build’dan keyin `frontend/dist/404.html`ni `index.html` bilan tenglashtiradi va `verify-pages-build.mjs` orqali JS entry, SPA fallback, maxfiy/yashirin fayllar va symlink’larni tekshiradi. Bu bosqich release gate’dan oldin bajariladi.
2. **Frontend fayllarining deterministik SHA-256 izi.** `scripts/publish-tree-check.cjs` yangi `sha256PublishTree()` orqali har bir ruxsat etilgan faylning nisbiy yo‘li, uzunligi va SHA-256 qiymatini tartiblab yagona hashga birlashtiradi. CI release gate `publishTreeSha256` ni qaytaradi. O‘zgargan, qo‘shilgan yoki o‘chgan fayl umumiy hashni o‘zgartiradi.
3. **CI tasdiqlangan build artifact.** Barcha CI testlari/release gate `PASS` bo‘lgach, aynan tayyor `frontend/dist/` `ustara-v62-pages-build-<runId>-<attempt>` nomi bilan yuklanadi. `.nojekyll`ni yo‘qotmaslik uchun hidden-file upload yoqilgan, ammo publish tree validatori boshqa barcha yashirin/maxfiy fayllarni bloklaydi.
4. **Pages qayta build qilmaydi.** `.github/workflows/deploy-pages.yml` endi yangi `npm ci`/`npm run build` bajarish o‘rniga **aynan o‘sha upstream CI run/attempt** artifactini yuklaydi. `verify-ci-build.mjs` commit SHA, run/attempt, HTTPS API hash, file count, JS assets, SPA 404 fallback hamda `publishTreeSha256`ni bevosita fayllar bo‘yicha qayta solishtiradi. Bitta bayt farq qilsa, deploy to‘xtaydi.
5. **Regressiya va mustaqil tekshiruv.** `v62VerifiedArtifacts.unit.test.js` ichida **8 ta yangi test**: deterministik hash, o‘zgargan JS/fallback, yashirin/symlink, CI provenance, CLI maxfiylik, workflow bog‘lanishi, reportdagi noto‘g‘ri SHA va `.nojekyll`. Eski v56–v60 mock-testlari endi v62 artifact hash dalilini hisobga oladi. `npm run test:v62:unit` sozlandi.

## Haqiqiy lokal natijalar (2026-11-19)

- Tanlangan release-chain: **58/58 PASS** (8 ta yangi v62 testi bilan).
- To‘liq backend: **487 PASS / 26 dependency FAIL** (`express`, `bcrypt`, `jsonwebtoken`, `pg` o‘rnatilmagan), 0 ta yangi kod xatosi testda topildi. To‘liq PASS emas.
- Frontend unit: **178/178 PASS**.
- Offline audit: **185 qaror / 42 forward migratsiya PASS**; asl CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` o‘zgarmagan.
- Workflow YAML parser: **2/2 PASS**. GitHub Actions real run **NOT_RUN**. PostgreSQL staging/test **NOT_RUN/SKIP**, Chrome/React login E2E **SKIP**, npm/Vite build **BLOCKED**. Telegram live va to‘liq mobil E2E **NOT_RUN**.

**Chegara:** aniq build isboti GitHub Actions workflow ishlaganda release’ni noto‘g‘ri qayta build’dan himoya qiladi. Bu hali haqiqiy GitHub run muvaffaqiyatli degani emas. Backend alohida serverda sinovdan o‘tishi shart; 185 qaror mavjudligi 185 tayyor funksiya degani emas.
