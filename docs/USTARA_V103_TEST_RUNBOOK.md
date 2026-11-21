# v103 — test buyruqlari

`cd frontend && npm run test:v103:unit`

`cd frontend && npm run test:unit`

`cd backend && node --test test/bookingModification.unit.test.js`

`cd backend && npm run test:unit`

`cd backend && node scripts/audit-phase1.js && node scripts/v45-decision-integrity.js`

Production verification (NOT_RUN): `npm ci` for each app; `npm run build` for frontend; PostgreSQL integration suite against isolated disposable test DB; browser E2E. Never aim migration/reset scripts at production.
