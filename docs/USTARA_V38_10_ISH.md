# USTARA — v38: 10 ta vazifa xaritasi

| № | Ish | Koddagi dalil | Test dalili | Holat |
|---:|---|---|---|---|
| 1 | Tasdiqlangan bronning audit actor'i | `backend/services/smartBookingConfirmation.js` | `v38BookingLifecycle.unit.test.js` | Unit PASS |
| 2 | Eski queue-call outboxini bekor qilish | same | same | Unit PASS |
| 3 | Eski offer notice bekor qilish | same | same | Unit PASS |
| 4 | Queue Telegram subscriptions uzish | same | same | Unit PASS |
| 5 | Hali ishlatilmagan Telegram invite o‘chirish | same | same | Unit PASS |
| 6 | Telegram yuborish javobini qat’iy tekshirish | `backend/services/smartBookingTelegram.js` | `v38TelegramDelivery.unit.test.js` | Unit PASS |
| 7 | Telegram urinish limiti to‘lgan pendingni tugatish | same | same | Unit PASS |
| 8 | Mijoz sessiyasi almashganda private data isolation | `frontend/src/pages/queue/ManualQueue.jsx` | `manualQueueModelV38.test.js` + TSX sintaksis | Unit/statik PASS |
| 9 | Takroriy katalog chaqiruvi / retry UX | same | same | Unit/statik PASS |
| 10 | 20 xizmat limiti, timer va login affordance | `frontend/src/pages/queue/manualQueueModel.js` + JSX | `manualQueueModelV38.test.js` | Unit PASS |

**Qo‘shimcha**: tanlangan/full unit, offline 185/41 audit, ZIP sha/path integrity. **Hali yo‘q:** real PostgreSQL, Telegram API E2E, mobile browser, frontend Vite build/lint (`vite`/`eslint` yo‘q). Kodning o‘rganilgan xususiyati bilan real production tayyorlikni adashtirmang.
