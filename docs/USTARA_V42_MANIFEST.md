# USTARA v42 — arxiv yaxlitligi

- Manba: `USTARA-4-Bosqich-Postgres-Telegram-Readiness-v41.zip` SHA-256 `944e3ab96cd099cd4a3e2760e00e0053b62eaed7332d9a1459ac3350d0c721fd`.
- v41 eski fayllar soni: 638; yo‘qolgan: 0.
- Maqsadli o‘zgargan eski fayllar: 10.
- Yangi fayllar: 8.
- Yakuniy fayllar: 646.
- v41/v42 185 qaror CSV SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- 42 SQL forward migratsiya saqlangan; yangisi yo‘q.
- `.env`, token, `node_modules`, `dist` va `.git` ZIPga kiritilmadi.
- Real DB/Telegram/mobile/build integratsiyasi bu manifest bilan tasdiqlanmaydi.

## O‘zgargan mavjud fayllar

- `backend/package.json`
- `backend/scripts/v40-staging.js`
- `backend/scripts/v41-telegram-delivery-health.js`
- `backend/services/queueTelegramNotifications.js`
- `backend/services/smartBookingTelegram.js`
- `backend/test/v39QueueDelivery.unit.test.js`
- `docs/USTARA_LATEST_CHECKPOINT.md`
- `docs/USTARA_PROGRESS.md`
- `frontend/package.json`
- `frontend/src/pages/queue/ManualQueue.jsx`

## Yangi fayllar

- `backend/test/v42DeliveryLease.unit.test.js`
- `backend/test/v42MigrationLedger.unit.test.js`
- `frontend/src/pages/queue/requestOrderV42.js`
- `frontend/test/manualQueueReadOrderV42.test.js`
- `docs/USTARA_V42_5_ISH.md`
- `docs/USTARA_185_AUDIT_V42.md`
- `docs/USTARA_V42_TEST_RUNBOOK.md`
- `docs/USTARA_V42_MANIFEST.md`
