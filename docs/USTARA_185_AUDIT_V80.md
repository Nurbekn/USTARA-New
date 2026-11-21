# USTARA v80 — 185 qaror nazorati

- Asl `USTARA_185_NAZORAT.csv`: **185 qaror**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (o‘zgarmagan).
- Tarixiy holatlar: **130 tekshiruv kerak**, **47 qisman**, **7 bekor/kechiktirilgan**, **1 ochiq (#175)**. **0 ta to‘liq tasdiqlangan**; avtomatik unit testlar decision completion degani emas.
- 42 forward va 2 rollback SQL: byte-for-byte v79 bilan bir xil. Yangi migration **YO‘Q**.
- v80 #144 (idempotent booking) va bron tranzaksiyalari xavfsizligiga tegishli; integratsiya tasdig‘i bo‘lmagani uchun hech bir qaror holati o‘zgartirilmadi.
- Haqiqiy PostgreSQL/Chrome/Telegram: NOT_RUN. Production-ready EMAS.
