# USTARA v191 — mijoz bron Telegram bildirishnomalari

## Asosiy o‘zgarish

v190 dagi *alohida va tasdiqlangan Telegram roziligi* v191 dagi bron hodisalari navbatiga bog‘landi. `20270103_customer_booking_telegram_outbox.sql` yangi 63-forward migratsiya bo‘lib, avvalgi 62 migratsiya o‘zgartirilmagan. Migratsiya faqat yangi navbat jadvali va triggerlarni yaratadi, **Telegramga xabar yubormaydi** va eski bronlarni navbatga qayta kiritmaydi.

- Bron yaratilishi, tasdiqlanishi, rad etilishi, bekor qilinishi yoki vaqt/xizmat o‘zgarishi — faqat mijoz avvalroq Telegram’ini bog‘lagan va xabarlarga *alohida rozilik* bergan bo‘lsa navbatga yoziladi.
- Navbatda shaxsiy telefon, Telegram chat ID, matn va token saqlanmaydi. Yuborish oldidan haqiqiy bron holati, egasi, xizmat, davomiylik, sartarosh, akkaunt faolligi va o‘sha paytdagi Telegram roziligi qayta tekshiriladi.
- Rozilik bekor qilinsa yoki Telegram uzilsa, **hali yuborilmagan** `queued` xabarlar bekor qilinadi. Yuborish vaqtida user/link/bron share-lock bilan tekshiriladi. Ushbu lock qisqa tashqi Telegram chaqiruvi davomida ushlab turiladi (8 s timeout); bu operator tomonidan staging’da yuk ostida alohida tekshirilishi zarur.
- Worker xabarni bir marta yuborishga urinadi, `accepted` faqat **Telegram API muvaffaqiyatli qabul qilganini**, `uncertain` esa yuborish natijasini aniq bilmasligimizni anglatadi. O‘qildi yoki qurilmaga yetkazildi deb qayd etilmaydi. Noma’lum natijada avtomatik qayta yuborish **YO‘Q**.
- Mijoz profilidagi Telegram bo‘limida faqat o‘z hisobining so‘nggi 20 ta yozuvini, shaxsiy Telegram chat identifikatorisiz ko‘rishi mumkin.
- Mijozning eski OTP Telegram kontaktidan hech qanday rozilik ko‘chirib olinmaydi. SMS qo‘shilmagan.

## Tekshiruv natijalari (2026-11-21)

- Yangi va bog‘liq v191 maqsadli testlar: **17/17 PASS** (14 backend, 3 frontend).
- Barcha frontend Node unit-testlari: **1739/1739 PASS**.
- Barcha backend Node unit-testlari: **1779/1808 PASS**. **29** ta o‘tmagan test v190 dagi 29 ta muammo bilan bir xil, ular `express`, `pg`, `bcrypt`, `jsonwebtoken` singari o‘rnatilmagan npm paketlariga bog‘liq. Yangi regressiya aniqlanmadi.
- SQL offline strukturasi: **63 forward + 2 rollback PASS**; original 185 qaror reyestri saqlangan. Frontend import grafigi va o‘zgargan JSX sintaksisi tekshirildi.
- **NOT RUN:** haqiqiy PostgreSQL migratsiyasi va triggerlari, haqiqiy Telegram API yuborishi, brauzer E2E va Vite production build. Kod production-ready deb tasdiqlanmagan.

## Ishga tushirish chegarasi

1. Faqat tasdiqlangan **izolyatsiyalangan staging PostgreSQL** uchun 62 avvalgi migratsiya va to‘liq backup mavjudligini tekshiring; keyin `backend/database/migrations/20270103_customer_booking_telegram_outbox.sql` ni operator nazoratida qo‘llang. Fresh install ro‘yxatida ham bor. **Bu arxiv haqiqiy bazaga ulanmagan va migratsiya bajarmagan.**
2. Migratsiyadan keyin test mijozida Telegram’ni v190 orqali ulang va alohida bildirishnoma roziligini yoqing.
3. Worker odatiy server yoki bot bilan birga **o‘zi ishlamaydi**. Staging tasdiqlangandan keyingina alohida terminal/protsessda `ENABLE_CUSTOMER_BOOKING_NOTICE_WORKER=yes node -r dotenv/config backend/telegram/customerBookingNotificationWorkerV191.js` ishlatiladi (backend ishchi katalogidan `node -r dotenv/config telegram/customerBookingNotificationWorkerV191.js` ham mumkin).
4. Staging’da roziliksiz bron, tasdiqlangan bron, bekor qilish, muddat o‘zgarishi, suspend, unlink, sekin Telegram javobi, qayta ishga tushish va parallel worker tekshiruvlarini **haqiqiy PostgreSQL** bilan sinang. Rolloutda Telegram bot haqiqiy ishonchli token bilan faqat staging chatiga yuborsin.
5. Xato va `uncertain` holatlarini qo‘lda tekshiring; tasodifan ikki marta yuborish xavfi sababli avtomatik retry yoqmang.

## Keyingi vazifalar

Hali ochiq: real DB/Telegram integratsiyasi, npm dependencies o‘rnatilganda yashil backend suite, production build, E2E, monitoring, qolgan 185 qaror ichidagi qisman funksiyalar. **LOYIHA TUGADI deb yozilmaydi.**
