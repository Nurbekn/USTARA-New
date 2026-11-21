# USTARA v57 — tasdiqlangan release dalillari va HTTPS API

**Manba:** v56 ZIP (744 fayl). **Yakun:** v57. **4-bosqich; production-ready EMAS.**

## 5 ta bajarilgan ish

1. **Branch bo‘yicha Pages deploy navbati.** `.github/workflows/deploy-pages.yml`: yagona `ustara-pages-main` concurrency, `cancel-in-progress: false`. Ikkala deploy job ham asosiy branchning ayni SHA ekanini tekshiradi. GitHub tashqi hodisasi o‘zgarishi bilan bog‘liq race riskini mutlaq bartaraf etilgan deb da'vo qilmaymiz.
2. **Production API origin policy.** `scripts/production-api-url.cjs` va `frontend/scripts/validate-production-api.mjs` faqat real HTTPS DNS origin qabul qiladi. Localhost, HTTP, credentials, URL path/query/hash, private/reserved names va to‘g‘ridan-to‘g‘ri IP rad etiladi. CLI noto‘g‘ri qiymatni logga chiqarmaydi.
3. **CI va Pages bir xil konfiguratsiyada.** `v55-verify.yml` endi frontendni `http://127.0.0.1:3001` bilan emas, `vars.VITE_API_BASE_URL` bilan build qiladi. Pages ham ayni repozitoriy o‘zgaruvchisini ishlatadi; o‘zgaruvchi yo‘q bo‘lsa fail closed.
4. **Release provenance/CI artifact.** `v55-release-gate.js` GitHub checkout HEAD va `GITHUB_SHA`ni tekshiradi; redacted summary SHA va API konfiguratsiyasining hashini saqlaydi. Pages `actions/download-artifact@v4` bilan tegishli upstream run ID ning redacted hisobotini oladi. `verify-pages-evidence.mjs` status, 9 PG suite, JS assets, commit va config hashni tekshiradi. Nomuvofiqlik deployni bloklaydi.
5. **Build tree filtri va avtomatik regressiya.** `validatePublishTree()` `.env`, `.map`, symlink, `.npmrc` va `node_modules`ni taqiqlaydi. Pages `index.html`/`404.html` tengligini tekshiradi. 9 yangi unit test hamda eski release testlari bilan moslik tasdiqlandi.

## Amalda bajarilgan testlar

- `npm run test:v57:unit` (backend) — **21 PASS / 0 FAIL**.
- To‘liq backend `node --test test/*.unit.test.js`: **450 PASS / 26 FAIL**. 26 xato faqat mavjud bo‘lmagan `express`, `bcrypt`, `pg`, `jsonwebtoken` modullaridan kelib chiqadi. To‘liq test suite **PASS emas**.
- Frontend `node --test test/*.test.js`: **178/178 PASS**.
- GitHub YAML offline parser bilan tekshirildi; Page trigger `workflow_run`, upstream CI `push main`. Real GitHub Actions natijasi **NOT_RUN** (repo ulanishi mavjud emas).
- PostgreSQL real integratsiya **SKIP**, Vite build **BLOCKED** (`vite: not found`), Telegram live va mobil brauzer E2E **NOT_RUN**.
- 185 qaror byte-for-byte saqlandi, CSV SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`. 42 forward migratsiya o‘zgarmagan.

**Release-chain PASS production approval emas.** Frontend GitHub Pages da statik sayt; backend va PostgreSQL alohida tizimda ishlashi kerak. GitHub Actions ishlatilmaguncha real CI natijasi haqida xulosa chiqarib bo‘lmaydi.
