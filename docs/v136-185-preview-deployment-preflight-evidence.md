# USTARA v136 — public profile URL and deployment preflight evidence

## Why this change

`frontend/vite.config.js` uses `base: '/USTARA-New/'`. In v135 the fallback `window.location.origin + '/barbers/:id'` omitted `/USTARA-New` when no Open Graph preview origin was configured. The resulting link could be a broken deep link even though the profile exists. v136 passes the Vite `BASE_URL` to the pure public URL builder. It does not copy the current route/query or auth details.

## Usage and checks

```sh
cd USTARA-New/backend
PUBLIC_PROFILE_PREVIEW_ORIGIN=https://preview.example.uz \
PUBLIC_PROFILE_APP_BASE_URL=https://nurbekn.github.io/USTARA-New \
VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN=https://preview.example.uz \
  node scripts/v136-preview-preflight.mjs
```

Successful local output `READY_FOR_LIVE_VERIFICATION` means all SIX local preflight conditions passed. It does **not** mean the site, mobile app, Vite build, PostgreSQL, Telegram, WhatsApp, crawlers, or DNS were tested. Missing config => `BLOCKED_CONFIG_OR_ASSET`, nonzero exit code 2. The JSON response contains no JWT, passwords or other private credentials.

It verifies exact HTTPS origin equality (the backend and client point at the same host), the deployed frontend URL's path matches Vite's base, the app-owned JPEG is under 200 KB and 1200×630, and the public GET route exists. Images and routes are examined locally; no network requests are made.

## Code and tests

- `frontend/src/pages/user/barber/publicShare.js`: root and subpath public links, strict prefixes, safe title/description, consistent Web Share/clipboard/manual fallback.
- `frontend/src/pages/user/barber/PublicProfileShare.jsx`: `import.meta.env.BASE_URL` alongside existing optional preview origin, resets old feedback when base changes.
- `backend/services/publicProfilePreview.js`: added accessible OG/Twitter image metadata and secure_url; no personalization of static image, approved-only DB guard preserved.
- `backend/scripts/v136-preview-preflight.mjs`: no-install offline readiness checker; six gates, fail-closed exit status, JPEG header dimensions parser, productionReady always false.
- `backend/test/v135PublicPreview.unit.test.js`: previous exact model assertion updated with newly documented public `imageAlt` field.
- `frontend/test/v136ShareBasePath.test.js`: 11 new tests.
- `backend/test/v136PreviewPreflight.unit.test.js`: 10 new tests.

## Limits / external tests required

A real domain must expose HTTPS endpoint and public JPEG for robots, and correctly route React `/USTARA-New/barbers/:id` after navigation or refresh. Some static hosts (including GitHub Pages) need an explicit deep-link fallback for browser refresh. Proxy configuration and Telegram unfurl caching must be checked in staging. Never claim Open Graph preview is visible in Telegram without actually fetching and verifying it there.

## Executed regression evidence

- Frontend 1179/1179 PASS; backend 1412 PASS / 26 old identical dependency FAIL. All 21 new tests passed (frontend 11 + backend 10).
- Offline deployment preflight without environment config yields `BLOCKED_CONFIG_OR_ASSET`; with correctly formatted example values, 6/6 local checks pass, but result remains `READY_FOR_LIVE_VERIFICATION`, not real deployment.
- Node JS syntax PASS, JSX TypeScript parser 0 diagnostics. `npm ci --offline`: ENOTCACHED; `npm run build`: vite not found.
- Actual PostgreSQL, HTTP bot requests, Telegram/WhatsApp preview, mobile browser NOT_RUN. Not production ready.
