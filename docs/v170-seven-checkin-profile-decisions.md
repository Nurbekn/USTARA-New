# USTARA v170 — #102–#108 qarorlar va ikki bosqichli bron check-in

## Qayta ishlatilgan manba

- Kirish: `USTARA-v169-185-Late-Arrival-Notice-Seven-Customer-Decisions.zip` (1307 fayl).
- Asl 185 qaror reyestri: `docs/USTARA_185_NAZORAT.csv` (SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`); **o'zgartirilmagan**.
- #102–#108: **7 qaror ko'rib chiqildi**, lekin #107 v155 auditida allaqachon hisoblangan. **6 ta yangi manba izi**; jami **109/185**; **76 ta** hali indekslanmagan. Bu production tayyorlik emas.

## #102 uchun haqiqiy yangi kod

1. `20261224_booking_customer_checkins.sql`: `booking_checkins` — bitta bron uchun bitta kelganlik so'rovi, mijoz so'rov vaqti, sartarosh tasdiqlash vaqti va tasdiqlovchi sartarosh ID. Yangi **53-forward migratsiya** mavjud bootstrapga qo'shildi; `bootstrap/verify.sql` ning jadval va migratsiya inventorysiga ham kiritildi. **Haqiqiy PostgreSQL bazasiga qo'llanmagan.** Migratsiyadagi trigger bronning `booking_time` maydoni boshqa vaqtga ko'chirilsa eski check-in ni bekor qiladi; eski tashrif qayta tasdiq bo'lib qolmaydi.
2. `POST /api/bookings/:id/check-in` — faqat token egasi bo'lgan mijoz uchun. `bookings` qatori `FOR UPDATE` bilan qulflanadi va `status='confirmed'` tekshiriladi. PostgreSQL soati bo'yicha bron boshlanishidan 90 daqiqa oldin va boshlanganidan keyin 30 daqiqagacha yuborish mumkin. Takroriy yuborish idempotent, ikkinchi yozuv ochilmaydi.
3. `POST /api/bookings/:id/check-in/confirm` — faqat **shu bron sartaroshi** uchun, faqat mijozning oldingi so'rovi bo'lsa va bron `confirmed` bo'lsa. Sartaroshning tasdig'i ham idempotent, auditga tasdiqlovchi ID yoziladi. Boshqa akkaunt tasdiqlay olmaydi.
4. Mijoz `Bronlarim` detalida "Yetib keldim"ni bosishi mumkin; so'rov tasdiqlanishi alohida status. Sartarosh `Bronlar` kartasida so'rovni ko'radi va alohida "Kelganini tasdiqlash" tugmasiga ega. UZ/RU/EN tarjimalari mavjud. Qayta yuklash serverning haqiqiy natijasini ko'rsatadi.
5. `GET /api/bookings` va `GET /api/bookings/:id` rolga mos mavjud ruxsatlar doirasida `check_in` ma'lumotini qaytaradi. **Sartarosh tasdiqlaganligi so'rovdan kelib chiqmaydi.** Check-in `bookings.status`, bron vaqti, xizmatni boshlash/tugatish yoki to'lovni o'zgartirmaydi.
6. DB `COMMIT` natijasi noma'lum bo'lsa API **503** qaytaradi; interfeys avtomatik takrorlamaydi, avval bronni yangilash talab qilinadi. Server ruxsatlaridan tashqari mijozga boshqa bron yoki sartaroshning telefonlari oshkor qilinmaydi.

## #103–#108 manba auditi

| # | Qaror | Holat |
|---|---|---|
| 103 | Ixcham Smart Service Card | Inline xizmat tanlash/quote bor; alohida ixcham karta va mobil E2E hali qisman. |
| 104 | Professional Finish Flow | Sartaroshdagi xizmat tugash tasdig'i va status API mavjud; haqiqiy browser/DB tranzaksion E2E yo'q. |
| 105 | Bekor qilishdan keyin muqobil vaqtlar | Read-only tavsiyalar mavjud; vaqt band qilinmaydi, real API/PG brauzer E2E yo'q. |
| 106 | Xavfsiz bronni ko'chirish | Quote/slot/revision check mavjud; haqiqiy parallel PostgreSQL testlari qolgan. |
| 107 | Ommaviy profil havolasi | `barbers/:id` havolalari bor; v155 da indekslangan, ikki marta sanalmadi. |
| 108 | Shaxsiy `ustara.uz/@username` | **HALI IMPLEMENTATSIYA QILINMAGAN.** Hozirda faqat ID havolasi bor. Slug unikalligi, reserved-slug siyosati, public marshrut va migratsiya qilinmagan. |

## Qanday sinovlar bajarildi

- Yangi `#102` API, mijoz/usta UI contract va audit: **13/13 PASS**.
- To'liq frontend Node unit: **1660/1660 PASS**.
- To'liq backend Node unit: **1620/1649 PASS**. **29 FAIL** — v169 dagi nomma-nom o'sha testlar, bu konteynerdagi `express`, `pg`, `jsonwebtoken`, `bcrypt` singari o'rnatilmagan npm paketlari sabab. To'liq backend test suite yashil emas.
- Migratsiya/offline bootstrap: **53 forward + 2 rollback**, faqat **statik PASS**. Tarixiy SQL migratsiyalar o'zgarmadi.
- Frontend import/source graph: **201 JS, 36 CSS, 642 import, 2 asset PASS**, ammo bu bundle emas. O'zgargan JSX/JS parser tekshiruvi PASS.
- Haqiqiy PostgreSQL migratsiyasi, permission/integration/race, Vite production build, real Chrome/mobile E2E, Telegram xabarlari va real CI: **NOT RUN**.

## Ochiq masalalar

- **#102** real PostgreSQL’da parallel so'rovlar, bron cancel/complete/reschedule va check-in bir vaqtda sodir bo'lishi, `90/30` daqiqalik chegara va ikki rolga oid mobil brauzer E2E sinovlari zarur.
- Yangi migratsiyani **foydalanuvchining haqiqiy DBsida ruxsatsiz ishga tushirmang**. Deployda schema va kod birga chiqarilishi shart: yangi `check_in` SELECT eski DBda ishlamaydi.
- **#108** alohida loyiha bosqichida username rezerv siyosati va domen marshruti bilan ishlab chiqiladi; mavjud `@telegram` matnini public slug deb qabul qilmang.
- Barcha indekslanmagan 76 qaror, oldingi qisman qarorlar, xavfsizlik, onlayn booking integratsiyasi va real production sinovlari hali qolgan. **LOYIHA TUGADI emas.**
