# USTARA v39 — file-by-file manifest

- Old ZIP SHA256: `8fb0c0039b37459fda70029d9626b1a3c6fed14e4ba96286326d2f036c5a225d`
- Old files: 613; deleted: 0
- All 185 decision CSV rows preserved byte-for-byte: True

## Changed (only purposeful)
- backend/database/bootstrap.sql
- backend/database/bootstrap/verify.sql
- backend/package.json
- backend/services/queueTelegramNotifications.js
- backend/test/audit-phase1.unit.test.js
- backend/test/bootstrap-plan.unit.test.js
- backend/test/queueTelegramNotifications.unit.test.js
- backend/test/smartBookingV30.unit.test.js
- backend/test/walkinQueue.unit.test.js
- docs/USTARA_LATEST_CHECKPOINT.md
- docs/USTARA_PROGRESS.md

## Added (not counting this manifest)
- backend/WALKIN_QUEUE_V39.md
- backend/database/migrations/20261213_queue_delivery_uncertain.sql
- backend/test/v39QueueDelivery.unit.test.js
- docs/USTARA_185_AUDIT_V39.md
- docs/USTARA_V39_5_ISH.md

## Security/exclusions
- No `.env`, `node_modules`, `dist`, `.git`, credentials or log outputs included.
- 42 forward SQL migrations, only one new (`20261213_queue_delivery_uncertain.sql`).
- Mock/unit pass does **not** imply DB/Telegram E2E or production readiness.
