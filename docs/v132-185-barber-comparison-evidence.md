# v132 — Decision #95 public barber comparison evidence

Baseline v131: `USTARA-v131-185-Followed-Barbers-Home-Safety.zip`, 1080 entries, SHA-256 `c2c1202ebda5c9f486227d5a3fd447ba177658f8a2cb3f3b96c02e8c83b31def`.

## Source changes

- `frontend/src/pages/user/explore/compareModel.js`: `visibleCompareIds`, `toggleComparedBarber`, `comparisonRows` are pure functions; restrict provider IDs to current filtered results, approved profile state, integer range and max 3. Preserve input order, avoid mutation and do not infer unavailable prices, rating, location or slots.
- `frontend/src/pages/user/explore/ComparisonPanel.jsx`: accessible headings, live selection counts, remove/clear, published price & service context, factual route-independent straight-line distance, profile/booking links.
- `frontend/src/pages/user/Explore.jsx`: ephemeral compared ID state; reset on filter changes/retry/reset, keep on map/list display toggle, no persistent storage. Only current, valid search results can be compared.
- `frontend/src/pages/user/explore/ResultCard.jsx`: accessible pressed state and disabled fourth selection; only public barber search cards show compare action.
- `frontend/src/pages/user/Explore.css`: mobile single-column comparison, responsive button layout.
- `frontend/test/v132BarberComparison.test.js`: 16 regression tests for ID bounds, cap/duplicates, published/filtered identities, service pricing, unknown values, linking, isolation, source accessibility hooks.

## Local test execution (2026-11-20)

- Frontend Node 22 test runner `node --test test/*.test.js`: **1126 PASS, 0 FAIL, 0 SKIP**.
- Backend Node 22 `npm test`: **1385 PASS, 26 FAIL**; exact v131 failure names, no new failures (dependency issues remain).
- Targeted `node --test test/v132BarberComparison.test.js`: **16 PASS**.
- Syntax of three JSX files using installed TypeScript parser: **0 parse diagnostics**.
- `npm ci --offline` frontend/backend: `ENOTCACHED`; Vite not installed. No actual Vite build, no React browser render verification, no real PostgreSQL server, no Telegram E2E.

## Security / functional limits

- Public comparison does not require or create a booking. Clicking booking still uses existing confirmation flow.
- No new public API, DB migration, or persistent favorite state. Only currently approved filtered barber rows from existing catalog may appear.
- Rating and straight-line distance are displayed only when known; **not** a claim of verified review provenance, travel distance or availability.
- App unit tests and source inspection cannot establish real mobile-browser correctness; retain production-ready=false.

CSV registry SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` unchanged. Migrations: 46 forward / 2 rollback preserved byte-for-byte.
