# USTARA v189 — Admin Telegram bildirishnomasi

## Yangi ishlar

- v188 «Suspend bronlar» operator navbatiga Admin tasdig'i bilan **bir martalik Telegram xabar so'rovi** qo'shildi.
- Faqat suspend qilingan **mijozning broniga tegishli, Telegramni avval ulagan faol sartarosh** xabar olishi mumkin. Mijozda doimiy tasdiqlangan Telegram chati mavjud emas; mijozga xabar jo'natish ishlab chiqilmagan.
- Yangi statuslar: `queued` (navbatda), `sending` (yuborish jarayonida), `accepted` (Telegram API qabul qildi), `uncertain` (natija noma'lum), `cancelled` (bekor qilindi). `accepted` yetkazilgan/o'qilgan degani emas.
- Xabar matni qisqa, shaxsiy ma'lumotlar va suspend sababini o'z ichiga olmaydi. Foydalanuvchining bron vaqti, narxi yoki statusi xabar yuborish bilan o'zgarmaydi.
- Bitta case uchun faqat bitta xabar so'rovi mumkin. Noma'lum natija avtomatik qayta yuborilmaydi.
- Alohida, operator yoqadigan worker va yangi 61-forward SQL migratsiya qo'shildi. Worker avtomatik ishga tushmaydi.
- Admin paneliga 3 tilli status va tugma qo'shildi.

## Muhim chegaralar

- Real Telegram yuborish, PostgreSQL concurrency, brauzer E2E va production build sinovlari bajarilmaguncha ushbu kod production-ready deb hisoblanmaydi.
- Telegram hisobini ulash kerak; SMS va mijoz Telegram bildirishnomalari hali mavjud emas.
- Yangi migratsiya haqiqiy ma'lumotlar bazasiga qo'llanmagan.
- 185/185 qarorlar manba auditi saqlangan, lekin bu funksional to'liqlik ko'rsatkichi emas.

Texnik tafsilotlar: `backend/ADMIN_SUSPENSION_TELEGRAM_NOTICES_V189.md`.
