# USTARA v104 — 185 qaror / 44 migratsiya auditi

- Qaror jadvali: `docs/USTARA_185_NAZORAT.csv` (185 yozuv), SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v103 bilan bir xil.
- #106 bronni ko‘chirish: qo‘shimcha backend GET quote xavfsizligi va regression testlari. Hali QISMAN: real test PostgreSQL va Chrome sinovlari bajarilmagan.
- 44 forward SQL migratsiya o‘zgarmadi; yana 2 rollback SQL saqlangan.
- Backend `audit:phase1`: PASS; `v45:decisions`: PASS.
- Real PostgreSQL/CI/Chrome/Telegram: NOT_RUN. **185 ta talablardan 185 tasi bajarilgan degani EMAS.**
