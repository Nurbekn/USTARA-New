# USTARA v153 — frontend source graph, Pages gallery and decision status evidence

## Seven verified code tasks

1. **Actual Pages image fix:** `frontend/src/pages/user/UserHome.css` no longer uses the broken root-absolute `/images/haircut-views.webp`; the `StyleGallery` uses `import.meta.env.BASE_URL` to construct `--uh-gallery-url`. The original image remains at `frontend/public/images/haircut-views.webp`.
2. **Static local import audit:** a package-free source check resolves relative imports across JS/JSX and rejects missing modules.
3. **Lazy dynamic import audit:** literal `import('./...')` and index/extensionless import resolutions also checked.
4. **CSS and public asset check:** relative CSS `url()`/`@import` assets verified; root-absolute and HTTP asset references fail closed.
5. **Source-tree safety:** exact-case paths, escapes outside `src`, symlinks and wrong-case file imports are rejected by the audit.
6. **CI / developer preflight:** new package-free `frontend/scripts/v153-source-graph.mjs` runs before npm installation in `.github/workflows/v55-verify.yml`, with `npm run preflight:graph` and 19 focused frontend tests.
7. **185-decision status audit:** read-only SHA-256-protected `backend/scripts/v153-decision-progress.mjs`, JSON report and 10 backend tests. **This does not modify or mark the original CSV as completed.**

## Targeted and full tests, Nov 20, 2026

- New frontend source graph: **19/19 PASS**.
- New backend decision progress: **10/10 PASS**.
- Full frontend: **1587/1587 PASS**.
- Full backend unit: **1443 PASS / 26 FAIL**; all 26 failure names match v152. Missing dependencies remain a blocker (e.g. `MODULE_NOT_FOUND`).
- v150 Pages source/lock PASS; v152 doctor source/lock/runtime PASS but Vite dependencies **0/17 installed**.
- v153 source graph offline: **176 JS/JSX, 31 CSS, 587 local imports (49 dynamic), 2 CSS local assets checked.** This check cannot compile JSX or replace a browser test.
- `npm ci --offline --ignore-scripts`: **ENOTCACHED**, specifically `zod-validation-error@4.0.2`. `npm run build`: **BLOCKED** (`vite: not found`).
- Real PostgreSQL, Chrome production bundle, Telegram E2E, GitHub Pages deploy: **NOT RUN**, **production-ready: NO**.

## 185-decision original registry — actual recorded state

- **130** `Tekshiruv kerak` — requires verification.
- **47** partial evidence/implementation.
- **7** cancelled/deferred by the user.
- **1** blocked/other (#175 currently missing shop model).
- **0** rows explicitly marked verified complete. This does **not** mean no code exists; it means the preserved, original registry has not certified them. See `docs/v153-185-decision-status-report.json`.
- The original CSV bytes and all **55 SQL files** are unchanged, as are existing backend implementation files.

## Next release-critical verification, prioritized

1. Run `npm ci` on a permitted internet-enabled CI runner, verify the 17 dependencies, and perform a real Vite build.
2. Execute the existing fail-closed PostgreSQL + Chrome mobile/desktop + built Pages smoke jobs; confirm output artifact SHA-256.
3. Verify backend unit failures disappear with dependencies present; do not hide, skip or reclassify test failures.
4. Use the original 185 registry to record **evidence-backed** verification in a separate report; do not rewrite decisions without authorization.
