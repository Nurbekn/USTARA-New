# USTARA v66 — 185 qaror / 42 migratsiya auditi

- Asl `docs/USTARA_185_NAZORAT.csv`: **185 ta qaror**; SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v65 bilan **bir xil**.
- Qarorlarning tarixiy toifalari: 130 ta qo‘shimcha tekshiruv talab qiladi, 47 qisman, 7 kechiktirilgan/bekor, 1 ochiq (#175). Bu 185 ta funksiya bitdi degani emas.
- **42 forward migratsiya** saqlandi, yangi migratsiya qo‘shilmadi; 2 rollback yordamchi SQL mavjud.
- `audit-phase1.js`: PASS, `v45-decision-integrity.js`: PASS.
- `v66` faqat CI, DB preflight va frontend release asset tekshiruvlari, 185 qaror asl fayli o‘zgarmagan.
- Haqiqiy PG, CI, Chrome, Telegram: **NOT_RUN/SKIP/BLOCKED**. Production-ready **EMAS**.
