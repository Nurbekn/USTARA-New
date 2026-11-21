# USTARA v99 — 185 qaror va SQL migratsiyalar auditi

- Manba: `docs/USTARA_185_NAZORAT.csv`, **185 qaror**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (v98 bilan bir xil).
- Tarixiy statuslar: **130 needs_verification**, **47 partial**, **7 deferred_or_cancelled**, **1 open** (#175).
- #23/#128: yozish paytidagi sana o‘zgarishi va qisman reorder UPDATE yopildi; **real PostgreSQL/E2E bo‘lmagani uchun QISMAN**.
- **44 forward + 2 rollback** migratsiya saqlandi, yangi SQL yo‘q. Offline audit PASS, runtime NOT_RUN.
- Frontend **696 PASS**, backend **1012 PASS / 26 dependency FAIL**, yangi v99 **9 PASS**, tanlangan v99 **60 PASS**, DB **2 SKIP**.
- Production-ready emas. Qarorlar ro‘yxati 185 ta funksiyaning to‘liq yakunlanganini anglatmaydi.
