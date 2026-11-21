# USTARA v159 — Smart Booking Admin pauzasi va 185 qarorning keyingi manba auditi

**Kirish ZIP:** `USTARA-v158-185-Smart-Booking-Today-Offers-Seven-Decisions.zip` (20.11.2026). Bu **source/test audit**, production sertifikati emas. Asl `docs/USTARA_185_NAZORAT.csv` o'zgartirilmagan; tarixiy 46 SQL migratsiya o'zgartirilmagan, **yangi 47-migratsiya** alohida qo'shildi. Migratsiya real DBda avtomatik ishga tushirilmagan.

## Haqiqatan yozilgan yangi funksionallik (#24)

1. `backend/database/migrations/20261218_smart_booking_admin_rules.sql`: singleton `smart_booking_admin_settings` (boshlang'ich `enabled=true`, `revision=1`) va `smart_booking_admin_settings_events` jadvali. Admin identifikatori, eski/yangi boolean qiymat va revision ketma-ketligi audit qilinadi. SQL oldingi `bookings`, `smart_booking_offers`, Telegram outbox satrlarini o'zgartirmaydi.
2. Admin-only `GET /api/admin/smart-booking/rules` va `PUT /api/admin/smart-booking/rules` (`enabled` qat'iy boolean; `expected_revision` musbat xavfsiz butun son). Valid JWT + aktiv admin mavjudligi tekshiriladi. GET no-cache. PUT transaction + `FOR UPDATE` + revision compare-and-swap; eski revision — HTTP 409, haqiqiy o'zgarmagan holat audit event yaratmaydi. COMMIT javobi yo'qolganida qayta yuborish avtomatik takrorlanmaydi.
3. Taklif worker'i `smart_booking_admin_settings` row'ini `FOR SHARE` bilan tekshiradi, bu qulf **yangi offer INSERT yozilguncha ushlab turiladi**. Bu «Admin pause commit bo'lgandan keyin eski worker yana offer yaratdi» race'ni cheklaydi. Pauza payti **yangi taklif yaratilmaydi**; mavjud pending/accepted takliflar, haqiqiy bronlar va Telegram outbox asossiz bekor qilinmaydi. Eskirgan pending taklifning tabiiy muddati tugashi saqlanadi; worker keyingi tekshiruvni 30 soniyaga suradi. Sozlama yo'q bo'lsa worker **fail-closed**.
4. Admin panelida **Smart Booking** alohida bo'limi: joriy holat, versiya, pauza/yoqish tugmasi va tasdiqlash dialogi; o'zbekcha/ruscha/inglizcha matnlar. So'rov muddati noaniq tugaganda avval GET bilan holat yangilanadi; PUT avtomatik qayta yuborilmaydi.

**Cheklov:** Bu birinchi markaziy Admin qoidasi — global yangi takliflarni pauzalash. 5 daqiqalik offer TTL yoki qo'shimcha murakkab siyosatlarni Admin panelidan o'zgartirish bu bosqichda qilinmagan; mavjud 5 daqiqa saqlangan. Shu sabab **#24 end-to-end completed deb e'lon qilinmaydi**.

## Manba auditi: yetti yangi noyob qaror

| # | Qaror | Xulosa |
|---|---|---|
| 24 | Smart Booking markaziy Admin qoidalari | **Yangi funksionallik**: global pause/resume, DB audit, worker transaction lock, Admin UI; real DB va browser E2E qolgan. |
| 25 | Telegram va saytda taklifning bitta natijasi | Telegram va sayt bitta `applyDecision` servisida. Parallel real Telegram/DB E2E yo'q. |
| 26 | Walk-in navbatga tez qo'shish | Mavjud manual join backend va barber sahifa; DB/mobile E2E yo'q. |
| 28 | QR mehmon so'rovi va sartarosh tasdig'i | Mavjud QR request/approve; DB race E2E yo'q. |
| 29 | Walk-in tasdiq kutayotganlar ro'yxati | Mavjud pendingList va barber Queue UI; DB/mobile E2E yo'q. |
| 30 | Walk-in navbati bo'shagan vaqt uchun ustuvor | FIFO + QR/manual claim consent manba izlari; haqiqiy DB race E2E yo'q. |
| 31 | FIFO navbat, qo'lda yakuniy qaror | Mavjud FIFO, manual reorder; DB parallel E2E yo'q. |

**#27 «Mijoz jonli navbati va joyidagi QR»** oldingi v155 7 critical auditida allaqachon sanalgan. v159 da u yana tekshirildi, ammo **takroran 1 ta deb sanalmadi**. Shu sabab **28 + 7 = 35 / 185** noyob manba izlari, **150 tasi hali indekslanmagan**. Manba izining mavjudligi production-funksionallik to'liq ishlashini anglatmaydi. #18 avtomatik eslatma/kechikish va #22 xizmat erta yakunida qayta taqsimlash kamchiliklari ochiq qolgan.

`docs/v159-seven-queue-source-evidence.json` va `backend/scripts/v159-seven-queue-decisions.mjs` aynan nimaga dalil borligini va nimasi yo'qligini ko'rsatadi.

## Tekshiruvlar (2026-11-21, paketlar cheklangan lokal muhit)

- **Frontend to'liq unit suite:** **1620/1620 PASS**; 0 fail/skip.
- **Backend v159 va bog'liq Smart Booking/Telegram/source audit tanlangan suite:** **97/97 PASS**; 0 fail/skip.
- **Backend to'liq unit suite:** **1534/1563 PASS, 29 FAIL**. Bu muhitda `express`, `pg`, `jsonwebtoken` va boshqa npm paketlari o'rnatilmagan, ko'plab mavjud testlar shu sabablarga ko'ra ishga tushmadi; qolgan 29 failure production kod xatosi emas deb qat'iy tasdiqlab bo'lmaydi. To'liq backend gate **PASS EMAS**.
- v159 manba auditi, 185 qaror immutable SHA-256 va 47 forward SQL migration offline structur audit: **PASS**.
- Haqiqiy PostgreSQL migration/race, real Telegram delivery, Chrome E2E, Vite production build: **BAJARILMADI**. Shunday ekan release-ready **YO'Q**.

## Deployga oid ehtiyot choralari

1. Avval **izolyatsiyalangan test DB**da 47-migratsiya bilan fresh bootstrap va eskidan yangi migratsiyaga upgrade tekshirilsin. SQL bu ZIP bilan real DBga ishga tushirilmagan.
2. PostgreSQLda ikki worker va bir Admin pause/resume'ni bir vaqtda ishlatadigan integratsion race testi bajarilsin; eski yuborilgan takliflar va tasdiqlangan bronlar o'zgarmasligi tasdiqlansin.
3. Paketlarni lockfile orqali o'rnating (`npm ci`), to'liq backend/frontend unit, Vite build, browser va Telegram E2E'ni qayta sinang. CI 47 migratsiyali schema va v159 manba auditini ko'radi.
4. Faylni internetga deploy qilishdan oldin JWT, API, Telegram konfiguratsiyasi va admin ruxsatlari alohida muhitda ko'rib chiqilsin. ZIPda `.env` va maxfiy kalitlar yo'q.

**Xulosa:** v159 bosqichi tayyor, **USTARA loyihasi (185 qarorning hammasi) hali tugamagan**. Keyingi navbat indekslanmagan qarorlar va #18/#22 functional gaplarni real testlar bilan yopish.
