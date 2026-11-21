# USTARA v131 — Home kuzatuvlari va sessiya izolyatsiyasi dalillari

- **Asos:** v130 ZIP, origin SHA-256 `dbb5f1df3deaea4626ecca76d30791258a0a878756723d7bc25bf60ced0ec0e3`.
- **Asl qaror:** `#38,Kuzatilgan sartaroshlar Home boshida,6,Tekshiruv kerak` — bu checkpoint CSV statusini o‘zgartirmaydi; integratsiya va UI real E2E kerak.
- **Asosiy kod:** `frontend/src/pages/user/UserHome.jsx`, `UserHome.css`, `explore/homeModel.js`.
- **Test:** `frontend/test/v131FollowedHomeSafety.test.js`. Positive and negative: real follow key, unapproved/unknown ID exclusion, dedup, 6-card cap, lower cards retained, invalid ID rejection, advertised-ID validation, token/profile/account identity, abort+render-time guard, source error isolation and UI placement. Existing `customerHome.test.js` remains green.
- **No fake values:** following IDs and advertisement IDs only from server results matched to approved catalog. Ranking uses existing location helper, no invented distance or rating.
- **Privacy:** current-session identity rechecked after concurrent `Promise.allSettled`; old render state discarded while reloading, never rely solely on `AbortController` after completion.
- **Test evidence:** `node --test test/*.test.js` frontend 1110/1110 PASS; `npm test` backend 1385 PASS and 26 pre-existing dependency failures with identical names vs v130; TypeScript JSX parse PASS. No skipped frontend/backend unit-tests.
- **Not executed:** npm install (offline ENOTCACHED), Vite build (`vite` unavailable), real PostgreSQL, mobile/Telegram E2E.
- **Invariants:** original CSV SHA `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`; old 46 forward + 2 rollback SQL files unchanged; zero deleted files. Packaging with CRC + exact-file SHA comparison and manifest.
- **Ready for production:** NO.
