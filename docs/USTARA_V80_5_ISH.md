# USTARA v80 — Booking COMMIT safety (2026-11-19)

Manba: `USTARA-4-Bosqich-Service-Transaction-Consistency-v79.zip` (840 fayl). 4-bosqich, production-ready **EMAS**.

## 5 ta asosiy o‘zgarish
1. `createMultiBooking`: yangi bron yoki idempotent replay `COMMIT` javobi noaniq bo‘lsa, PG connection `release(true)` bilan chiqariladi, hatto `ROLLBACK` muvaffaqiyatli tugagan bo‘lsa ham.
2. `modifyCustomerBooking`: yangi vaqtni saqlash va takroriy reschedule qaytishi uchun COMMIT-fence; ID va customer-profile qiymatlarini PostgreSQL `int4` chegarasiga mos tekshirish.
3. `multiSlots` va `modificationSlots`: read-only `COMMIT` paytida uzilgan connection poolga qaytmaydi. Bu read-only query'ni bron tasdiqi deb ko‘rsatmaydi.
4. `createBooking` legacy bir xizmatli yo‘l: COMMIT noaniqligida connection pooldan chiqariladi, foydalanuvchiga yolg‘on muvaffaqiyat javobi yoki ichki DB detail berilmaydi.
5. **22 ta yangi backend unit test** ikkita faylda: COMMIT failed + ROLLBACK succeeded/failed, idempotent replay, success recovery, slot read va ID chegaralari.

## Lokal tekshiruvlar
- Frontend **278/278 PASS**.
- Targeted v80 backend `npm run test:v80:unit` **60/60 PASS** (22 tasi yangi).
- Barcha backend unitlar **695 PASS / 26 FAIL**. 26 eski `MODULE_NOT_FOUND` (bcrypt, jsonwebtoken, pg, express va boshqalar) sababli.
- 185 qaror CSV checksum **PASS**, 42 forward SQL migratsiya offline yaxlitligi **PASS**.
- Haqiqiy PostgreSQL test, Vite production build, Chrome, Telegram, GitHub Actions: **NOT_RUN** (ishonchli PASS dalili yo‘q).

## Muhim cheklov
Agar COMMIT acknowledgement yo‘qolsa, server natijani aniq bilmaydi. Discarding a connection **not** proof of rollback. User must refresh booking state before retry; request_id should be reused when applicable. Real PostgreSQL concurrency test shart.
