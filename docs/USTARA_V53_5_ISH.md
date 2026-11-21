# USTARA v53 — QR va taklifning so‘nggi yozuv chegaralari (2026-11-19)

**Asos:** v52 ZIP (717 ta fayl); loyiha qayta qurilmadi. 4-bosqich; **production-ready EMAS**.

## Bajarilgan 5 ta ish

1. **QR tokenni yakuniy iste’mol qilish:** so‘rov `INSERT`idan keyingi `UPDATE walkin_qr_tokens` ham `expires_at>clock_timestamp()` shartini tekshiradi. Chegara vaqtida tugasa butun tranzaksiya `ROLLBACK`, javob `410 qr_expired`; boshqa token nizosi `409 qr_used`.
2. **QR tasdiqlashning oxirgi chegarasi:** sartarosh tasdiqlashi (`approve`) paytida ish vaqti yopilsa, `UPDATE walkin_qr_requests ... RETURNING` yana jadvalni SQL ichida tekshiradi. Oldingi `walkin_queue` yozuvi ham rollback; rad etish (`reject`) ish vaqtiga bog‘lanmaydi.
3. **Smart Booking taklif yaratish:** worker nomzodni qidirayotganda slotning 5 daqiqalik chegarasi tugab qolsa, oxirgi `INSERT ... SELECT` `0 row` bo‘ladi, yangi taklif/Telegram outbox yaratilmaydi va opening yopiladi. SQL bugungi navbatni va `waiting` holatini ham tekshiradi.
4. **2 daqiqalik muddatni rejalashtirish:** taklif qabul qilingan vaqtdagi `smart_booking_offers.decided_at` asosida PostgreSQL `next_check_at=decided_at+interval '2 minutes'` hisoblaydi; oldinroq o‘qilgan JS vaqtiga tayanmaydi. Rad etish/cancel uchun DB `clock_timestamp()` ishlatiladi.
5. **Haqiqiy PG xavfsiz test tayyorgarligi:** `v53QrFinalBoundaries.postgres.integration.test.js` QR tokenning oxirgi yozuvda eskirishi hamda QR tasdiqlash davomida ish vaqti yopilishi va `ROLLBACK` uchun maxsus ephemerаl schema yaratadi; `v53-staging.js` eski 7 qat’iy SQL suite va yangi 8-suite’ni faqat aniq test opt-in bilan yuritadi. **Real PostgreSQL bu muhitda yo‘q: test `SKIP`, PASS emas.**

## Tekshiruv natijasi

- `npm run test:v53:unit`: **77/77 PASS** (v53 yangi 10 ta unit test, oldingi muhim testlar bilan).
- `node --test test/*.unit.test.js`: **421 PASS / 26 FAIL**; yiqilganlari oldingi `express`, `pg`, `bcrypt`, `jsonwebtoken` va ularga bog‘liq npm modullari mavjud emasligi bilan bog‘liq. Full PASS emas.
- `frontend: node --test test/*.test.js`: **178/178 PASS**.
- `node --test test/v53QrFinalBoundaries.postgres.integration.test.js`: **0 PASS / 1 SKIP** (real database mavjud emas).
- `npm run test:v53:staging`: opt-in yo‘qligi sabab to‘g‘ri **BLOCKED**; PostgreSQL, Telegram, mobil E2E **NOT_RUN**; Vite build **FAIL: vite not found**.
- 185 qaror CSV **SHA256 o‘zgarmagan**; 42 forward migratsiya offline audit **PASS**; yangi migratsiya yo‘q.

**Cheklov:** unit-test SQL ifodasi va rollback mock’ini tekshiradi, real PostgreSQL atomarligini isbotlamaydi. 185 qarorning barcha funksiyalari tayyor degani emas.
