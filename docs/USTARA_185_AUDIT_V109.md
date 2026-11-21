# USTARA #153 v109 qaror nazorati

- Manba: to‘liq `v108` ZIP, undagi 1004 faylni saqlash shart.
- #153 Safe Day Closing: `QISMAN`. Kunni xavfsiz yopish qayta ochish, QR, bron va navbatni nazorat qiladi, ammo haqiqiy PostgreSQL/E2E sinovlari bajarilmagan.
- Yangi SQL migratsiya **yo‘q**: 45 forward va 2 rollback avvalgi holatda. Yopilish holati PostgreSQL orqali tekshiriladi.
- QR yaratilishi: jadval oldindan va yakuniy `INSERT` paytida yana tekshiriladi. Yopiq kunda ishlamaydigan QR yaratilmaydi.
- QR hisoblagichlari: noto‘g‘ri/mavjud bo‘lmagan server natijalarida himoya chetlab o‘tilmaydi.
- Kun yopish/qayta ochish tasdig‘i: har ikkisi PostgreSQL soatiga nisbatan 30 soniya, revision, ses­siya va sana shartlari bilan cheklanadi.
- Preview: yozmaydigan o‘qish amali; `FOR SHARE OF b,u` va barber advisory lock saqlanadi. PostgreSQL `READ ONLY` tranzaksiyada `FOR SHARE` mumkin emasligi sabab `BEGIN` ishlatiladi; COMMIT xatosi yozish natijasi noaniq deb belgilab yuborilmaydi.
- Foydalanuvchi panelida yopilgan kunning qo‘lda navbatga qo‘shish/QR yaratish tugmalari o‘chadi; server himoyasi asosiy nazorat bo‘lib qoladi.
- 185 qaror CSV asl SHA-256 qiymati o‘zgarmasligi kerak: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- **Production-ready: YO‘Q**, bu statusni faqat real DB va browser E2E dalillari bilan o‘zgartirish mumkin.
