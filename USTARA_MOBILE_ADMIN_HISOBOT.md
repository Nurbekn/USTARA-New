# USTARA — Mobil Social, Signup va Admin yangilanishi

Asos: foydalanuvchi yuborgan `USTARA-Admin-Telegram-Tuzatilgan1.zip`. Ushbu versiyadagi login, Telegram va backend tuzatishlari asos sifatida saqlandi.

## Interfeys
- Signup: keraksiz uch bosqichli indikator olib tashlandi; mavjud CAPTCHA, OTP va telefon/parol tekshiruvlari xavfsizlik uchun saqlandi. Maydon va sarlavha oralig'i qisqartirildi.
- Social: mobil lentadagi zichlik, rasm ko'rinishi, surish navigatsiyasi, ikonka bosish maydonlari va kategoriyalar yaxshilandi. Like/follow/comment/save/share ning oldingi API mantiqlari o'zgartirilmadi.
- Admin: «Foydalanuvchilar» bo'limi qo'shildi, so'nggi 200 mijoz va usta telefoni, roli va sanasini ko'rsatadi. Profilga bog'langan akkauntni aniq telefonini qayta kiritib o'chirish imkoniyati mavjud. O'chirish mavjud `accountDeletionService` tranzaksion xizmatidan foydalanadi va bog'liq ma'lumotlarni ham o'chirishi mumkin. Backendda admin tokeni talab etiladi.
- Parollar: hech qachon ko'rsatilmaydi — bazada hash saqlanadi. Parolni tiklash mavjud oqimi orqali amalga oshiriladi.
- Admin mobil UI: navigatsiya, statistika, jadvallar, tugmalar va fokus holatlari yaxshilandi.

## Tekshiruvlar
- Frontend ESLint: o'tdi
- Frontend Vite production build: o'tdi
- Frontend login / registration / socialModel unit: 25 o'tdi
- Backend socialRoutes / loginProtection unit: 15 o'tdi
- Backend admin-account-deletion PostgreSQL integration: SKIP — bu muhitda ruxsat etilgan test PostgreSQL sozlamalari yo'q.
- Jonli bot, haqiqiy login, browser E2E va production bazada admin delete: tekshirilmagan.

## Ishga tushirish
Frontend papkasida: `npm install && npm run dev`; backend papkasida `.env` sozlangach `npm install && npm run dev`.
Admin: `/admin`. Account deletion doimiy; avval bazani zaxiralang.

## Chegaralar
Admin hozir 200 ta eng so'nggi accountni ko'rsatadi, pagination / jadvallarni to'liq eksport qilish hali yo'q. Jonli ma'lumot bilan foydalanishdan oldin stagingda sinov zarur. Frontend ko'rinishi brauzer screenshotli regressiya testlaridan o'tmagan.
