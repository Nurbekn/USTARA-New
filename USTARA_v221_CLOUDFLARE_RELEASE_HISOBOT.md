# v221 — Ishga tushirishga yaqinlashtirish

## Ko‘rilgan joylar
`frontend/vite.config.js`, `frontend/src/main.jsx`, `frontend/src/api/client.js`,
`frontend/src/pages/barber/data/v154QrSiteDestination.js`, `backend/middleware/originPolicy.js`,
`backend/database/poolConfig.js`, `frontend/scripts/validate-production-api.mjs`,
`frontend/package.json` va avvalgi testlar.

## O‘zgarish
1. `frontend/package.json`ga `build:cloudflare` (`vite build --base=/`) va
   mavjud HTTPS API URL validatoriga tayangan `prebuild:cloudflare` qo‘shildi.
2. `frontend/public/_redirects`: React Router uchun Cloudflare SPA fallback.
3. `frontend/test/cloudflareDeployment.test.js`: root base, URL himoyasi va
   GitHub Pages bilan moslik testlari.
4. `DEPLOY_CLOUDFLARE_RENDER_UZ.md`: Cloudflare + Render + Neon ishga tushirish
   tartibi, real smoke-test va cheklovlar.

## Haqiqiy sinovlar
- 103/103 tanlangan frontend, booking va deployment unit-testlari: PASS.
- 46/46 tanlangan backend booking/Telegram unit-testlari: PASS.
- Cloudflare buildga urinish: FAIL — `vite: not found` (npm registry DNS yo‘q).
- Backend `bookings.unit.test.js`: FAILED_TO_LOAD — `jsonwebtoken` o‘rnatilmagan.
- `security-phase2.unit.test.js`: 4/5 o‘tdi; JWT uchun 1 test `jsonwebtoken` yo‘qligi sabab FAILED_TO_LOAD.
- PostgreSQL, Telegram API, brauzer E2E, production deploy: NOT_RUN.

## Saqlanganlar
GitHub Pages’dagi `/USTARA-New/` default base, mavjud 185 qaror reyestri,
backend API, migrations, GitHub CI va auth/OTP qoidalari o‘zgartirilmagan.

## Qolgan ish
Internet ishlaydigan lokal/CI muhitda `npm ci` bajarib, Cloudflare build va
browser smoke-test o‘tkazish; haqiqiy backend+PostgreSQL va Telegramni alohida
sozlash. GitHub’ga commit, production bazaga ulanish yoki migratsiya qilinmadi.
