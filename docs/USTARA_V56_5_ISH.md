# USTARA v56 — tekshirilgan commit uchun Pages deploy zanjiri

**Manba:** v55 ZIP (739 fayl). **Natija:** v56, 4-bosqich. **Production-ready EMAS**.

## 5 bajarilgan ish

1. **Deploy-ni CI'ga bog'lash.** `.github/workflows/deploy-pages.yml` dagi bevosita `push` va `workflow_dispatch` deploy triggerlari olib tashlandi; endi faqat `USTARA v55 isolated verification` workflow'ining `workflow_run.completed` hodisasi ishlaydi. `success`, `push`, `main`, aynan shu repository bo'lishi shart.
2. **Aynan tekshirilgan commit va eski natijani to'sish.** Frontend qurilishi oldidan va deploy boshlanishidan oldin GitHub API orqali `main`'ning yangi SHA qiymati tekshiriladi; `actions/checkout` har ikkala job'da oldin CI tekshirgan `workflow_run.head_sha`'ni yuklaydi. Vaqti o'tgan run yangi sahifani bosib ketmasligi uchun concurrency ham SHA bo'yicha ajratildi. Baribir tashqi holat o'zgarishi bilan bog'liq juda qisqa poyga oynasi qolishi mumkin; GitHub branch protection / environment approvals ham tavsiya qilinadi.
3. **Maxfiy ma'lumot chiqarmaydigan CI diagnostikasi.** `v56-ci-summary.js` faqat aniq statuslar va sanash natijalarini JSON tarzida beradi; xato bo'lsa `NOT_VERIFIED`. CI har safar shunday xulosa faylini artifact sifatida saqlaydi; to'liq TAP loglari, DB URL va tokenlar artifactga yuklanmaydi.
4. **9 ta PostgreSQL test to'plami natijasini qat'iy tekshirish.** Release gate to'qqizta natijani aynan rejalashtirilgan tartibda talab qiladi; yagona yakuniy marker oxirida turishi kerak. Takroriy va eski/yopishtirilgan marker `NOT PASS`.
5. **v56 regressiya va checkpoint.** Yangi `v56ReleaseChain.unit.test.js` 7 ta vaziyatni tekshiradi; loyiha ichidagi oxirgi checkpoint va progress v56 gacha yangilandi, v54–v55 bosqichlari ham ichki jurnalga qaytarildi. 185 qaror CSV hash va 42 forward migratsiya o'zgarmagan.

## Haqiqiy sinov natijalari (2026-11-19)

- `npm run test:v56:unit`: **19 PASS / 0 FAIL** (v56 yangi 6 ta, boshqa qayta tekshirilgan unit testlar bilan).
- Backend `node --test test/*.unit.test.js`: **441 PASS / 26 FAIL** (466 jami). Yetishmayotgan paketlar: `jsonwebtoken` (9), `express` (8), `bcrypt` (6), `pg` (3). **To'liq PASS emas.**
- Frontend `node --test test/*.test.js`: **178/178 PASS**.
- YAML tuzilishi offline parser bilan tekshirildi: `v55-verify` push/PR/manual trigger, `deploy-pages` faqat `workflow_run` trigger.
- PostgreSQL testi **1 SKIP**; staging opt-in yo'q paytda **bloklandi** (kutilgan natija).
- `npm ci --offline` backend/frontend **ENOTCACHED**, `npm run build` **FAIL: vite not found**.
- GitHub Actions real run **NOT_RUN**: kodni GitHub'ga yuborish va GH workflow natijasini olish imkoni hali tasdiqlanmagan.
- Telegram test boti va mobil brauzer E2E **NOT_RUN**.
- Offline audit **185 ta qaror / 42 forward migratsiya PASS**; CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.

**Muhim:** release-gate `PASS` bo'lsa ham Telegram live, mobil E2E va barcha qarorlarning haqiqiy implementatsiyasi tekshirilmasdan production-ready bo'lmaydi. GitHub Pages faqat frontend statik sayti; backend alohida serverda sinovdan o'tishi shart.
