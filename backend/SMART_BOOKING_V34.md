# USTARA — v34: akkaunt faolsizlantirilishi va Smart Booking xavfsizligi

## Muammo va yechim

`accountPauseController` mijozning `users` qatorini `FOR UPDATE` qiladi, undan keyin `deactivated_at`ni o‘zgartiradi. v33 da `smartBookingConfirmation.confirm` va `manualQueueClaims.assertCustomer` faqat `customers` (`c`) qatorini `FOR UPDATE` qilardi. JOIN ichida `u.deactivated_at IS NULL`ni oddiy tekshirish bilan deactivation transaction bilan to‘g‘ri serializatsiya kafolatlanmaydi.

v34 ikkala mutatsiya yo‘lida ham **`FOR UPDATE OF c,u`** ishlatadi. Lock `BEGIN` → `COMMIT/ROLLBACK` davomida qoladi. Navbat kodi ishlatish, rozilikni bekor qilish, haqiqiy bron tasdiqlash va idempotent replaydan oldin user faol ekanligi shu lock ostida tasdiqlanadi. Avvalgi `customers` → sartarosh advisory lock tartibi saqlanadi. Faolsizlantirish oldin yutsa, eskirgan sessiya `401 invalid_session` oladi; bron tasdiqlash oldin yutsa, deactivation kutadi va faol bron tekshiruvi uni bloklashi kerak — **bu ikkinchi holat real PG race testi bilan hali tasdiqlanmagan**.

## O‘zgargan fayllar

- `backend/services/smartBookingConfirmation.js` — confirm uchun users+customers row lock.
- `backend/services/manualQueueClaims.js` — claim/revoke uchun users+customers row lock.
- `backend/test/smartBookingConfirmation.unit.test.js`, `backend/test/manualQueueClaims.unit.test.js` — 4 yangi test: lock tartibi, stale session, claim/revoke lock, faol bo‘lmagan user.
- `backend/package.json` — `test:smart-booking:v34` alias.
- `docs/USTARA_185_NAZORAT.csv` — faqat #135 dalili yangilandi, asl qaror va status saqlandi.
- `docs/USTARA_185_AUDIT_V34.md` — audit.

## 2026-11-18 da haqiqatda bajarilgan tekshiruvlar

- `npm run test:smart-booking:v33` (yangi testlar shu suite ichida): **69/69 PASS**.
- `node --test test/decisionCoverage.unit.test.js`: **3/3 PASS** (69 ichida ham mavjud).
- `npm run audit:decisions`: 185 qaror, 131 tekshiruv / 46 qisman / 7 keyinga / 1 ochiq.
- `node scripts/audit-phase1.js`: 40 migratsiya va 185 qaror structural PASS.
- `node --test test/accountPause.unit.test.js`: **ishga tushmadi: MODULE_NOT_FOUND bcrypt**; PASS deb hisoblanmaydi.
- Real PostgreSQL concurrency, Telegram va mobil E2E, Vite build/lint: **bajarilmadi**. v34 uchun yangi migration yo‘q. Frontendga o‘zgartirish kiritilmadi; oldingi v33 156/156 faqat baseline.

## Keyingi haqiqiy integratsiya (faqat ruxsat etilgan, ajratilgan test muhiti)

1. Staging muhitida `backend` va `frontend` uchun `npm ci`ni to‘liq tugating; `bcrypt`, `pg`, `express`, `jsonwebtoken`, `vite` mavjudligini tekshiring. Haqiqiy token/parollarni chatga yubormang.
2. Izolyatsiyalangan PostgreSQL, test user va test ma’lumotlarini alohida ruxsat bilan tayyorlang; real production bazasiga ulanilmasin. Migratsiya faqat alohida explicit ruxsat bilan.
3. Ikki connection bilan `deactivate` vs `confirm` (har ikki yutish tartibi), `deactivate` vs `manual claim`, `deactivate` vs `manual revoke` testlarini bajarish. `confirm` yutganda account pause `active_bookings` qoidasi bilan 409 qaytarishi kerak.
4. Existing read-only opt-in test: `NODE_ENV=test USTARA_SMART_V30_DB_AUDIT=I_AUTHORIZE_READ_ONLY_TEST ... node --test test/smartBookingV30.postgres.integration.test.js` — bu **faqat indeks va advisory lock**ni tekshiradi, v34 user row-lock race uchun yetarli emas. Database URLni foydalanuvchining o‘z lokal muhitida saqlash kerak.
5. Telegram private callback, `/stopqueue` / re-opt-in va browser E2E ni alohida test qiling.

## Cheklov

`FOR UPDATE` borligini tasdiqlovchi mock unit testlari haqiqiy PostgreSQL concurrency isboti **emas**. 185 qaror ro‘yxatda borligi 185 funksiya tayyorligini bildirmaydi. Production-ready emas. ZIP’ga `.env`, `node_modules`, `dist`, token va private key kiritmang.
