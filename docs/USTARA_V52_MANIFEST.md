# USTARA v52 fayl yaxlitligi

- v51: **711 fayl**; v52 manifestdan oldin: **716 fayl**.
- Oldingi fayl yo‘qolgan: **0**. Yangilangan: **12**, yangi: **5**, o‘zgarmagan: **699**.
- Qarorlar SHA256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — original bilan bir xil.
- Forward migratsiyalar: **42** (papkada 44 ta SQL fayl, 2 tasi rollback yordamchi fayli).
- `node_modules`, `.env` va build `dist` arxivga kiritilmaydi.
- Backend: 411 PASS / 26 dependency FAIL; frontend 178 PASS, real E2E NOT_RUN.

### O‘zgargan fayllar
- `USTARA-New/backend/controllers/walkinQrController.js`
- `USTARA-New/backend/package.json`
- `USTARA-New/backend/services/smartBookingConfirmation.js`
- `USTARA-New/backend/services/smartBookingOffers.js`
- `USTARA-New/backend/test/manualQueueClaims.unit.test.js`
- `USTARA-New/backend/test/smartBookingConfirmation.unit.test.js`
- `USTARA-New/backend/test/smartBookingOffers.unit.test.js`
- `USTARA-New/backend/test/v38BookingLifecycle.unit.test.js`
- `USTARA-New/backend/test/v49OfferBoundaries.unit.test.js`
- `USTARA-New/backend/test/walkinQr.unit.test.js`
- `USTARA-New/docs/USTARA_LATEST_CHECKPOINT.md`
- `USTARA-New/docs/USTARA_PROGRESS.md`

### Yangi fayllar
- `USTARA-New/backend/WALKIN_QUEUE_V52.md`
- `USTARA-New/backend/test/v52FinalWriteFences.unit.test.js`
- `USTARA-New/docs/USTARA_185_AUDIT_v52.md`
- `USTARA-New/docs/USTARA_V52_5_ISH.md`
- `USTARA-New/docs/USTARA_V52_TEST_RUNBOOK.md`
