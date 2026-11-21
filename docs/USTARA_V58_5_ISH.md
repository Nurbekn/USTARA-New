# USTARA v58 — 5 ta ish va test dalillari

**v57 → v58. Release pipeline yaxlitligi; production-ready EMAS.**

## 1. GitHub qayta ishga tushirishda artifact to‘qnashuvini oldini olish
`.github/workflows/v55-verify.yml` va `deploy-pages.yml` artifact nomlarini `ustara-v58-ci-summary-<run ID>-<attempt>` qildi. GitHub `actions/upload-artifact@v4` bir xil artifact nomini re-run oralig‘ida ishlatishga urinmasligi uchun har urinish ajratiladi. Pages aniq `workflow_run.id`/`workflow_run.run_attempt` ga tegishli nomni ko‘radi.

## 2. CI release provenance
`backend/scripts/v55-release-gate.js` ichidagi `verifiedSourceRun()` `GITHUB_ACTIONS=true` bo‘lganda `GITHUB_RUN_ID` va `GITHUB_RUN_ATTEMPT` ni tekshiradi. `release.json` ichiga faqat sonlar va tekshirilgan commit hamda API hash kiradi; raw token, PostgreSQL URL kiritilmaydi.

## 3. Redacted summary eski urinishni qabul qilmaydi
`backend/scripts/v56-ci-summary.js` mos run ID + attempt, backend/frontend TAP, to‘qqiz PostgreSQL suite, JS assets va sha/hash dalillari mos kelgandagina `releaseGate: PASS` beradi. Oldingi urinish dalili yangi urinishga o‘tkazilmaydi. `productionReady: false` saqlanadi.

## 4. Pages dalilini aniq tekshirish
`frontend/scripts/verify-pages-evidence.mjs` exact run ID/attempt/commit/API hash tekshiradi. JSON kattaligi 16 KiB dan oshsa yoki nomuvofiq bo‘lsa fail-closed. GitHub workflow aynan verified run attemptni environment orqali uzatadi.

## 5. Haqiqiy e'lon qilinadigan fayllarni qayta ko‘rish
`scripts/publish-tree-check.cjs` umumiy validator, `frontend/scripts/verify-pages-build.mjs` esa Pages CI jobida Vite build va SPA `404.html` nusxalashdan keyin ishga tushadi. Build index/404 aynan bir xil, haqiqiy JS entry mavjud, maxfiy `.env`, `.npmrc`, source map va symlink yo‘q bo‘lishi shart.

## Amalda bajarilgan testlar
- **8 ta yangi test**, tanlangan backend `npm run test:v58:unit`: **29 PASS / 0 FAIL**.
- Barcha backend unit: **458 PASS / 26 FAIL**; 26 tasi yo‘q `express`, `bcrypt`, `pg`, `jsonwebtoken` paketlari sabab, shuning uchun to‘liq suite PASS emas.
- Frontend **178/178 PASS**.
- PostgreSQL integration **1 SKIP**, real GitHub Actions **NOT_RUN**, Vite build **BLOCKED** (`vite: not found`). Telegram va mobil E2E **NOT_RUN**.
- 185 qaror matni SHA-256 bo‘yicha saqlangan; 42 forward migratsiya offline PASS.

**Talab:** haqiqiy GitHub repo, test PostgreSQL va HTTPS backend/API bo‘lmasdan turib ishlab chiqarishga chiqarilgan tizim muvaffaqiyatli deb da'vo qilinmaydi.
