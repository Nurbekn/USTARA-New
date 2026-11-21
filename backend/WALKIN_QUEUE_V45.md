# USTARA — oxirgi checkpoint v45 (2026-11-19)

**Asos:** `USTARA-4-Bosqich-Telegram-Staging-Integrity-v44.zip`. **Natija:** `USTARA-4-Bosqich-Release-Guards-v45.zip`.
**Bosqich:** 4-bosqich — QR, walk-in navbat, Smart Booking. **Production-ready EMAS.** v44 dan davom etildi.

## v45 da bajarilgan aynan 5 ish
1. `backend/scripts/v40-staging.js`: real `TAP version 13` bo'lmagan/yakunida `not ok` yoki `Bail out!` bo'lgan testni hatto `exit 0` bo'lsa ham PASS deb belgilamaydi.
2. `backend/scripts/v41-telegram-delivery-health.js`: `pending` bo'lmagan row uchun `due/overdue_pending`, `processing/sending` bo'lmagan row uchun `stale_lease` qiymati nol bo'lishi shart. Noto'g'ri aggregate rad etiladi.
3. `frontend/src/pages/queue/{ManualQueue.jsx,manualQueueModel.js}`: muddati o'tgan `pending`/`accepted` taklifga qabul/tasdiqlash tugmalari chiqarilmaydi; eskirgan `accepted` taklifga xizmat ro'yxati API so'rovi boshlanmaydi. **Server hali yagona authority**.
4. `backend/scripts/v41-readiness.js`: npm module entry realpath aynan o'rnatilgan paket papkasi ichida bo'lishi shart; boshqa joyga chiqadigan `main` yo'li o'rnatilgan paket deb qabul qilinmaydi. Diagnostika versiyasi v45.
5. `backend/scripts/v45-decision-integrity.js`: 185 kelishuv CSV SHA-256 baseline va CSV tuzilmasi tekshiriladi; CSV o'zgarsa tasodifan 'PASS' bo'lmaydi. Bu hech bir talab ishlab chiqilganini tasdiqlamaydi.

## Tekshiruvlar
- Backend yangi + moslik tanlangan **21/21 PASS** (`npm run test:v45:unit`).
- Backend to'liq `npm run test:unit`: **357 PASS, 26 FAIL**, 26 tasi `MODULE_NOT_FOUND` (yetishmayotgan `pg`/`express`/`bcrypt`/`jsonwebtoken` va bog'liq paketlar). Shu sabab to'liq suite **PASS EMAS**.
- Frontend tanlangan **9/9 PASS** (`npm run test:v45:unit`), frontend to'liq **175/175 PASS** (`npm run test:unit`). **Vite production build va ESLint bajarilmadi** (`vite`/`eslint` binarlari yo'q).
- `npm ci --offline`: backend va frontend **ENOTCACHED** (npm cache yetarli emas). Real PostgreSQL server va Telegram sandbox berilmagan. `v40-staging.js` ruxsatsiz ishga tushish urinishini rad etdi. Real DB, Telegram va mobil browser E2E: **NOT_RUN**.
- Offline audit **185 qaror/42 forward migration PASS**; CSV sha256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` o'zgarmadi. **Yangi SQL migratsiya yo'q.**

## Keyingi v46 / real integratsiyani yopish
Alohida lokal `ustara_test_db` va `ustara_account_test` test rolini tayyorlab, npm paketlarni ishonchli tarmoq orqali o'rnatish; staging preflight va 5 real PostgreSQL testini, to'liq backend suite, Vite/ESLint, Telegram sandbox va mobil E2E'ni bajarish. `.env`, token, parol, DB URLni ZIPga joylamang. Test `SKIP` natijasini PASS demang.

# USTARA v45 — testlarni qayta o'tkazish (maxfiy ma'lumotlarsiz)

Ishni v45 ZIP manbasidagi `USTARA-New` dan boshlang. Ma'lumotlar bazasi va Telegram uchun faqat alohida test muhiti hamda test bot ishlatilsin.

```bash
cd USTARA-New/backend
npm ci
npm run test:v45:unit
npm run test:unit
npm run v45:decisions
npm run audit:phase1
npm run v45:readiness
cd ../frontend
npm ci
npm run test:unit
npm run build
npm run lint
```

`v45:readiness` paket yetishmasa non-zero bilan to'xtashi kutiladi. v45 da Vite, ESLint, PostgreSQL va Telegram live E2E muhit sabab **tasdiqlanmadi**.

Staging uchun `backend/scripts/v40-staging.js` faqat maxsus lokal `ustara_test_db` va cheklangan `ustara_account_test` roli, `NODE_ENV=test` va aniq ruxsat bilan ishlaydi. Rollar/sxemalarni tekshirmasdan uni production DB ga yo'naltirmang. Test chiqishida `skipped` yoki `todo` bo'lsa natija PASS emas. Haqiqiy test bot tokenini hech qachon chatga yoki ZIPga yozmang.
