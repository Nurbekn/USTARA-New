# USTARA v93 — 185 qaror auditi

- Asl `docs/USTARA_185_NAZORAT.csv`: **185 ta qaror**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, o‘zgarmagan.
- Tarixiy statuslar: 130 tekshiruv kerak, 47 qisman, 7 kechiktirilgan/bekor, 1 ochiq. 185 ta funksiya tugadi degani **emas**.
- v93: #23, #29, #31, #32 navbat UI qismlarini qisman yaxshilaydi; real DB/E2E talablar ochiq.
- 42 forward va 2 rollback SQL o‘zgarmagan; offline PASS, live PostgreSQL **NOT_RUN**.
- Frontend unit 615 PASS; backend 849 PASS/26 npm dependency FAIL. Production-ready **EMAS**.
