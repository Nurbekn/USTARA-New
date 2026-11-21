# v141 / #76 — Site Shell language evidence

**Scope:** 3-language presentation-only shared navigation for public site, customer, barber and help links; **not** full site i18n. Baseline v140, zero backend/SQL changes.

## Navigation and privacy guarantees

- `readSiteLocale` accepts a single allowlisted `lang` and returns `uz` for unknown, duplicates and inherited-property names. `siteLocalePath` constructs **internal routes only**, with `lang` encoded by URLSearchParams. `siteLocaleSwitchUrl` forwards a small allowlist of non-sensitive search filters, bounded to 100 characters. All other query data (OTP, token, password, auth) is dropped on language changes.
- `SiteLanguageSelect` uses client-side navigation with `replace:true`, not local/session storage and not a backend API call. Untranslated business labels are not silently translated from server data.
- Decision #60: customer bottom navigation stays **five** fixed tabs, ordered Home / Barbers / Inspiration / Bookings / Profile. Existing route ids, auth guards, avatar, session handling, booking inbox fetch and barber pending count unchanged.
- Help content retains its existing own `?lang` implementation; outbound static Help links now include the chosen language. No user data is included in Help links.
- Responsive select CSS provides focus-visible indicator; no additional customer navigation tab is introduced.

## Validation

`node --test test/v141SiteShellLanguages.test.js test/customerNavigation.test.js` → **19/19 PASS** (18 new + old navigation test). `node --test test/*.test.js` → **1276/1276 PASS**. Test expectations from v137/v138 were updated solely to accept language-aware internal links while continuing to verify destinations.

Backend: `node --test test/*.unit.test.js`: **1412 PASS, 26 FAIL** with the same 26 failure names as v140, no backend source change. Parser: 6 changed JSX files PASS; JS syntax PASS. Offline npm install failed ENOTCACHED; Vite build blocked (`vite: not found`). Actual browser/mobile and PG integration remain NOT_RUN. No production readiness claim.
