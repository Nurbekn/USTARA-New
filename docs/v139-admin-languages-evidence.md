# v139 — Admin locale implementation and verification

- Requirement: original 185-decision registry #76 (`O‘zbek rus ingliz tillari va Admin tarjimasi`). Source: v138 full ZIP, not an older GitHub branch.
- New translation model: `frontend/src/pages/adminLanguage.js`. The locale only changes UI text; login/session roles, `/api/admin/` request names, review outcome identifiers, and existing privacy protections are untouched.
- Locale URL accepted: only one `lang=uz`, `lang=ru`, or `lang=en`; duplicates and unsupported values fall back to Uzbek. Selecting language uses `replace` and discards unknown query parameters rather than copying potentially sensitive ones.
- Localized: login, side menu, header, overview statistics and profile-issues moderation table/controls. Not localized: other Admin operation detail views, main customer/barber app, backend notifications.
- Test runner: Node 22.16.0; `node --test test/v139AdminLanguages.test.js` gives 15/15 PASS, full frontend 1238/1238 PASS, backend 1412 PASS/26 missing-dependency FAIL (the same names as v138). TypeScript JSX diagnostics 0.
- Local npm cache lacks dependencies (`ENOTCACHED`), Vite CLI missing; browser and live database/Telegram checks were not run.
- SQL migration count: 46 forward + 2 rollback, unchanged. 185-registry hash unchanged. No migration added.
- This is not a validated deployment, and translation coverage is only partial.
