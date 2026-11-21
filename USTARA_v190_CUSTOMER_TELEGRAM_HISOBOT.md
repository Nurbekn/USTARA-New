# USTARA v190 — Mijoz uchun Telegram bog‘lash

## Yangi funksiya

- Mijoz o‘z profilidan Telegram aloqasini 5 daqiqalik bir martalik havola bilan bog‘lay oladi.
- Bog‘lash tokeni 192 bitli, bazada faqat SHA-256 xeshi saqlanadi.
- Telegram faqat shaxsiy chatdan, aynan o‘sha Telegram foydalanuvchisining xabaridan tasdiqlanadi.
- Bildirishnomalar roziligi **alohida** yoqiladi yoki bekor qilinadi. Odatiy holatda o‘chiq.
- Ulanishni uzish pending token va rozilikni ham olib tashlaydi.
- Mijozlar uchun Telegram bildirishnomalari hali avtomatik yuborilmaydi; OTP kontakti rozilikka teng emas.
- Tarixiy 61 SQL migratsiya saqlanib, yangi 62-migratsiya qo‘shildi. Haqiqiy bazaga qo‘llanmadi.

## Cheklovlar

Loyiha hali production-ready emas. Real PostgreSQL, Telegram, brauzer E2E va production build sinovlari bajarilmagan. Kodga qo‘shilgan testlar bu tekshiruvlarning o‘rnini bosmaydi. `LOYIHA TUGADI` yozilmaydi.

Texnik yo‘riqnoma: `backend/CUSTOMER_TELEGRAM_OPT_IN_V190.md`.
