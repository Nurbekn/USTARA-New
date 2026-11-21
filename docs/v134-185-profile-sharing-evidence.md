# v134 — public profile sharing / partial smart-link evidence

Source: v133 1088-file ZIP, all old files and original decisions/SQL preserved. This version adds a public URL sharing *client workflow*, not crawler-visible Open Graph metadata.

## Code touchpoints

- `frontend/src/pages/user/barber/publicShare.js`: pure canonical HTTPS URL builder, public-only preview data, browser Web Share → Clipboard → manual fallback, abort handling.
- `frontend/src/pages/user/barber/PublicProfileShare.jsx`: accessible share button, manual read-only field, asynchronous response/identity guard and status updates; no storage or API writes.
- `frontend/src/pages/barber/components/PublicProfilePreviewCard.jsx`: owner-only verified preview also exposes share control.
- `frontend/src/pages/user/barber/BarberPublicProfile.jsx`: public/customer detail header exposes share without private session in the URL.
- `frontend/src/pages/user/barber/BarberPublicProfile.css`, `frontend/src/pages/barber/barber.css`: mobile/wrap/focus targets.
- `frontend/test/v134PublicProfileSharing.test.js`: 16 unit and structural tests incl. ID, untrusted origins, PII, aborted native UI, clipboard/manual fallback, owner gate and no backend writes.

## Tests

- Frontend Node 22: 1159 PASS, 0 FAIL, 0 SKIP (16 new PASS).
- Backend Node 22: 1385 PASS, 26 old dependency FAIL; same exact 26 test names as v133.
- JSX parser: 3 changed/new JSX files 0 errors.
- Vite build: BLOCKED, vite not installed. Real browser/messaging crawler E2E: NOT_RUN.

## Limits

The shared URL depends on the actual hosting domain and correct SPA fallback routing, which have not been verified by browser/server E2E. Telegram/WhatsApp link unfurls need server-rendered public OG metadata; this release does NOT provide them and does NOT claim #165 completion. Existing public endpoint remains responsible for approved-profile visibility. Sharing uses no API writes, no auth token, no customer/private phone, no booking data, and no URL search/hash fragments.
