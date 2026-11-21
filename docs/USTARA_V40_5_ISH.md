# USTARA v40 — 5 ish, kod va test dalillari (2026-11-19)

| № | Ish | Kod | Dalil | Cheklov |
|---:|---|---|---|---|
| 1 | Telegram invite consume: server tomonidagi expiry va bugungi queue holati | `backend/services/queueTelegramNotifications.js` | `v40QueueConsent.unit.test.js` | Real PG E2E o‘tmadi |
| 2 | Invite qayta berish 60s limiti faqat PostgreSQL soati bilan | `backend/services/queueTelegramNotifications.js` | `v40QueueConsent.unit.test.js`, oldingi testlar | Real PG E2E o‘tmadi |
| 3 | `/stopqueue` qator qulfini opt-in bilan bir xil tartibda olish | `backend/services/queueTelegramNotifications.js` | `v40QueueConsent.unit.test.js` | Tarmoqdagi in-flight xabarni qaytarib bo‘lmaydi |
| 4 | ManualQueue akkaunt almashinuvida eski async action natijalarini yashirish | `frontend/src/pages/queue/ManualQueue.jsx`, `manualQueueActionV40.js` | `manualQueueActionV40.test.js` va frontend 166/166 | Real browser E2E o‘tmadi |
| 5 | Faqat local test DB uchun read-only v39 migratsiya preflight va 5 staging testi | `backend/scripts/v40-staging.js` | `v40StagingGuard.unit.test.js`; ruxsatsiz launch fail-closed | Real test DB ulanmagan, 5 integratsiya testi SKIP |

**Qoidalar:** 185 kelishuv CSV matni o‘zgarmagan, OTP 1:00, Admin QR 1–120 daqiqa, Smart Booking taklifi 5 min, bron confirm 2 min, 42 forward migratsiya saqlangan. Yangi SQL migratsiya yo‘q.

**QA:** tanlangan backend v40+Telegram 20/20 PASS; backend full **315 PASS / 26 FAIL (missing npm modules)**; frontend **166/166 PASS**; frontend 123 JS/JSX fayl TypeScript parser syntactic PASS (bu Vite build emas); offline audit 185 qaror/42 migratsiya PASS. Backend va frontend `npm ci --offline` missing cache (`xtend`/`zod-validation-error`) sabab muvaffaqiyatsiz. Vite build/ESLint, real PG/Telegram/mobile/browser E2E **bajarilmadi**. Production-ready EMAS.
