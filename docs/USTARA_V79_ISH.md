# USTARA — so‘nggi checkpoint v79 (2026-11-19)

**Manba:** `USTARA-4-Bosqich-Booking-Transaction-Retry-v78.zip` (836 fayl). **Bosqich:** 4. Production-ready: **YO‘Q**.
185 qaror reyestri va 42 forward SQL migratsiya byte-for-byte o‘zgarmadi.

## Koddagi haqiqiy tuzatishlar
1. Xizmat **qo‘shish** POST yo‘lida PostgreSQL vaqtinchalik kodlari `40P01`, `40001`, `55P03`, `57014` uchun umumiy 409 `booking_busy` javobi — maxfiy DB diagnostikasisiz.
2. Xizmat **o‘chirish** DELETE yo‘li ham bir xil xatolik xaritalashini ishlatadi; mavjud `23503` foreign key holatida eski bronni saqlab, `service_has_bookings` va arxivlash maslahatini qaytaradi.
3. Ikkala yo‘lda rollback xatoga uchrasa PostgreSQL ulanishi pool'dan chiqariladi (`release(true)`).
4. To‘rtta service write yo‘lida (POST, PUT, DELETE, PATCH status) COMMIT muvaffaqiyatsiz yoki natijasi noaniq bo‘lsa, ulanish qayta ishlatilmaydi.
5. Real PostgreSQL uchun **ikki yangi opt-in integratsiya ssenariy** yozildi: ikki mijoz bir slotga API orqali parallel bron yuborishi; uncommitted narx/davomiylik yangilanishi service lock'ni kutib turgan eski quote bilan bronni rad qilishi. Ular ushbu muhitda ishlatilmadi.
6. `backend/test/v79ServiceTransactions.unit.test.js`: **20 ta yangi unit test** (ruxsat, tranzaksiya commit/rollback, DB error kodi, mavjud bron, maxfiy xatolar, noaniq COMMIT).
7. `npm run test:v79:unit` / `npm run test:v79:db` buyruqlari va alohida runbook qo‘shildi.

## Haqiqiy lokal sinovlar
- Frontend: **278 PASS, 0 FAIL** (v78 kodiga tegilmagan).
- Tegishli backend unitlar: **138 PASS, 0 FAIL** (20 tasi yangi).
- Barcha backend `.unit.test.js`: **673 PASS, 26 FAIL**; 26 tasi `MODULE_NOT_FOUND` npm dependency o‘rnatilmagani sababli, v78'dagi shu guruh.
- Offline audit: **185 qaror PASS, 42 forward migratsiya PASS** (fayl yaxlitligi).
- Haqiqiy PostgreSQL, ikkita connection integratsiya sinovlari, production Vite build, Chrome, Telegram va GitHub Actions: **NOT_RUN**.
- Bu 185 ta qarorning barchasi tugallanganini isbotlamaydi. Dastlabki audit holati: 130 tekshiruv talab qiladi, 47 qisman, 7 kechiktirilgan/bekor, 1 ochiq (#175).

## Navbatdagi v80
1. Izolatsiyalangan `ustara_test_db` ga 42 migratsiyani qo‘llash, DB readiness va concurrency integratsiya sinovlarini haqiqatan ishga tushirish (faqat test muhiti).
2. `npm ci` dan keyin to‘liq backend + frontend build/Chrome testlarini tekshirish.
3. 185 talabning keyingi asosiy funksional bo‘shlig‘iga qaytish.
