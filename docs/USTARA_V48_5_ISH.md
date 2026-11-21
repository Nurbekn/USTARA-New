# USTARA v48 — bajarilgan 5 ta ish

1. **Slot band yoki yaqin:** Smart Booking worker bo‘shagan vaqtni `closed` qilganda shu tranzaksiyada hali yuborilmagan taklif Telegram xabarini `cancelled` qiladi.
2. **5 daqiqalik `pending` taklif eskirishi:** expiry bilan notification cleanup birga bajariladi, so‘ng keyingi mijoz tanlanadi.
3. **2 daqiqalik `accepted` tasdiqlash oynasi tugashi:** muddati o‘tgan va `confirmed_or_closed` tarmoqlarida ham `pending` notice qayta qolib ketmaydi.
4. **Mijozning eskirgan javobi:** 410 `offer_expired`, 409 `slot_taken`, yoki `accepted`ni kech takrorlashda pending notice atomar tozalanadi.
5. **Sartarosh bekor qilishi va replay:** `cancelBarber` oddiy va takroriy bekor qilishda qolgan pending offer/notice yozuvlarini tuzatadi; `accepted/closed` openingga tegmaydi.

Bitta qayta ishlatiladigan SQL yordamchi qo‘shildi; **faqat `status='pending'` outbox**, `sent`, `sending`, `uncertain` xabarlarga tegilmaydi. Qo‘shimcha SQL migratsiya yo‘q. Failure -> transaction ROLLBACK.

**Test:** `npm run test:v48:unit` **47/47 PASS**, yangi **9/9 PASS**; backend full **387 PASS/26 dependency FAIL**; frontend **175/175 PASS**. Real PostgreSQL/Telegram/mobile sinovlari bajarilmadi, Vite build `vite: not found`. **Production-ready emas.**
