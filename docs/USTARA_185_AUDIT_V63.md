# USTARA v63 — 185 qaror yaxlitligi auditi

- `docs/USTARA_185_NAZORAT.csv`: **185 ta qaror**, asl SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v62 bilan bir xil.
- Avvalgi statuslar: **130 tekshirish talab etiladi, 47 qisman, 7 bekor/keyinga qoldirilgan, 1 ochiq (#175)**. Bu tasnif implementatsiya bajarilgani degani emas.
- **42 ta forward SQL migratsiya**, 2 ta yordamchi rollback SQL mavjud; SQL mazmuni v62 bilan bir xil.
- `node backend/scripts/audit-phase1.js`: PASS; `node backend/scripts/v45-decision-integrity.js`: PASS.
- Yangi v63 Chrome production bundle smoke xavfsizlik/sahifa ko‘rinishini qo‘shimcha tekshiradi, 185 qaror CSV mazmuni va biznes qoidalarini o‘zgartirmaydi.
- Real GitHub/PG/Telegram/mobil E2E hali bajarilmagan. **Production-ready emas.**
