# USTARA v90 — 185 qaror audit

185 qaror mavjud; asl CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (o‘zgarmagan).

Tarixiy 130 tekshiruv kerak, 47 qisman, 7 deferred/cancelled, 1 open — bu 185 ta funksiya tugaganini anglatmaydi.

#35 v90: noaniq long ETA, stale/offline timestamp, multiple request race, wrong barber ID, backend SQL date snapshot va public response whitelist yaxshilandi. 67 ta yangi test PASS. Real PostgreSQL/Chrome/Telegram integration NOT_RUN; **#35 QISMAN**.

42 forward + 2 rollback migratsiya OFFLINE PASS. Production-ready EMAS.
