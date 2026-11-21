# USTARA v64 — 185 qaror yaxlitligi

- `docs/USTARA_185_NAZORAT.csv`: **185 qaror**; SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, v63 bilan bir xil.
- 185 qarorning tarixiy holati: **130 tekshiruv kerak, 47 qisman, 7 bekor/keyinga qoldirilgan, 1 ochiq (#175)**. Bu 185 implementatsiya degani emas.
- **42 forward SQL migratsiya**, 2 yordamchi rollback SQL; ularning matni v63 bilan bir xil.
- `node backend/scripts/audit-phase1.js`: PASS; `node backend/scripts/v45-decision-integrity.js`: PASS.
- v64 HTML/Chrome tekshiruvi biznes qoidalarini yoki asl kelishuvlarni o‘zgartirmaydi.
- Haqiqiy GitHub Actions, PostgreSQL 9 suite, Telegram live, Vite build, production Chrome va mobil E2E: **NOT_RUN/BLOCKED**. Production-ready **EMAS**.
