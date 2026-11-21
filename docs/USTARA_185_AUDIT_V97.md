# USTARA v97 — 185 qaror auditi

- Original CSV: 185 qaror; SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — **o‘zgarmagan**.
- Oldingi statuslar: 130 `needs_verification`, 47 `partial`, 7 `deferred_or_cancelled`, 1 `open` (#175).
- #23 va #128: `arrived` holatida mijoz self-exit mantiqi va UI uyg‘unligi kuchaytirildi. Haqiqiy PostgreSQL/Chrome/E2E hali yo‘q: **QISMAN**.
- SQL: 44 forward va 2 rollback, eski baytlar saqlangan. Offline PASS; haqiqiy PostgreSQL NOT_RUN.
- Frontend 696 PASS; backend 991 PASS / 26 dependency FAIL. **Production-ready YO‘Q**.
