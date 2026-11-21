# USTARA v82 — recovery owner, parallel request va noaniq commit himoyasi

Manba: **v81 ZIP**, 852 ta fayl. Bu kod bazasiga v82 o‘zgarishlari qo‘shildi; GitHub main branchga tegilmadi.

## Bajarilgan 5 yo‘nalish
1. Frontend bir xil pending booking + bir xil account uchun faqat bitta in-flight Promise beradi. Boshqa vaqt/xizmat/sartarosh/sana/akkaunt bilan so‘rov in-flight paytida **409 booking_in_progress** qaytariladi; qo‘shimcha POST yuborilmaydi.
2. Oldin saqlangan request ID egasi noma’lum bo‘lsa yoki caller identity yo‘qolgan bo‘lsa, yangi akkauntga avtomatik biriktirilmaydi (**booking_recovery_owner_unknown**). Mavjud mumkin bo‘lgan bron yo‘qolmasligi uchun eski ID asrab turiladi; foydalanuvchi ongli ravishda tekshirib bekor qilishi mumkin.
3. Recovery UI GET yuborishdan oldin current session accountId bilan pending key egasini solishtiradi. GET ketayotgan paytda akkaunt almashsa, natijani eski sessiya nomidan ko‘rsatmaydi. Noma’lum natijalar haqida ehtiyotkor xabar beradi.
4. Recovery `GET` ning `found:false` javobi majburiy `uncertain:true` bo‘lmasa frontend uni yaroqsiz deb rad etadi. Backend handler no-store headerni muvaffaqiyatli va xatoli javoblardan oldin qo‘yadi.
5. 13 yangi frontend + 6 backend unit regressiya testi; PostgreSQL ning **hali commit qilinmagan** request key holati va commitdan keyingi idempotent replay uchun opt-in integratsiya testi qo‘shildi.

## Tekshiruv natijalari (shu muhit)
- Frontend `node --test test/*.test.js`: **303 PASS, 0 FAIL**.
- Backend `node --test test/*.unit.test.js`: **710 PASS, 26 FAIL** (o‘rnatilmagan `pg`, `express`, `bcrypt`, `jsonwebtoken` va boshqa npm dependencies). v81 bilan taqqoslanuvchi qamrov.
- Barcha `test/*.test.js` (integration fayllarni ham qo‘shgan): **710 PASS / 52 FAIL / 17 SKIP**; paketlar o‘rnatilmagan va opt-in PG sinovlar uchun baza yo‘q. Bu qamrov **v81 taqqoslash bilan bir xil emas**.
- Backend focused `v82 + v81 recovery + idempotency`: **20 PASS**.
- Frontend focused `v82 + v81 + createBooking`: **43 PASS**.
- Offline phase 1: 185 qaror, 42 forward migratsiya PASS.
- Haqiqiy PostgreSQL, Telegram, Chrome E2E, Vite build: NOT_RUN/BLOCKED. Production-ready YO‘Q.
