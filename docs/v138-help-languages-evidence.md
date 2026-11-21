# v138 — #76 HelpCenter localization evidence

**Scope:** only the public `/help` page. It remains a static FAQ with no account actions, API submission or machine translation.

| Item | Outcome |
|---|---|
| O‘zbekcha FAQ and historical links | Unchanged by default |
| Russian/English | 8 complete FAQ texts each, including answers and link labels |
| Category, search and onboarding UI | Translated with language selector |
| Deep-link | `/help?topic=booking&lang=ru` / `&lang=en` |
| URL safety | Allowlisted `uz` / `ru` / `en`; invalid/duplicate locale defaults to Uzbek |
| Security | No token/PII included in help topic paths, no outgoing help requests |
| Accessibility | Native `<select>`, labelled control, `lang` and visible focus outline |

## Actual tests

- `node --test frontend/test/v138HelpLanguages.test.js`: 25/25 PASS.
- `node --test frontend/test/*.test.js`: 1223/1223 PASS.
- Backend unit: 1412 PASS / 26 known dependency FAIL (same names as v137).
- JSX TypeScript parse: 0 diagnostics. `vite build`: BLOCKED (`vite: not found`).
- Real browser, PostgreSQL, and Telegram E2E: NOT_RUN.

## Not implemented

The original #76 also requests admin translation and whole-site language support. Those are NOT implemented here. Do not mark #76 complete based on this checkpoint.
