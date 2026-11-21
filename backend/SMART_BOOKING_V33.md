# USTARA — v33 Smart Booking / qaror reyestri va ruxsat himoyasi

## O‘zgarishlar

- `backend/services/smartBookingOffers.js`: manual customer `decideByCustomer` user/customer identifikatsiyasini `FOR SHARE OF c,u` bilan tranzaksiya tugaguncha ushlab turadi; bloklangan akkauntning eski JWTsi taklifni qabul qila olmaydi. Barber advisory lockdan keyin manual ticket ownership va rozilik qayta tekshiriladi.
- `backend/services/smartBookingTelegram.js` va `telegram/offerCallbacks.js`: Telegramda taklif qabul qilingandan so‘ng ham haqiqiy bron avtomatik yaratilmasligini va vebda 2 daqiqalik tasdiqlash kerakligini aniq tushuntiradi.
- `frontend/src/layouts/UserLayout.jsx`: #60 bo‘yicha `Asosiy → Sartaroshlar → Ilhom → Bronlar → Profil`.
- `backend/scripts/decision-coverage.js` / `backend/test/decisionCoverage.unit.test.js`: 185 qaror CSV yaxlitligini va holat farqini nazorat qiladi. `docs/USTARA_185_AUDIT_V33.md` da 131 tekshiruv / 46 qisman / 7 bekor-keyinga / 1 ochiq.

## Lokal bajarilgan testlar (2026-11-18)

- Backend tanlangan v33 unit: **65/65 PASS** (`npm run test:smart-booking:v33`).
- Frontend unit: **156/156 PASS** (`node --test test/*.test.js`).
- Barcha backend unit: **261 PASS / 26 FAIL (`MODULE_NOT_FOUND`)**. Yetishmayotgan `pg`, `express`, `bcrypt`, `jsonwebtoken` uchun tegishli suite'lar ishga tushmagan; ular kod xatosi sifatida diagnostika qilinmagan.
- CSV reyestr va offline SQL audit: **185 qaror / 40 forward migratsiya**.
- Real PostgreSQL tranzaksiya, webhook/callback live Telegram, browser E2E, Vite build, ESLint: **BAJARILMADI**. `vite` topilmagan; `npm ci` ishlash uchun paket manbasi kerak. **Production-ready emas.**

## Staging QA (faqat ajratilgan, ruxsat etilgan test muhitida)

1. Izolyatsiyalangan PostgreSQL instansiya, test roli va bo‘sh test DB tayyorlang; **real foydalanuvchi DBsini ishlatmang**. Migrationlardan oldin backup va rollback rejasini ko‘rib chiqing.
2. Yetishmayotgan paketlarni `npm ci` orqali tarmog‘i ishlaydigan muhitda o‘rnating. `node --test test/*.unit.test.js`ni qayta bajaring. `frontend`da `npm ci`, `node --test test/*.test.js`, `npm run build`, `npm run lint` (script mavjud bo‘lsa) bajaring.
3. Ikki mustaqil DB ulanishida (a) bitta navbatga ikkita offer, (b) consent revoke vs accept, (c) customer deactivate vs accept, (d) repeat confirm, (e) overlapping booking va (f) eski Telegram xabar callbacklarini sinab ko‘ring. Darhol ishga tushiriladigan destructiv fixture faqat alohida DB va aniq rozilik bilan.
4. Telegram bot bilan private callback, /stopqueue, qayta opt-in va eski tugmalarni tekshiring; yuborishning exactly-once kafolati yo‘qligini monitoringda hisobga oling.
5. Android/iOS browser QR, manual navbat, OTP 1:00, Admin QR TTL 1–120min, 5min taklif, 2min bron tasdiqlash, 5 tab navigatsiyani sinang.
6. Qisqa sinov protokoli, test dalillari va ochiq xatolarni checkpointga yozing; faqat shundan so‘ng productionga yaqinlik baholansin.

## Ehtiyot choralari

`.env`, real token, private key, password, `node_modules`, `dist` ZIP ichiga kiritilmaydi. Oldingi 40 migration va 185 qaror matni o‘zboshimchalik bilan o‘zgartirilmaydi. Har bir v34 vazifasi shu fayldan davom ettiriladi.
