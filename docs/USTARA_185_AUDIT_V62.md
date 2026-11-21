# USTARA 185 qaror — v62 audit

- Asl manba: `docs/USTARA_185_NAZORAT.csv`, jami **185 qaror**.
- SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v61 bilan **bir xil**.
- Status taqsimoti (oldingi checkpointdan): **130 tekshirish kerak, 47 qisman, 7 bekor/keyinga, 1 ochiq (#175)**.
- **42 forward SQL migratsiya**, migratsiyaga oid oldingi 2 ta yordamchi rollback fayli alohida. v62 da forward SQL fayllari yoki qaror CSV o‘zgartirilmagan.
- `node backend/scripts/audit-phase1.js`: **PASS**. `node backend/scripts/v45-decision-integrity.js`: **PASS**.
- Offline audit **185 ta funksiya production’da tayyor** degani emas. Real integratsiya va foydalanuvchi testlari tasdiqlanmagan.
