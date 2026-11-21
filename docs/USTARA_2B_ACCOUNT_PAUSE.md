# Akkauntni vaqtincha faolsizlantirish (#135, B)

**Xususiyat:** faqat Customer yoki Barber, aktiv sessiyadan parol bilan tasdiqlash. Faol yoki kelajakdagi bron mavjud bo‘lsa `409 active_bookings`; mavjud bronlarni avtomatik bekor qilish YOK. Faol bo‘lmagan akkaunt yangi bron yarata olmaydi. Parol bilan keyingi kirishda `423 account_deactivated`; "Akkauntni qayta faollashtirish" tugmasini alohida bosgandan keyin `reactivate:true` yuboriladi va muvaffaqiyatda yangi JWT olinadi. Tizim eski JWT tokenlarini sessiya versiyasini oshirib rad etadi.

**API:**

- `POST /api/auth/account/deactivate` — JWT + `{ "password": "..." }`, muvaffaqiyat `200 account_deactivated`. Bajarilgandan so‘ng frontend lokal sessiyani tozalaydi.
- `POST /api/auth/login` — odatiy `{phone,password}` valid parol va inactive statusda `423 account_deactivated` qaytaradi. Ongli tiklash uchun `{phone,password,reactivate:true}`.

**Migration:** `backend/database/migrations/20261126_account_pause.sql` ni faqat tasdiqlangan schema va migratsiyalar holatini tekshirgach, zaxira bilan, izolyatsiyalangan test bazasida qo‘llang. Bu paketda SQL bajarilmagan. Migration qo‘llanmaguncha yangi auth/booking API’larni production’da yoqmang.

**Chegara:** walk-in queue hali mavjud emas; u 4-bosqichda yaratilganda #135 yo‘llari bilan birlashtiriladi. DB race/integratsiya sinovlari hali yo‘q; frontend browser E2E bajarilmagan.
