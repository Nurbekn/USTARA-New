# USTARA v44 — ZIP yaxlitligi

- v43 manba: **655** fayl.
- v44 rejalangan: **663** fayl.
- Saqlanmagan v43 fayli: **0**.
- Yangi fayllar: **8**; o'zgargan mavjud fayllar: **12**.
- 185 CSV SHA256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- Migration count: **42 forward**. Yangi SQL yo'q.
- `.env`, `node_modules`, `dist`, token va kalitlar arxivga kiritilmaydi.

## Yangi fayllar
- `USTARA-New/backend/test/v44DeliveryGuards.unit.test.js`
- `USTARA-New/backend/test/v44Readiness.unit.test.js`
- `USTARA-New/docs/USTARA_185_AUDIT_V44.md`
- `USTARA-New/docs/USTARA_V44_5_ISH.md`
- `USTARA-New/docs/USTARA_V44_MANIFEST.md`
- `USTARA-New/docs/USTARA_V44_TEST_RUNBOOK.md`
- `USTARA-New/frontend/src/pages/queue/sessionRequestEpochV44.js`
- `USTARA-New/frontend/test/sessionRequestEpochV44.test.js`

## O'zgargan fayllar
- `USTARA-New/backend/package.json`
- `USTARA-New/backend/scripts/v40-staging.js`
- `USTARA-New/backend/scripts/v41-readiness.js`
- `USTARA-New/backend/scripts/v41-telegram-delivery-health.js`
- `USTARA-New/backend/services/telegramRetryPolicy.js`
- `USTARA-New/backend/test/v41Readiness.unit.test.js`
- `USTARA-New/backend/test/v41StagingStrict.unit.test.js`
- `USTARA-New/backend/test/v43MonitoringStaging.unit.test.js`
- `USTARA-New/docs/USTARA_LATEST_CHECKPOINT.md`
- `USTARA-New/docs/USTARA_PROGRESS.md`
- `USTARA-New/frontend/package.json`
- `USTARA-New/frontend/src/pages/queue/ManualQueue.jsx`

## QA cheklovlari

Backend 26 ta `MODULE_NOT_FOUND` testi ishga tushmadi; bu o'tdi degani emas. Real DB/Telegram/mobil E2E va Vite/ESLint build NOT_RUN/BLOCKED.
