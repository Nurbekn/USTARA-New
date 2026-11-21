# USTARA v43 — bajarilgan 5 ish va dalillar

| # | Ish | Asosiy o'zgarishlar | Dalil va cheklov |
|---|---|---|---|
| 1 | Telegram 429 retry_after'ni to'liq hurmat qilish | `backend/telegram/api.js`, `backend/services/telegramRetryPolicy.js` | `v43TelegramRetry.unit.test.js` PASS; Telegram real API NOT_RUN |
| 2 | Queue Telegram worker xavfsiz cooldown | `backend/services/queueTelegramNotifications.js` | 2h va >30d fake API test PASS; real PG NOT_RUN |
| 3 | Smart Booking Telegram worker xavfsiz cooldown | `backend/services/smartBookingTelegram.js` | 2h va >30d fake API test PASS; real PG NOT_RUN |
| 4 | Monitoring/staging yolg'on holatlariga qarshi | `backend/scripts/v41-telegram-delivery-health.js`, `backend/scripts/v40-staging.js`, `backend/scripts/v41-readiness.js` | `v43MonitoringStaging.unit.test.js` PASS; real DB NOT_RUN |
| 5 | Manual Queue 401 sessiyani tozalash | `frontend/src/pages/queue/ManualQueue.jsx` | `manualQueueSessionV43.test.js` PASS; browser E2E NOT_RUN |

Yangi testlar 10/10 PASS. Tanlangan backend 38/38; frontend tanlangan 8/8; to'liq frontend 170/170 PASS. Full backend 342 PASS / 26 dependent module missing FAIL. Test muhitidagi bloklar production testdan o'tganlik deb ko'rsatilmagan.
