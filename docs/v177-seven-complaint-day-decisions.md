# USTARA v177 — #151–#157: shikoyat qaydlari va yakuniy qarorlar auditi

**Asos:** `USTARA-v176-185-Professional-Booking-Inbox-Seven-Decisions.zip`; 185 qaror reyestri SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`. Asl qarorlar o‘zgartirilmagan. Jami **158/185** qaror manba asosida tekshirildi, **27 tasi** navbatda. Bu ishlab chiqarishga tayyorlik foizi emas.

## Yangi imkoniyat — #151 Smart Complaint Flow (qisman)

- Ilhom sahifasida **Shikoyatlarim / Мои жалобы / My reports** tugmasi bilan akkaunt egasining so‘nggi **50 ta post shikoyati qabul qilinganligi haqidagi qaydi** ochiladi.
- Server `GET /api/social/my-reports` endpointida JWT orqali aniqlangan `req.user.accountId` bo‘yicha parametrli SQL ishlatadi. **Boshqa foydalanuvchi ID raqamini yuborish natijani o‘zgartirmaydi**; mehmon va Admin akkauntlariga ruxsat berilmaydi.
- API faqat `id`, `postId`, sabab va sana qaytaradi, shikoyat tafsilotlari, telefon raqamlari, shaxsiy hujjatlar va boshqa foydalanuvchi ma’lumotlarini qaytarmaydi. Javob `Cache-Control: no-store` bilan yuboriladi.
- Akkaunt almashganda ro‘yxat yopiladi, so‘rov bekor qilinadi. Xatolik bo‘lsa, ro‘yxatni bo‘sh deb talqin qilmaydi.
- Muhim moslik xatosi tuzatildi: **frontend shikoyat matni 500 belgi** (backend `text.length <= 500`); sabablar `spam`, `inappropriate`, `misleading`, `other`. Interfeysdagi qabul qilinmaydigan `copyright` kodi almashtirildi. Mualliflik huquqi shikoyati vaqtincha `other` orqali yuborilishi mumkin.
- **Cheklov:** bu qaydlar **moderatsiya natijasi EMAS**. Post o‘chirilganda `social_reports` jadvalidagi unga tegishli qaydlar `ON DELETE CASCADE` bo‘yicha yo‘qolishi mumkin. To‘liq Admin qaror jarayoni, apellyatsiya, saqlanadigan alohida shikoyat auditi hali qo‘shilmagan. Ko‘rsatma foydalanuvchiga aniq yozilgan.

## Asl #151–#157 qarorlar holati

| # | Qaror | Tekshirilgan holat |
|---|---|---|
| 151 | Smart Complaint Flow | **Qisman qo‘shildi:** shikoyat sabablari/matni serverga moslandi, faqat o‘z shikoyatlari ro‘yxati yaratildi. Moderatsiya qarori va appeal ochiq. |
| 152 | Safe No-Show tasdiqlash | **Qisman:** navbatda tasdiqlash va state/epoch himoyasi mavjud. Haqiqiy DB raqobat sinovi qolgan. |
| 153 | Safe Day Closing | **Qisman:** kun yakunining server preview, to‘suvchi vazifalar va qayta ochish oqimi bor. Haqiqiy PG parallel tekshiruvlar qolgan. |
| 154 | Narx darhol kuchga kiradi, kelajak scheduler YO‘Q | **Qisman kod bilan tasdiqlandi:** amaldagi xizmat narxi o‘zgartiriladi, bron narx snapshoti mavjud. Kelajak narx schedulerini **yaratmadik**. |
| 155 | Egasi va ruxsatli menejer profilni tahrirlaydi | **Hali ishlab chiqilmagan:** haqiqiy jamoa a’zoligi, menejer ruxsati va scope mavjud emas. Bitta sartaroshning shop profili menejer huquqi degani emas. |
| 156 | Ko‘chish uchun maxsus workflow BEKOR | **Foydalanuvchi bekor qilgan**; amalga oshirishga urinilmadi. Buni yetishmayotgan feature deb sanamaymiz. |
| 157 | Xizmat tugadi uchun oddiy Ha Yo‘q tasdig‘i | **Qisman:** sartarosh navbatida Ha/Yo‘q tasdiq bor. Maxsus Undo tizimi ataylab qo‘shilmadi. Brauzer E2E qolgan. |

## Tekshiruvlar

- **Frontend unit:** `1691/1691 PASS`.
- **Backend unit:** `1664/1693`; 29 ta o‘tmagan test v176 da ham bo‘lgan dependency muammolari (`express`, `pg`, `bcrypt`, `jsonwebtoken`). **To‘liq backend suite PASS emas.**
- **v177 yangi maqsadli unit-testlari:** `12/12 PASS` (backend 8, frontend 4).
- **Frontend import grafigi:** PASS (Vite build emas).
- **Yangi JSX sintaksisi:** TypeScript `createSourceFile` parser bilan PASS, haqiqiy browser render test emas.
- **PostgreSQL, production build, Telegram integratsiya, browser E2E:** NOT_RUN.
- Yangi SQL migratsiya **qo‘shilmadi**; tarixiy SQL/schema va reyestr baytma-bayt bir xil.

## Fayl va qaror auditining yaxlitligi

- v176 dagi **1374 ta faylning barchasi saqlangan**, birortasi o‘chirilmagan.
- Bunda 6 ta mavjud fayl kod/CI/test uchun tahrirlandi; 7 ta yangi source/test fayli va ushbu audit hisobotlari qo‘shildi.
- Eski `61` ta himoyalangan SQL/schema/reyestr/hujjat fayli o‘zgarmagan.
- ZIP yig‘ilgach CRC va ichidagi fayllar qayta solishtiriladi.

**Keyingi bosqich:** v178 — #158–#164. Hali productionga chiqarilmasin.
