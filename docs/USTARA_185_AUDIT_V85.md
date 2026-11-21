# USTARA v85 — 185 qaror nazorati

- Asl `USTARA_185_NAZORAT.csv` **185 ta** qaror; SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (v84 bilan bir xil).
- Tarixiy statuslar: 130 tekshiruv talab etadi, 47 qisman, 7 kechiktirilgan/bekor, 1 ochiq. Bu 185 ta funksiyaning yakunlanganini bildirmaydi.
- 42 forward va 2 rollback SQL: o‘zgarmadi, offline audit PASS; real PG **NOT_RUN**.
- v85 #6/#99 confirmation snapshot/expiry/session guards, +40 unit test; **hali qisman** — real mobil/Chrome/PostgreSQL bilan tasdiqlanishi kerak.
- Production-ready **EMAS**.
