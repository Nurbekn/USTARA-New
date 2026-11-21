# USTARA v176 — #144–#150: Professional Booking Inbox va xavfsizlik auditi

**Asos:** `USTARA-v175-185-Public-Map-Navigation-Seven-Identity-Decisions.zip`; asl `docs/USTARA_185_NAZORAT.csv` SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`. Reyestr saqlangan. **151/185** qaror manba darajasida ko‘rib chiqildi, **34 tasi** hali keyingi audit navbatida. Indekslash **production tayyorligi emas**.

## Yangi imkoniyat: #145 Professional Booking Inbox (qisman)

- Sartaroshning mavjud **Bronlar** oynasida, allaqachon yuklangan bronlar orasida mijoz yoki xizmat nomi va `#ID` bo‘yicha qidiruv, bitta sanaga filter, filtrni tozalash, serverdan qayta yangilash qo‘shildi.
- Mavjud **Kutilmoqda / Tasdiqlangan / Tarix** tablari, vaqt saralash va bron kartasi amallari o‘z holicha qoldi. Qidiruv faqat hozirgi tab va **frontendga yuklangan** bronlar ustida ishlaydi; butun tarix bo‘ylab server qidiruvi deb talqin qilinmasin.
- Mijoz telefon raqami yoki shaxsiy qaydlar qidiruv indeksiga kirmaydi. Filtrning o‘zi bron yaratmaydi, tasdiqlamaydi yoki bekor qilmaydi. Qayta yangilash existing read-store so‘rovini ishlatadi.
- Qidiruv 80 belgi bilan cheklangan. Filtr sanasi qat’iy YYYY-MM-DD; telefon/OTP yoki boshqa shaxsiy identifikator URLga yozilmaydi. Uch tildagi (uz/ru/en) matnlar qo‘shilgan.
- Frontend qidiruvi biznes qoidasi bo‘yicha access control o‘rniga o‘tmaydi: backend ruxsatlari va real brauzer / PostgreSQL E2E alohida tekshirilishi kerak.

## Manba auditi — #144–#150

| # | Qaror | Manba holati / qolgan ish |
|---|---|---|
| 144 | Internet uzilganda Booking Recovery | `bookingRecovery`, idempotency testlari bor. Real bir vaqtdagi PostgreSQL va tarmoq uzilishi E2E kerak. |
| 145 | Professional Booking Inbox | **Yangi filtrlar qo‘shildi (qisman)**. Butun server tarixida qidiruv, full inbox pagination va brauzer E2E qolgan. |
| 146 | Adaptive Booking Timeline | v160 rangli kunlik timeline bor, ammo real E2E va parallel holatlar tasdiqlanmagan. |
| 147 | Compact Client History | **Ishlab chiqilmagan**. Avval serverda har bir mijoz uchun minimal ruxsat/ma’lumot doirasi kerak. |
| 148 | Verified Sartaroshxona | **Ishlab chiqilmagan**. Alohida shop tekshiruvi va Admin tasdig‘i kerak; sartarosh badge bilan bir xil emas. |
| 149 | Safe Ownership Transfer | **Ishlab chiqilmagan**. Egani almashtirishda ikki tomon roziligi, Admin tekshiruv va tranzaksiya kerak. |
| 150 | Safe Block foydalanuvchilar orasida | **Ishlab chiqilmagan**. Chat/social/booking chegaralari va auth tekshiruvi bo‘lgan siyosat kerak. |

## Tekshiruv natijalari

- **Frontend unit:** `1687/1687` PASS.
- **Backend unit:** `1656/1685` PASS, `29` ta o‘tmagan test. 29 ta nomi va tartibi v175 bilan aynan bir xil; test muhitida `express`, `jsonwebtoken`, `bcrypt`, `pg` modullari mavjud emas. Bu **to‘liq backend PASS** emas.
- **v176 maqsadli testlar:** `9/9` PASS (6 frontend + 3 backend).
- Frontend **source graph PASS**; 4 ta yangi/yangi tahrirlangan JS/JSX fayli TypeScript parser bilan sintaksis tekshiruvdan o‘tdi.
- **PostgreSQL, production build, haqiqiy Telegram, browser E2E: NOT_RUN**. Release/production-ready deb belgilanmagan.
- **SQL:** hech qanday yangi migratsiya kiritilmadi, avvalgilari o‘zgartirilmadi.

## Fayl yaxlitligi

- v175 dagi barcha **1364 ta fayl** saqlandi, yo‘qotilgan fayl yo‘q.
- `Bookings.jsx` va CI workflow yangilandi. Yangi qidiruv helperi, komponenti, stil, tarjima, audit va testlar qo‘shildi.
- Eski `schema.sql`, barcha tarixiy SQL migratsiya fayllari va 185 qaror reyestri **baytma-bayt bir xil**.
- CRC arxiv yaratilgandan keyin alohida tekshiriladi.

**Keyingi bosqich:** v177 — #151–#157 (asl reyestrdagi yakuniy/to‘xtatilgan qarorlar holatini saqlagan holda). V176 hali productionga chiqarilmaydi.
