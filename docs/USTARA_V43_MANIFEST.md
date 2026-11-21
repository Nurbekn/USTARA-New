# USTARA v43 manifest (2026-11-19)

- Source archive: `USTARA-4-Bosqich-Staging-Lease-Safety-v42.zip`
- Previous files: 646, preserved: 646, missing: 0
- Modified existing files: 13
- New source/documentation files before manifest: 8
- New files including manifest: 9; total: 655
- Previous SQL migration files unchanged: 44; forward migration count: 42
- Decision CSV SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`; unchanged
- Archive excludes `.env`, `.git`, `node_modules`, `dist`, keys and temporary outputs.

## Modified paths
- `USTARA-New/backend/package.json`
- `USTARA-New/backend/scripts/v40-staging.js`
- `USTARA-New/backend/scripts/v41-readiness.js`
- `USTARA-New/backend/scripts/v41-telegram-delivery-health.js`
- `USTARA-New/backend/services/queueTelegramNotifications.js`
- `USTARA-New/backend/services/smartBookingTelegram.js`
- `USTARA-New/backend/telegram/api.js`
- `USTARA-New/backend/test/queueTelegramNotifications.unit.test.js`
- `USTARA-New/docs/USTARA_LATEST_CHECKPOINT.md`
- `USTARA-New/docs/USTARA_PROGRESS.md`
- `USTARA-New/frontend/package.json`
- `USTARA-New/frontend/src/pages/queue/ManualQueue.jsx`
- `USTARA-New/frontend/test/manualQueueModelV38.test.js`

## Added paths (before manifest)
- `USTARA-New/backend/TELEGRAM_QUEUE_V43.md`
- `USTARA-New/backend/services/telegramRetryPolicy.js`
- `USTARA-New/backend/test/v43MonitoringStaging.unit.test.js`
- `USTARA-New/backend/test/v43TelegramRetry.unit.test.js`
- `USTARA-New/docs/USTARA_185_AUDIT_V43.md`
- `USTARA-New/docs/USTARA_V43_5_ISH.md`
- `USTARA-New/docs/USTARA_V43_TEST_RUNBOOK.md`
- `USTARA-New/frontend/test/manualQueueSessionV43.test.js`

This is a source integrity check, not production deployment validation. Real PG / live Telegram / mobile E2E NOT_RUN.
