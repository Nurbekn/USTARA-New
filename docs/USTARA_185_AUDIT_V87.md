# USTARA v87 — 185 qaror nazorati

- Asl CSV 185 qaror, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (v86 bilan bir xil).
- Tarixiy holatlar: 130 tekshiruv kerak, 47 qisman, 7 kechiktirilgan/bekor, 1 ochiq.
- #17 bekor qilish qoidalari: COMMIT noaniqligida connection pool guard + cancellation response session guard; hali **QISMAN**.
- #106 xavfsiz bronni ko‘chirish: receipt va session guard; hali **QISMAN**.
- 42 forward + 2 rollback migratsiya o‘zgarmadi; offline audit PASS; PG real NOT_RUN.
- Production-ready emas.
