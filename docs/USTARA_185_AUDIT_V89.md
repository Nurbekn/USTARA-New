# USTARA v89 — 185 qaror auditi

185 ta qaror, asl CSV SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`. Holatlari: 130 needs verification, 47 partial, 7 deferred/cancelled, 1 open (tarixiy).

#173 v89 dalillari: public multi-service endpoint band slotlarni oshkor qilmaydi, frontend legacy busy maydonlarini tashlaydi, public queue aggregate noto‘g‘ri ma’lumotni nol deb ko‘rsatmaydi. 42 yangi unit/frontend test PASS. Real PG/HTTP/Chrome E2E yo‘q, shuning uchun #173 **QISMAN**.

42 forward + 2 rollback migratsiya OFFLINE PASS; real PG NOT_RUN. Production-ready EMAS.
