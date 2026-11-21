# USTARA 185 qaror — v61 audit

- Source: `docs/USTARA_185_NAZORAT.csv`, **185 ta qaror**.
- SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v60 bilan **bir xil**.
- Status taqsimoti: **130 tekshirish kerak**, **47 qisman**, **7 bekor/keyinga**, **1 nomuvofiq/aniq emas (#175)**.
- **42 forward SQL migratsiya**, bundan tashqari `migrations` papkasida rollback yordamchi fayllari ham mavjud. Hech bir forward SQL migratsiya v61 da o‘zgartirilmadi.
- Offline `audit-phase1.js`: PASS; `v45-decision-integrity.js`: PASS.
- Bu audit production’da 185 funksiyaning bajarilganini **tasdiqlamaydi**.
