# USTARA v122 — #16/#42/#164 search-to-booking integrity (2026-11-20)

## Scope (seven changes)

1. Filtered provider price boundaries use the **chosen service ID**, not any cheaper/unrelated service on that profile.
2. Price sorting and displayed price derive from the same service-aware `listingPrice` helper. An unknown price stays unknown, never an invented zero.
3. `Bron qilish` from a filtered catalog preselects a provider-owned service via `tab=services&services=<id>`. The existing InlineBooking still requires customer consent, a live server quote and manual confirmation. Invalid or unrelated service IDs are not propagated.
4. Reject malformed/bookmarked `q`, `area`, numeric `rating`, `distance`, `service`, `available` URL filters rather than silently widening results. The search field is length-limited to 160 characters with an explicit error state for bad URLs.
5. Public barber directory payload validation checks service ID/name/price, duplicated IDs, declared provider associations and service ID consistency. Untrusted malformed published records cause a load error, not fabricated offers. The server remains the authority.
6. Map labels distinguish coordinate-bearing profiles from the total number of matching profiles. Missing coordinates are not invented; all matching profiles remain available in list view.
7. Expanded isolated search/API regression tests and attempted dependency/build readiness preflight. Failed dependency installation is recorded as blocked, **not success**.

## Functional evidence and limits

- Added `frontend/test/v122ExploreServicePricing.test.js`: covers selected price, booking link, malformed filters, payload validation, coordinate count, and HTTP error responses with a mocked fetch (no real backend).
- Existing v116/v121 source-string tests updated to assert the new valid booking URL shape instead of the old hard-coded `?tab=services` string.
- `docs/USTARA_185_NAZORAT.csv` is unchanged. Decision statuses remain historical evidence, not production verification.
- Backend code, existing SQL migrations, and real database data are not modified.
- This branch descends from reconstructed v114 via v121, **not** a byte-identical archive of the historical v114.

## Build/test status

- Actual npm registry DNS access: `EAI_AGAIN`; `npm ci --offline` backend/frontend: `ENOTCACHED`. No package installations were completed.
- All frontend Node unit tests: **1007 PASS, 0 FAIL, 0 SKIP** (v121: 992). New v122 file: **15 PASS**.
- Backend Node unit tests: **1327 PASS / 26 FAIL**, all 26 names identical to the v121 baseline (missing npm modules).
- Vite build attempt failed **exit 127 / `vite: not found`**; real PostgreSQL, Chrome/mobile E2E, Telegram E2E and deployment: **NOT_RUN / BLOCKED**. Production-ready: **NO**.
