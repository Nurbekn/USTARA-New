# v133 — public/guest profile preview and readiness evidence

Source baseline: v132 verified ZIP with 1084 entries; no deletions, no migration or original 185-decision modification.

## Changed files and meaning

- `frontend/src/pages/barber/data/publicPreview.js`: pure role/session/approved/ID gate and seven-point honest data readiness; cannot contain secrets or create bookings.
- `frontend/src/pages/barber/components/PublicProfilePreviewCard.jsx`: accessible preview URL opens public `/barbers/:id` new tab, owner-status text, unsaved edit warning, missing/unknown content links.
- `frontend/src/pages/barber/Profile.jsx`: full preview and checklist.
- `frontend/src/pages/barber/Portfolio.jsx`: compact customer-view shortcut.
- `frontend/src/pages/barber/Dashboard.jsx`: compact customer-view shortcut.
- `frontend/src/pages/user/barber/BarberPublicProfile.jsx`: public route never injects barber account token; customer route may use only customer role token; honest guest notice.
- `frontend/src/pages/barber/barber.css`, `frontend/src/pages/user/barber/BarberPublicProfile.css`: responsive, 44px minimum tap targets and clarity.
- `frontend/test/v133PublicCustomerPreview.test.js`: 17 pure/structural tests covering role token isolation, stale session/ID, pending/rejected, unknown API fields, location, services/hours/post, unsaved edits, private info and guest route.

## Measured test evidence

- Frontend Node 22 `node --test test/*.test.js`: 1143 PASS, 0 FAIL, 0 SKIP; new 17 PASS.
- Backend Node 22 `npm test`: 1385 PASS, 26 FAIL. Same prior 26 dependency failure names as v132; no new failures.
- TypeScript parser of 5 changed JSX files: 0 parse errors.
- npm ci offline frontend/backend: ENOTCACHED, Vite production build BLOCKED.
- Real PostgreSQL, browser/mobile E2E, Telegram E2E and deploy: NOT_RUN.

## Trust boundary

No private user phone or JWT copied into public preview model. This UI does not grant backend authorization: real public visibility remains enforced by existing public API. New links are available only when current barber owns approved profile. The guest public route intentionally does not fetch logged-in-only posts or reviews, which are labelled as login-required. Readiness checklist is based on local server-loaded profile data and can be incomplete if subsystem data fails; it is not a public publication or verification authority. No claims of production readiness.
