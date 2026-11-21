# USTARA v89 — qilingan amaliy o‘zgarishlar

- `backend/services/multiBooking.js`: public `multiSlots` faqat mavjud bo‘sh `candidates` va `slots` qaytaradi; busy times yashiriladi, ID formatlari strict.
- `frontend/src/pages/user/barber/availableSlots.js`: frontend legacy occupied candidate/busy payloadni foydalanuvchiga chiqarmaydi; free-candidate consistency checks saqlanadi.
- `backend/controllers/queuePublicController.js`: int4 ID, queue count, currently-called bool qat’iy tekshiriladi; corrupt aggregate xavfsiz 503 qaytaradi.
- `backend/test/multiServiceSocial.postgres.integration.test.js`: public candidate contract bo‘yicha kutilgan natija yangilandi (real DB testi NOT_RUN).
- `backend/test/v89PublicAvailabilityPrivacy.unit.test.js`: 38 yangi test.
- `frontend/test/v89PublicSlotPrivacy.test.js`: 4 yangi test.
- `frontend/test/availableSlots.test.js` va `frontend/test/v84SlotQuoteIntegrity.test.js` eski band-slot ko‘rinishi kutishini privacy qoidalariga moslashtirildi.
- #173 QISMAN: 185 qaror CSV hamda 42 forward migratsiya o‘zgarmadi.
