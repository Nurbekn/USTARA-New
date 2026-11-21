# USTARA v140 — Admin operational i18n evidence (#76, 2026-11-20)

Based strictly on `USTARA-v139-185-Admin-Language-Foundation.zip`; the 185 original decisions are not rewritten. The original #76 row is still `Tekshiruv kerak` (not automatically marked complete). This version extends the existing allowlisted `?lang=uz|ru|en` Admin display to the previously untranslated operational screens.

## Seven implementation groups

1. **Users:** localized table columns, role labels, missing-name label, irreversible delete confirmation and fallback error.
2. **Barbers:** localized table, verified/other status labels, approve/reject confirmations, and actions.
3. **Bookings:** localized columns, known status labels, and Tashkent time formatting adapted to the chosen locale.
4. **Post reports:** localized columns and irreversible post-deletion confirmation.
5. **Account recovery:** localized table, known statuses, review buttons, and reason prompt (still prohibits private document numbers/passwords).
6. **Promotions:** localized column headers, labels, button text, promotion confirmation, hours setting and fallback error.
7. **Queue QR / Telegram:** localized QR expiration form, numeric validation message, read-only diagnostics and mode-conflict warning. The TTL and API response semantics are unchanged.

`frontend/src/pages/adminOperationsLocale.js` provides dictionary lookup for the 3 exact language IDs. `adminTableHeaders` yields copies, `adminStatusLabel` and `adminRoleLabel` use `Object.hasOwn` to avoid prototype-key confusion, and unknown server status identifiers remain visible unchanged rather than being assigned an invented translation. `AdminPanel.jsx` renders the labels but sends the same API paths, methods, role values and mutation bodies. `frontend/test/v140AdminOperationsLanguages.test.js` adds 20 focused tests. One v129 source-inspection regression test was updated to inspect the localized error source; the receipt check and `await load()` safety behavior remain required.

## Test and environment evidence

- Frontend: `node --test test/*.test.js` → **1258 PASS, 0 FAIL, 0 SKIP**.
- v140 new tests: **20 PASS, 0 FAIL**. v139 locale tests: 15 PASS.
- Backend unchanged from v139. `node --test --test-concurrency=8 test/*.unit.test.js` → **1412 PASS, 26 FAIL** (existing unavailable dependencies/other environment-related failures; no backend files changed in v140).
- TypeScript TSX/JSX parser on `AdminPanel.jsx`: **PASS**. `node --check` on translation module: **PASS**.
- `npm ci --offline --ignore-scripts`: **ENOTCACHED**, missing tarball `zod-validation-error@4.0.2`; `npm run build`: **vite: not found**.
- Original 185 CSV SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — unchanged. Original 46 forward + 2 rollback migration SQL files — unchanged.
- Real PostgreSQL, Vite production build, real-browser/mobile, Telegram crawler/worker E2E: **NOT_RUN/BLOCKED**. **Production-ready: NO**.

## Deliberate limitations

This is **Admin operational UI language support only**, not a completed site-wide i18n release. Free-text API values such as submitted report reasons, names, or new server-defined statuses are intentionally not machine-translated. Server error messages originating outside this file may remain in the original language. Translation does not change roles/permissions, data writes, local account settings, or URL security behavior. Validate full mobile UI and all three languages in a real browser when a working Vite build is available.
