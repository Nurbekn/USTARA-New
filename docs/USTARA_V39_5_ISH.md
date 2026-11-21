# USTARA v39 — 5 ish, tekshiruv dalillari

| № | Ish | Kod/manba | Test | Holat |
|---:|---|---|---|---|
| 1 | `uncertain` xabar holati uchun 42-migratsiya | `backend/database/migrations/20261213_queue_delivery_uncertain.sql`; bootstrap/verify | `v39QueueDelivery.unit.test.js` (schema) | Offline PASS; real DB hali yo‘q |
| 2 | Eskirgan `processing` lease → noaniq, avtomatik replay yo‘q | `queueTelegramNotifications.js` `claim()` | `v39QueueDelivery.unit.test.js` (crash) | Unit PASS |
| 3 | Telegram `message_id` va chat ID ACK tekshiruvi | `queueTelegramNotifications.js` `step()` | `v39QueueDelivery.unit.test.js` (valid/invalid) | Unit PASS |
| 4 | 429 / 4xx / 5xx xato siyosati, 6-urinish limiti | `queueTelegramNotifications.js` `step()` | `v39QueueDelivery.unit.test.js` (retry) | Unit PASS |
| 5 | Eskirgan/roziliksiz pending xabarlar cleanup va preflight | `queueTelegramNotifications.js` `claim/step()` | `v39QueueDelivery.unit.test.js` (stale) | Unit PASS |

**O‘zgarmagan:** 185 ta qaror mazmuni, OTP bir daqiqa, QR Admin TTL 1–120m, Smart Booking taklifi 5m, tasdiqlash 2m, mavjud 41 migratsiya. Kafolatlar: faqat unit/offline; real integratsiya tasdiqlanmagan.

**Yakuniy testlar (2026-11-19):** `npm run test:queue-telegram:v39` — 32/32 PASS; `npm run test:unit` backend — 310 PASS, 26 MODULE_NOT_FOUND; frontend — 162/162 PASS. `npm run audit:phase1` 185/42 PASS. Haqiqiy PostgreSQL, haqiqiy Telegram, mobil E2E, Vite build/lint bajarilmadi.
