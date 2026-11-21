# USTARA v106 — 185 qaror / 44 migratsiya auditi

- 185 ta qarorning asl `USTARA_185_NAZORAT.csv` SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — o‘zgarmagan.
- Tarixiy toifalar: tekshiruv kerak 130, qisman 47, bekor/kechiktirilgan 7, ochiq 1 (#175). Bu 185 funksiya tugaganini isbotlamaydi.
- #153 Safe Day Closing **QISMAN** — faqat read-only readiness snapshot mavjud, persist day closure hali yo‘q.
- 44 forward SQL, 2 rollback SQL o‘zgarmagan; offline audit PASS, haqiqiy PG NOT_RUN.
- Production-ready emas, dependency to‘siqlari mavjud.
