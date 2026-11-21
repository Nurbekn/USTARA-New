# USTARA v83 — 185 qaror / migratsiya yaxlitligi

- Kanonik jadval: `docs/USTARA_185_NAZORAT.csv` — **185 ta** qaror.
- SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v82 dan **o‘zgarmagan**.
- **#98:** qoralama uchun saqlash/tozalash/qayta tiklash qoidalari va 22 ta umumiy yangi frontend testi; **QISMAN** (real Chrome/mobil E2E yo‘q).
- **#99:** bir sahifali tanlovda eskirgan sana va xizmatni rad etish, 20 ta limit; **QISMAN** (real UI E2E yo‘q).
- **#144** oldingi v82 holatida **QISMAN** qoladi; real PG race testi o‘tgan deb hisoblanmaydi.
- **42 forward SQL + 2 rollback SQL** byte-for-byte v82 bilan bir xil. Yangi migratsiya qo‘shilmadi.
- Boshqa qarorlar holati CSV’dagi tarixiy status bilan bir xil. Audit funksiyalar yakunlanganini tasdiqlamaydi.
- `audit-phase1.js` va `v45-decision-integrity.js`: **PASS**, haqiqiy PostgreSQL/Chrome/Telegram: **NOT_RUN**.
- **PRODUCTION-READY: YO‘Q**.
