# USTARA v96 — 185 qaror audit

- Source `docs/USTARA_185_NAZORAT.csv`: 185 ta qaror; SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, v95 bilan **bir xil**.
- Qayd holatlari: 130 ta «Tekshiruv kerak», 47 «Qisman», 7 kechiktirilgan/bekor, 1 ochiq (#175).
- #23 «Keldi Boshladi Tugadi va kelmadi»: kodda arrival state/endpoint+UI bor, real DB/Chrome/live E2E hali bajarilmagan, **QISMAN**.
- SQL: **44 forward** (oldingi 43 o‘zgarmagan), 2 rollback helper; offline audit PASS, real PostgreSQL SKIP.
- Frontend 681 PASS; backend 957 PASS / 26 dependency FAIL; production-ready **YO‘Q**.
