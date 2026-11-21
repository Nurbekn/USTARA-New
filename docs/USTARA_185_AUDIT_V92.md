# USTARA v92 — 185 qaror auditi

- 185 talab asl CSV: o‘zgarmagan; SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- Tarixiy statuslar: 130 ta tekshiruv kerak, 47 qisman, 7 kechiktirilgan/bekor, 1 ochiq. Bu 185 funksiyaning bitganini **bildirmaydi**.
- #128: v92 QR status fail-closed, account switch, barber queue commit safety, 31 unit test. **Qisman**: real PostgreSQL va mobil E2E hali yo‘q.
- 42 forward/2 rollback SQL migratsiya o‘zgarmagan; offline PASS. Production-ready emas.
