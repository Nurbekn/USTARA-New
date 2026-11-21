# USTARA v135 — #165 Smart Link Preview, backend implementation evidence

## Deployment shape

```text
Frontend Vite / public SPA                 Backend Express public preview
VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN  --->  PUBLIC_PROFILE_PREVIEW_ORIGIN
                                         /share/barbers/:id  [HTML, OG/Twitter]
                                         /share-assets/profile-preview.jpg
                                          |
                           PostgreSQL approved-only getPublic(id)
                                          |
                     PUBLIC_PROFILE_APP_BASE_URL/barbers/:id --> React profile
```

Example (only after you own and configure real TLS domains):

```dotenv
# Backend
PUBLIC_PROFILE_PREVIEW_ORIGIN=https://api.example.uz
PUBLIC_PROFILE_APP_BASE_URL=https://nurbekn.github.io/USTARA-New
# Frontend .env.production (build-time)
VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN=https://api.example.uz
```

The public `/share/barbers/:id` route must be reachable by Telegram bots without authentication, bot challenges or an internal-only network; normal backend API origin-policy and rate limits still apply. Invalid/unapproved IDs return 400/404; DB failure returns 503, not fake or stale data. Reverse proxies/CDNs must honor `no-store` on metadata; outside messaging caches cannot be invalidated reliably.

## Code and threat model

- `backend/services/publicProfilePreview.js`: pure ID/origin validation, escaped OG/Twitter HTML, narrow metadata, robust status/no-store/noindex, defensive header policy.
- `backend/controllers/publicProfilePreview.js`: reuses `createBarberProfileService(pool).getPublic(id)` (SQL verifies approval, active barber user). Never read a stored customer phone or user auth token.
- `backend/server.js`: static image route and GET preview; API routes unchanged.
- `backend/public/share-assets/profile-preview.jpg`: **generic** 1200x630 image derived from the already bundled app haircut artwork. No remote URLs downloaded; user's photo is deliberately not embedded (image is not personalized).
- `frontend/src/pages/user/barber/publicShare.js`: optional configured public preview URL; fallback to direct SPA profile link when preview URL not configured. Fails closed on bad configured origin.
- `frontend/src/pages/user/barber/PublicProfileShare.jsx`: deployment build-time preview origin; native share, clipboard and manual fallback are preserved.
- Test files: `backend/test/v135PublicPreview.unit.test.js` (17) and `frontend/test/v135PublicLinkPreview.test.js` (9).

## What was actually executed

- Frontend 1168/1168 PASS. Backend 1402 PASS and 26 old missing-module errors unchanged. New 26/26 PASS.
- Syntax/parser checks PASS. npm ci offline FAIL ENOTCACHED; Vite build BLOCKED vite not found.
- Real Express listening socket+PostgreSQL+Telegram Web crawler NOT RUN, so **DO NOT** claim this displays a real Telegram preview yet.
- 185-decision CSV and 46+2 SQL migrations remain byte-identical to v134; no schema writes.

## Limitations

The previous frontend uses a Vite `base: '/USTARA-New/'`, and the deployed public application must correctly serve `/USTARA-New/barbers/:id` with SPA routing (GitHub Pages direct deep links require fallback configuration). Static preview images are not the profile owner's current avatar. Public link preview title/description changes take effect at fetch time; Telegram/WhatsApp may cache previously fetched metadata. HTTPS/hostname validation prevents accidental untrusted domains in preview configurations. Do not expose production credentials in `VITE_*` env vars.
