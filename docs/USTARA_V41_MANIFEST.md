# USTARA v41 — ZIP source manifest (2026-11-19)

- v40 file count: **628**; old files removed: **0**
- Existing files updated before manifest: **7**
- New files before manifest: **10**
- Decision CSV SHA256 unchanged: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`
- Forward SQL migrations: **42** (new: none)
- QA: backend selected 24 PASS; full backend 327 PASS / 26 MODULE_NOT_FOUND; frontend 166 PASS
- `npm ci` incomplete, `vite build` blocked, PG/Telegram/mobile E2E not run. **Not production-ready.**
- Excluded `.env*`, `node_modules`, `dist`, `.git`, keys, logs.

## Modified
- `USTARA-New/backend/package.json`
- `USTARA-New/backend/scripts/v40-staging.js`
- `USTARA-New/backend/services/queueTelegramNotifications.js`
- `USTARA-New/backend/test/queueTelegramNotifications.unit.test.js`
- `USTARA-New/backend/test/v40StagingGuard.unit.test.js`
- `USTARA-New/docs/USTARA_LATEST_CHECKPOINT.md`
- `USTARA-New/docs/USTARA_PROGRESS.md`

## Added before manifest
- `USTARA-New/backend/USTARA_V41_RUNBOOK.md`
- `USTARA-New/backend/scripts/v41-readiness.js`
- `USTARA-New/backend/scripts/v41-telegram-delivery-health.js`
- `USTARA-New/backend/test/v41ClockAuthority.unit.test.js`
- `USTARA-New/backend/test/v41Readiness.unit.test.js`
- `USTARA-New/backend/test/v41StagingStrict.unit.test.js`
- `USTARA-New/backend/test/v41TelegramDeliveryHealth.unit.test.js`
- `USTARA-New/docs/USTARA_185_AUDIT_V41.md`
- `USTARA-New/docs/USTARA_V41_5_ISH.md`
- `USTARA-New/docs/USTARA_V41_MANIFEST.md`
