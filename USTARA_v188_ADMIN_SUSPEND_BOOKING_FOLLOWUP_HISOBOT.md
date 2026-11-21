# USTARA v188 — suspend bronlari: operator nazorati

## Bajarildi

- v187 Admin suspend/restore qoidalari, sessiyalarni bekor qilish va **mavjud bronlarni o‘zgartirmaslik** saqlandi.
- Admin suspend tranzaksiyasiga faol (`pending`/`confirmed`) bronlar bo‘yicha operator kuzatuv ishlarini yaratish qo‘shildi. Audit ham, ish yozuvlari ham bir tranzaksiyada saqlanadi; tranzaksiya xatosi suspendni ham to‘xtatadi.
- 60-forward SQL migratsiya va migratsiya vaqtida avval suspend qilingan akkauntlarning ochiq bronlarini operator navbatiga qo‘shish.
- Admin panelida **Suspend bronlar** bo‘limi: ochiq / ko‘rilgan / bog‘lanishga urinish / yopilgan ishlar, sahifalash, vaqt, bron holati va bog‘lanadigan tomon turi.
- Faqat Admin uchun API, 3 til (UZ/RU/EN), 50 ta yozuvli sahifa, `Cache-Control: no-store`, eskirgan revision uchun `409`, audit log.
- `Bog‘lanishga urinish` SMS/Telegram yetkazildi degani emas. Hech qanday xabar avtomatik yuborilmaydi, bronlar avtomatik bekor qilinmaydi.

## Cheklovlar va ochiq ishlar

1. Real SMS/Telegram yuborish va yetkazilganligini kuzatish ishlab chiqilmagan. Operator aloqa jarayonini tizimdan tashqarida, ruxsat etilgan usulda bajaradi.
2. Suspenddan keyin boshqa kod yo‘li orqali yangi bron paydo bo‘lsa, yangi case avtomatik yaratilmasligi mumkin; production oldidan booking commit fence/reconciliation kerak.
3. Real PostgreSQL concurrency va integratsiya sinovlari, npm dependencies bilan to‘liq backend, brauzer E2E hamda build hali qolgan.
4. Jamoa boshqaruvi, to‘liq Privacy Center, review/moderation kabi boshqa qisman talablarga hali ish bor.

## Audit

- Original 185 qarorning matni o‘zgarmagan; 185/185 — faqat dastlabki manba audit qamrovi, production tayyorligi emas.
- SQL migration `20261231_admin_suspension_booking_cases.sql` faqat arxivda mavjud, **hech bir real bazaga ishlatilmadi**.
- Amaliy ko‘rsatma: `backend/ADMIN_SUSPENSION_BOOKING_CASES_V188.md`.
