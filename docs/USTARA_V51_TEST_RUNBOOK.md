# USTARA v51 — test yo'riqnomasi

**Ajratilgan test muhiti:** hech qachon production PostgreSQL yoki haqiqiy mijoz chatiga ulanib test o'tkazmang. `DATABASE_URL`/`TEST_DATABASE_URL` faqat maxsus `ustara_test_db`, maxsus test foydalanuvchisi va izolyatsiyalangan botga tegishli bo'lsin. `.env`ni ZIPga kiritmang.

## Unit / offline

```bash
cd USTARA-New/backend
npm ci
node --test test/v51QrConsentBoundaries.unit.test.js test/v50QrAccountClock.unit.test.js test/queueOfferConsent.unit.test.js test/v41ClockAuthority.unit.test.js test/queueTelegramNotifications.unit.test.js
npm run test:unit
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
npm ci
node --test test/*.test.js
npm run build
```

## PostgreSQL va E2E

1. Productiondan ajratilgan lokal `ustara_test_db`, test login va tekshiruv ruxsati mavjudligini tasdiqlang.
2. Loyiha skriptidagi staging guard talablarini o'qing (`backend/scripts/v49-staging.js`). Faqat maxsus test muhitida ishga tushiring. `SKIP` 0 PASS hisoblanadi.
3. Ikki PG sessiyada QR token lock kutish / expiry chegarasi, QR approval 30m rollback va `offerConsent`ning takroriy yoqish/o'chirish so'rovlarini tekshiring.
4. Alohida Telegram sandbox bot bilan yuborish, opt-out va eski tugmalarni tekshiring; haqiqiy foydalanuvchilarga xabar yubormang.
5. Mobil brauzerda QR status, kechagi status, eski polling va sessiya almashuvini E2E sinang.

**Ushbu muhitdagi real holat:** `pg`/`express`/`bcrypt`/`jsonwebtoken` topilmadi, `vite` topilmadi; frontend node:test 178/178 PASS; PG staging guard ruxsatsiz urinishni blokladi. Real DB/Telegram E2E bajarmadik.
