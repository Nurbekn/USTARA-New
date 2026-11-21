# USTARA v65 — 185 qaror va 42 migratsiya auditi

- `docs/USTARA_185_NAZORAT.csv`: **185 ta foydalanuvchi qarori**.
- SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v64 bilan bir xil.
- Qarorlar statusi (tarixiy inventar): 130 tekshiruv talab qiladi; 47 qisman; 7 keyinga qoldirilgan/bekor; 1 ochiq (#175). Bu 185 ta funksiyaning tayyor bo‘lganini anglatmaydi.
- 42 ta forward SQL migratsiya va 2 rollback yordamchi SQL saqlangan; yangisi qo‘shilmadi.
- `node backend/scripts/audit-phase1.js`: **PASS**; `node backend/scripts/v45-decision-integrity.js`: **PASS**.
- v65 CSS va Chrome tekshiruvlari kelishuvlarning asl matni va biznes qoidalarini o‘zgartirmadi.
- Real PG, GitHub CI, Telegram va production Chrome E2E: **NOT_RUN/BLOCKED**. Production-ready **EMAS**.
