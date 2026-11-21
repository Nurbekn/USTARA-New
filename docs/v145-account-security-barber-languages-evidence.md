# v145 — account security and barber profile UI localization (185 / #76)

Baseline: `USTARA-v144-185-Recovery-Inner-Profile-Languages.zip` (1131 files; SHA-256 `d91eafd4217d8a81801e48951ad14c186f49bfebe1f4a36e6af6ce18ccf2d803`).

## Seven implementation groups

1. `PhoneChangePanel`: Uzbek, Russian and English copy for password, number choice, bot/OTP, resend, expiry, attempts, confirmation, success and validation. **Existing 5-digit OTP handling, server-derived deadlines, cooldown, authenticated request bodies and logout semantics remain unchanged.** On successful number change the sign-in navigation preserves only `lang`.
2. `DeviceSessionsPanel`: translated safe device list labels, status/errors, confirmation, current-device marker and date formatting. Device labels continue to come from the protected server endpoint; no IP or session tokens rendered.
3. `RevokeSessionsAction`: translated explicit confirmation/failure and session revocation button; protected endpoint and JWT usage unchanged.
4. `DeactivateAccountAction`: translated explicit opt-in warning, password confirmation and action status. Account pause is **not** permanent account deletion; backend enforces any active-booking restriction.
5. `pages/barber/Profile.jsx`: translations for barber profile form, saving, location warnings, logout, and subpage labels; navigation retains only verified language. Existing `updateProfile` payload and validation boundaries retained.
6. `WorkingHours` and `TelegramLinkCard`: translated weekday names and visual captions without changing weekday IDs/times, plus bot connection status, instructions and actions without changing protected endpoints or five-minute token expiry.
7. Added `accountLocaleV145.js` and locale/security regression coverage; adjusted the existing Telegram request-helper test loader to ignore JSX-only locale imports while still executing and asserting real protected request behavior.

## Measured verification

- Frontend: **1350 PASS / 0 FAIL / 0 SKIP**, including **19 new v145 tests**.
- Targeted 27/27 PASS (v145 new and existing Telegram request-contract tests).
- Backend unit: **1412 PASS / 26 FAIL**, names of the 26 failures identical to v144; no new backend regressions. Missing packages are an environment limitation, **not** a successful backend suite.
- TypeScript parser (JSX+JS syntax): **8 edited/added production files checked, 0 parse diagnostics**.
- `npm run build`: **BLOCKED** (`vite: not found`); true Vite compilation and real browser/multilingual accessibility not validated.
- Real isolated PostgreSQL, Telegram and Chrome/mobile E2E: **NOT_RUN**.
- Original 185-decision CSV hash and original SQL migration files remain byte-for-byte identical; backend source unchanged.

## Known gaps and next work

- #76 remains **PARTIAL**: profile preview checklist, remaining barber operational screens, server-returned Uzbek error strings and server-side notifications still need localization and real browser verification.
- UI localization does not change login permissions, OTP timers, phone-change server rules or migration status. There are no claims of live server or Telegram verification.
- To validate real app readiness: obtain backend/frontend dependencies, run Vite build, use a disposable local `ustara_test_db` for PostgreSQL integrations, then test UZ/RU/EN on actual mobile browsers. **Not production-ready.**
