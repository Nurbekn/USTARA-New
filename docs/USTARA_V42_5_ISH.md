# USTARA v42 — bajarilgan 5 ta ish

| # | Ish | Asosiy fayl | Dalil | Natija |
|---|---|---|---|---|
| 1 | Queue worker NULL lease orphaned xabarni `uncertain`ga ajratadi | `backend/services/queueTelegramNotifications.js` | `v42DeliveryLease.unit.test.js` | Unit PASS, real PG NOT_RUN |
| 2 | Smart Booking worker NULL lease orphaned xabarni `uncertain`ga ajratadi | `backend/services/smartBookingTelegram.js` | `v42DeliveryLease.unit.test.js` | Unit PASS, real PG NOT_RUN |
| 3 | Operator health monitoringida NULL lease stale hisoblanadi | `backend/scripts/v41-telegram-delivery-health.js` | `v42DeliveryLease.unit.test.js` | Unit PASS, live monitoring NOT_RUN |
| 4 | Staging 42/42 migratsiya ledgerini aniq solishtiradi | `backend/scripts/v40-staging.js` | `v42MigrationLedger.unit.test.js` | Unit PASS, real PG NOT_RUN |
| 5 | Oddiy navbat polling eski javobni yangisiga ustma-ust yozmaydi | `frontend/src/pages/queue/ManualQueue.jsx` | `manualQueueReadOrderV42.test.js` | Unit PASS, mobil E2E NOT_RUN |

Yangi kod uchun 9 ta test PASS. Eski testlar bilan regressiya: backend tanlangan 41/41 PASS; frontend to‘liq 169/169 PASS. Production-ready emas. Bajarilmagan integratsiyalar bajarildi deb hisoblanmaydi.
