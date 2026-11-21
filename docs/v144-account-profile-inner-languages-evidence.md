# v144 / 185 qaror #76 — ichki profil va hisobni tiklash interfeyslari

## Source

- Exact baseline: `USTARA-v143-185-Auth-Otp-Public-Profile-Languages.zip` (1128 files), SHA-256 `82c5f4484909779169e179d62437102084a587a18bb2261475d574b0362eb445`.
- This patch covers selected UZ/RU/EN **interface strings only**. Existing user records, customer/salon business decisions, login/OTP protocol and PostgreSQL migration logic are not edited.

## 7 implemented groups

1. ForgotPassword: phone, 5-digit code, password and completion UI; help dialog and local validation messages.
2. Password reset safety: language-specific fixed links, kept code length, verify/resend/complete requests and timeout checks intact.
3. AccountRecovery: UZ/RU/EN form, tracking-code guidance, display-only status labels with own-key guard. Exact server `status`, `caseId` and `ticketToken` payloads unchanged.
4. CompleteProfile: registration/name form labels, expired timer copy and safe signup/login/OTP routes; existing 15-minute completion expiry and save commands unchanged.
5. Customer profile: personal-info/address editor labels, status/confirm dialog and map marker copy; existing server-side validations and unsupported birthdate save remain untouched.
6. Barber setup: workplace and working-hours screen labels, retry and save copy, with existing working-hour / location payload shape unchanged.
7. Regression: 23 new pure-Node locale and route tests, independent JSX syntax parsing and existing frontend/backend unit suite re-run.

## Verified locally (2026-11-20)

- `node --test test/v144InnerProfileLanguages.test.js`: **23 PASS, 0 FAIL, 0 SKIP**.
- `node --test test/*.test.js` frontend: **1331 PASS, 0 FAIL, 0 SKIP**.
- `node --test test/*.unit.test.js` backend: **1412 PASS / 26 FAIL**; failure names match the unmodified v143 baseline exactly. Backend source not edited.
- TypeScript AST parser check for 5 modified JSX and 1 new JS module: **PASS**.
- `npm run build`: **BLOCKED** (`sh: 1: vite: not found`). No claim of successful bundle or browser render.
- 185-decision CSV SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` unchanged.
- All previous 55 `.sql` files preserved byte-for-byte, including 46 forward + 2 rollback migrations.
- Real PostgreSQL, browser/mobile, Telegram and deployed link-preview E2E: **NOT_RUN**.

## Known limitations

- #76 is **partial**: nested PhoneChangePanel, ProfilePhotoSheet, WorkingHours, remaining barber profile forms and some server-generated validation errors can still appear in Uzbek.
- No new global session state, localStorage for language, or credential-bearing URL state. Locale remains an allowlisted query value.
- Password reset tokens, tracking tickets, passwords and OTP do not enter navigational URLs. The only account recovery token remains in its original POST body and protected on-screen state.
- Release is **NOT production-ready** without Vite/build and genuine PostgreSQL/browser verification.
