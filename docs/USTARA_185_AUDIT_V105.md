# USTARA v105 — 185 qaror / 44 forward migratsiya

- 185 ta qaror asl CSV xeshi `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — o‘zgarmagan.
- Tarixiy statuslar: 130 ta tekshiruv kerak, 47 ta qisman, 7 ta bekor/kechiktirilgan, 1 ta ochiq; bu funksiyalar tugallangan degani **emas**.
- #152 (`Safe No-Show tasdiqlash`) uchun UI + unit test qo‘shildi; real integration E2E yo‘qligi uchun **QISMAN**.
- 44 forward va 2 rollback SQL o‘zgarmadi. `v67-migration-audit.cjs` offline PASS, real DB NOT_RUN.
- 26 backend testlar missing npm dependency sababli ishlamadi; production-ready **EMAS**.
