# USTARA v185 — telefon orqali bron taklifi (xavfsiz birinchi bosqich)

## Kodda bajarildi
- #160/#176: sartarosh Bronlar sahifasidan 14 kun ichidagi xizmat va Toshkent vaqti bo‘yicha **30 daqiqalik havola** yaratadi.
- Token tasodifiy 256-bit qiymat; DBda faqat SHA-256 xeshi saqlanadi. Hech qanday mijoz telefoni yoki ismi yangi jadvalga yozilmaydi.
- Faqat tasdiqlangan faol sartarosh o‘z xizmatiga havola yarata oladi, bir soatda ko‘pi bilan 10 ta. Boshqalarning havolalarini bekor qila olmaydi.
- Havola mehmonlar uchun faqat xizmat/vaqtni tekshirib ko‘rsatadi. Ochilgan xizmat va vaqt mavjud bron interfeysida tanlanadi.
- Mijoz **o‘z akkaunti orqali** mavjud bron tasdiqlash jarayonini tugatishi kerak. Havola hech qachon slotni band qilmaydi, OTP yoki ruxsat tekshiruvlarini chetlab o‘tmaydi.
- Muddat tugagan/bekor qilingan havola yangi tanlovni avtomatik qo‘llamaydi.
- SQL: `20261229_barber_phone_booking_invites.sql`, 58-forward migratsiya, 2 tarixiy rollback. Oldingi 57 migratsiya o‘zgarmagan. Hech qanday real bazaga ulanilmadi.

## API
- `POST /api/bookings/phone-invites` — faqat barber, `{serviceId,bookingTime}`; +05:00, 5 daqiqalik qadam. 201 `{id,token,expiresAt,note}`.
- `GET /api/bookings/phone-invites/mine` — faqat o‘z havolalarini ko‘rish (token qaytarilmaydi).
- `DELETE /api/bookings/phone-invites/:id` — faqat o‘z faol havolasini bekor qilish.
- `GET /api/bookings/phone-invites/:token` — maxfiy akkaunt ma’lumotlarisiz read-only public tekshiruv, `Cache-Control: no-store`.

## Sinov natijalari (ushbu muhit)
- Frontend unit: **1718/1718 PASS**.
- Backend unit: **1716/1745 PASS**, 29 ta dependency sababi (`express`, `pg`, `jsonwebtoken`, `bcrypt`) bilan oldingi v184 dagi muvaffaqiyatsizliklarga teng.
- Yangi testlar: backend **7/7 PASS**, frontend **3/3 PASS**.
- `v153-source-graph.mjs` PASS. Besh tegishli manbaning TypeScript JSX parser sintaksis tekshiruvi PASS.
- Migratsiya auditi: **58 forward + 2 rollback PASS**, runtime: NOT_RUN.
- PostgreSQL, SMS/Telegram xabar yuborish, Vite production build va browser E2E: **NOT_RUN**.

## Ochiq ishlar
- Bu **operatorning mijoz uchun bronni bevosita yaratishi emas**: xavfsiz taklif va mijozning o‘zi tasdiqlashi uchun asos. #160/#176 hali qisman.
- Havolani sartarosh mijozga tashqi SMS/Telegram yoki boshqa kanal orqali **qo‘lda yuboradi**. USTARA bu versiyada SMS yubormaydi yoki telefon raqamini qidirmaydi.
- Havolani oldin ochgan mijozning odatdagi bron interfeysida mustaqil bron qilish imkoniyati bekor qilinmaydi; link revoke faqat yangi havola tekshiruvini to‘xtatadi.
- Haqiqiy PostgreSQLda tranzaksiya, migratsiya, concurrent invite/revoke va mijoz bron tasdiqlash E2E sinovlari bajarilishi kerak.
- Productionga chiqarishdan oldin `npm ci` yordamida kerakli dependency paketlarini o‘rnatib to‘liq testlarni tekshirish lozim.

## Xavfsizlik
Migratsiyani faqat operator ko‘rib chiqib, backup olingan lokal staging bazada sinasin. Ilova hech qanday DB migratsiyasini avtomatik ishga tushirmaydi. Tokenli linkni ommaviy kanallarga joylashtirmaslik tavsiya etiladi.

185 qarorning manba auditi allaqachon 185/185; bu ishlab chiqish yoki production tayyorligi foizi emas. **LOYIHA TUGADI** holatiga hali o‘tilmadi.
