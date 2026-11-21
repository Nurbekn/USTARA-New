# USTARA v143 — #76 Authentication / OTP / Public Profile UZ/RU/EN

## Scope: 7 work items

1. Created allowlisted `authLocale.js` with Uzbek, Russian and English display copy; unknown, duplicate and prototype-like language values fall back to Uzbek.
2. Added locale selector, back link, role switching and phone/password/CAPTCHA accessible labels on shared authorization screens.
3. Translated login headings, input validation, cooldown notice, sign-in, reactivation and safe navigation; kept actual authentication, session creation and booking-draft recovery unchanged.
4. Translated registration entry/role/specialty labels and continued the selected language to OTP through a fixed allowlisted path; original phone/password/role/specialty payload unchanged.
5. Translated OTP headings, digits, errors, status, Telegram launch, resend controls and session recovery. **OTP remains 5 digits and original one-minute/timer/cooldown/expiry rules were not changed.** The OTP page exposes its own locale selector because its outer header is hidden by CSS.
6. Created `publicProfileLocale.js` and translated the public barber profile's loading, empty and failure states, tabs, verification badge, posts, hours, reviews, booking entry and help link. The booking tab IDs and service selection URL remain unchanged; returning to Explore retains only allowlisted filters and drops auth/OTP query values.
7. Added 19 regression tests covering complete translation keys, fallback safety, public URLs, OTP and login logic, and profile/booking navigation. Updated 3 obsolete source-text snapshot assertions to verify localized copy and behavior.

## Measured checks

- Frontend `node --test test/*.test.js`: **1308 PASS, 0 FAIL, 0 SKIP, 0 TODO**.
- v143 specific `node --test test/v143AuthPublicProfileLanguages.test.js`: **19 PASS, 0 FAIL**.
- Backend unit `node --test test/*.unit.test.js`: **1412 PASS, 26 FAIL, 0 SKIP**. Those 26 failure names exactly match v142; source backend unchanged.
- TypeScript JSX parser seven modified `.jsx` components: **PASS**, and `node --check` for two new localization modules: **PASS**.
- `npm run build`: **BLOCKED** (`vite: not found`, no installed Vite). Local PostgreSQL/browser/mobile/Telegram end-to-end: **NOT_RUN**.
- The original 185-decision registry and original 46 forward + 2 rollback SQL migrations are to remain byte-identical to v142; final package audit records those hashes.

## Honest limits

- UI copy only: backend error-message catalog, password-reset flow, full account completion, customer profile editor, and all embedded ProfileIssueReport / queue / booking subcomponents are **not fully localized**. Translation quality should be reviewed in real browsers by Uzbek/Russian/English speakers.
- No package installation, database migrations, server deployment or production-readiness claim.
- No changes to OTP validity or Telegram-contact-triggered timer scheme; existing single OTP-screen behavior is preserved.
