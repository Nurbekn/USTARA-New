# USTARA v44 — bajarilgan 5 ish

| № | Yo'nalish | O'zgarish | Asosiy fayl | Dalil |
|---|---|---|---|---|
| 1 | Telegram retry | Mavjud, ammo malformed `retry_after` avtomatik replay emas | `backend/services/telegramRetryPolicy.js` | `v44DeliveryGuards.unit.test.js` (API + queue/smart worker) |
| 2 | Operator health | Duplicate channel/status aggregate rad etiladi | `backend/scripts/v41-telegram-delivery-health.js` | `v44DeliveryGuards.unit.test.js` |
| 3 | Staging TAP | `tests/pass/fail/cancelled/skipped/todo` barchasi shart | `backend/scripts/v40-staging.js` | `v44DeliveryGuards.unit.test.js`, v41/v43 yangilangan fixtures |
| 4 | ManualQueue sessiyasi | In-flight xizmat so'rovlari login/logout epoch bilan eskiradi | `frontend/src/pages/queue/{ManualQueue.jsx,sessionRequestEpochV44.js}` | `frontend/test/sessionRequestEpochV44.test.js` |
| 5 | Npm readiness | Package manifest va haqiqiy resolvable entry, lockfile check | `backend/scripts/v41-readiness.js` | `backend/test/v44Readiness.unit.test.js`, v41 eski test yangilandi |

**Chegara:** Kod va unit-test dalili tayyor. Haqiqiy PostgreSQL, Telegram sandbox, telefon E2E, Vite build/lint hali tasdiqlanmagan. `185` qaror yozuvi saqlandi, hammasi bajarilgan degani emas.
