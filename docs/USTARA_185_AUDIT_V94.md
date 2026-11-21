# USTARA v94 — 185 qaror auditi

- Asl `docs/USTARA_185_NAZORAT.csv`: **185 ta qaror**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, v93 bilan aynan bir xil.
- Tarixiy holatlar: 130 tekshiruv kerak, 47 qisman, 7 kechiktirilgan/bekor, 1 ochiq (#175). Bu funksiyalar ishlayotganini isbotlamaydi.
- v94: #23, #31–33 bo‘yicha precondition himoyasi; `Boshladi` alohida event/status bo‘lib hali yo‘q va live testlar bajarilmagan. Talablar qisman.
- 42 forward, 2 rollback SQL o‘zgarmagan; offline audit PASS; PostgreSQL live test SKIP.
- Frontend 635 PASS, backend 880 PASS / 26 missing dependency FAIL. Production-ready **EMAS**.
