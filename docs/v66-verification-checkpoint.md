# USTARA v66 — isolated verification checkpoint

Date: 2026-11-19
Branch: `verification/v66-github-pages` (main unchanged).

## Observed repository baseline
- `frontend/package.json`: React 19, Vite 8, npm build script.
- `frontend/vite.config.js`: deployment base `/USTARA-New/`.
- `frontend/package-lock.json` and `backend/package-lock.json` exist.
- `backend/db.js`: environment-variable-based PostgreSQL pool.
- `frontend/index.html`: no PWA manifest link at this revision.

## Added in v66
- `scripts/verify-frontend.mjs`: checks built HTML local script/style/image assets against the configured public base, optional manifest and icons, and rejects paths outside dist.
- `scripts/verify-postgres.cjs`: checks an isolated writable test/staging database with a temporary table, inside a rolled-back transaction.
- `.github/workflows/v66-verification.yml`: separate frontend build and PostgreSQL readiness jobs.

## Not yet validated
- GitHub Actions success (a workflow run must be triggered and observed).
- Production browser rendering, dynamic import chunks, route refreshes and PWA caching.
- Running actual SQL migrations and full backend/frontend suites.
- Telegram sandbox, OTP timing, QR expiry and mobile E2E.
- Claims previously made about 87/87 and 178/178 tests are historical checkpoint figures, **not verified on this repository revision**.

## Next safe steps
1. Run the GitHub Actions workflow on this branch (or open a PR) and inspect logs.
2. Investigate any Vite GitHub Pages base-path failures without changing production routing blindly.
3. Identify the canonical v65 source/archive before integrating migrations or modifying application logic.
4. Merge only after CI and manual review pass.
