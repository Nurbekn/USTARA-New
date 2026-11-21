# USTARA v87 — bajarilgan 5 ish

1. Mijoz/barber tomonidan bronni bekor qilish va takroriy cancellation COMMIT noaniqligida connection pool xavfsizligini mustahkamlash.
2. Bron va profil ID'larini Postgres int4 chegarasida tekshirish.
3. Bron vaqtini/xizmatlarni o‘zgartirish javobini server scope/status/time/duration/price/service bilan tasdiqlash; soxta success bermaslik.
4. Akkaunt/token almashgan paytda eski cancellation/reschedule javobi yangi sessiyada muvaffaqiyat deb ko‘rinmasligi.
5. 27 ta yangi frontend (25 ta yangi fayldagi + 2 ta eski test faylida), 16 ta yangi backend test, regressiya va 185 qaror / 42 migratsiya auditi.

**457/457 frontend PASS.** Tanlangan backend **22/22 PASS**. Keng backend **726 PASS / 26 npm-dependency FAIL**. Real PostgreSQL/Chrome/Telegram NOT_RUN. Production-ready EMAS.
