# USTARA v41 — 5 ishning dalillari (2026-11-19)

**Manba:** v40 ZIP, eski funksiya va 185 qaror saqlandi; yangi SQL migratsiya yo‘q, jami 42.

| № | Ish | Kod va natija | Tekshiruv / cheklov |
|---:|---|---|---|
| 1 | QR Telegram havolasi va consent sanasi faqat PG soati bilan | `queueTelegramNotifications.js` — issue/consume/offerConsent database-side today/expiry shartlari | `v41ClockAuthority.unit.test.js`; **real PG sinovi o‘tkazilmagan** |
| 2 | Staging testlar SKIP bo‘lganda noto‘g‘ri PASS bermaslik | `v40-staging.js` TAP totals tekshiradi, 0/skip/fail/todo ni rad etadi | `v41StagingStrict.unit.test.js`; **5 real PG testi bajarilmadi** |
| 3 | Staging preflightni read-only va public schema bilan cheklash | `v40-staging.js` `default_transaction_read_only=on`, `search_path=public`; rol va constraint tekshiruvi | v40/v41 unit; **real PostgreSQL tekshiruvsiz** |
| 4 | Npm/build muammolari uchun yashirmaydigan offline readiness diagnostikasi | `v41-readiness.js`; modullar, 185 qaror, 42 migratsiya va E2E NOT_RUN | `v41Readiness.unit.test.js`; `npm ci` yakunlanmadi, Vite yo‘q |
| 5 | Telegram outbox uchun maxfiylikka rioya qiladigan read-only operator monitoringi | `v41-telegram-delivery-health.js`; faqat agregat count, failed/uncertain/stale lease, resend yo‘q | `v41TelegramDeliveryHealth.unit.test.js`; real DB mavjud emas |

**QA:** tanlangan v41+regressiya backend **24/24 PASS**, frontend **166/166 PASS**; full backend **327 PASS, 26 dependency MODULE_NOT_FOUND** (353 ta test). Offline 185 qaror / 42 migration audit PASS. Frontend `vite build` — binary yo‘q; gerçek PostgreSQL/Telegram/mobile/browser E2E — NOT_RUN. **Production-ready emas.**

**Ishga tushirish:** `cd backend && npm run test:v41:unit`, `npm run v41:readiness`, va faqat maxsus lokal ruxsatli PG bo‘lsa `npm run test:v41:staging`. Telegram health monitoring uchun `npm run v41:telegram:health` (faqat DB o‘qish). `.env`, `node_modules`, `dist` ZIPga kiritilmaydi.
