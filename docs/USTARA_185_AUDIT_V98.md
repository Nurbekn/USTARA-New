# USTARA v98 — 185 qaror auditi

- `USTARA_185_NAZORAT.csv`: **185 ta qaror**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, v97 bilan **bir xil**.
- Statuslar: 130 ta `needs_verification`, 47 `partial`, 7 `deferred_or_cancelled`, 1 `open` (#175).
- #23/#128: kechagi navbatning faol ro‘yxatda ko‘rinishi, eski `request_id` replay va keyingi kuni finish qilishdagi chekkalar tuzatildi. **Real PostgreSQL testlari o'tmaguncha QISMAN**.
- 44 forward SQL + 2 rollback saqlandi, offline PASS; real migratsiya bajarilmadi.
- Testlar: frontend **696 PASS**, backend **1003 PASS / 26 dependency FAIL**, tanlangan **43 PASS**, PostgreSQL **1 SKIP**.
- Production-ready **EMAS**.
