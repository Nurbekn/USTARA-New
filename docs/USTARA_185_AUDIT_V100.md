# USTARA v100 — 185 qaror / 44 migratsiya auditi

- Asl `docs/USTARA_185_NAZORAT.csv`: **185 ta qaror**; SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v99 bilan **bir xil**.
- Tarixiy statuslar: **130 tekshiruv talab qiladi, 47 qisman, 7 bekor/kechiktirilgan, 1 ochiq (#175)**. Bu bajarilgan funksiyalar soni emas.
- #157 Ha/Yo‘q tasdig‘i: v100’da kod va 37 unit test qo‘shildi; browser E2E talab qilinganligi uchun **QISMAN**.
- **44 forward va 2 rollback SQL migratsiya** — o‘zgarmagan, offline audit PASS; real PostgreSQL NOT_RUN.
- Frontend 733/733 PASS; backend 1012 PASS / 26 missing-dependency FAIL; production-ready EMAS.
