# USTARA v59 — 185 qaror auditi

- Asl `docs/USTARA_185_NAZORAT.csv` SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — **o‘zgarmagan**.
- **185 qaror** inventari; bu 185 ta funksiyaning hammasi tayyorligi degani **EMAS**. Oldingi auditda 130 ta keyingi tekshiruv, 47 ta qisman, 7 ta deferred/cancelled, 1 ta ochiq #175 qayd etilgan; v59 ularni funksional tayyor deb belgilamadi.
- **42 forward PostgreSQL migratsiya**, qo‘shimcha 2 rollback helper SQL; v59 hech qanday migratsiya qo‘shmagan yoki tarixiy SQLni o‘zgartirmagan.
- `node backend/scripts/audit-phase1.js` va `node backend/scripts/v45-decision-integrity.js`: **offline PASS**. Real PostgreSQL integratsiya bunga kirmaydi.
