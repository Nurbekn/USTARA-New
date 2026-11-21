# USTARA #153 — v110 qaror va xavfsizlik auditi

- 185 asl qaror CSV SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (baytma-bayt saqlandi).
- #153 Safe Day Closing — **QISMAN**; asosiy server close/reopen va shared schedule oldingi v107–v109 versiyalarda yaratilgan.
- v110: QR token va QR request vaqtlarida Tashkent mahalliy sanasi final transactional writes bilan qayta tekshiriladi; xatolikda audit/queue insert rollback qilinadi.
- Barber manual join final `INSERT` endi kun va jadvalni bitta DB soat namunasida tekshiradi.
- Pending list/status, kun yakuni blocker va QR pending counter kechagi QR so‘rovlarini bugungi sifatida ko‘rsatmaydi.
- Orqaga moslik: QR token/replay yoki navbatning tarixiy ma’lumotlari o‘chirilmadi; yangi SQL migratsiya yo‘q.
- Frontend 902 PASS; backend 1198 PASS / 26 eski npm dependency FAIL; 19 ta yangi unit PASS.
- 45 forward + 2 rollback SQL bit-identical. PostgreSQL live, Vite build, mobile E2E: **NOT_RUN**.
- **Production-ready: YO‘Q.**
