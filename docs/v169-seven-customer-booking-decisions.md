# USTARA v169 — #95–#101 qarorlar va kechikish xabari

## Manba va o'zgarish chegarasi

- Kirish arxivi: `USTARA-v168-185-Featured-Portfolio-Six-Works-Seven-Decisions.zip`.
- Asl reyestr (`docs/USTARA_185_NAZORAT.csv`) SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`; u **o'zgarmagan**.
- #95–#101: 7 qaror audit qilindi, 7 ta **yangi manba izi** qo'shildi. Jami **103/185**, yana **82 ta** indekslanmagan.
- Bu son kod/test yo'llari ko'rib chiqilganini bildiradi. **Ishlab chiqarishga tayyorlik/foydalanuvchi amali kafolati emas.**

## #101 — real yangi implementatsiya

1. Yangi `20261223_booking_late_notices.sql` (`52-forward` migratsiya) `booking_late_notices` jadvalini yaratadi. PK/FK bookingga bog'liq; oldingi yozuv qayta yaratilmaydi. Migratsiya **faqat ZIPga qo'shildi, hech qanday real DBga bajarilmadi**.
2. `POST /api/bookings/:id/late-notice` faqat autentifikatsiyalangan **shu bron egasi bo'lgan mijoz** uchun. `{ "minutes": 5|10|15|20|30 }` qabul qiladi. So'rovda bron egasi va `pending/confirmed` holati tranzaksiya ichida tekshiriladi; booking row `FOR UPDATE` bilan qulflanadi. PostgreSQL vaqti bo'yicha bron boshlanishidan **2 soat oldin** va boshlangandan **10 daqiqagacha** yuborish mumkin. Bitta bron uchun bir xabar; aynan bir xil qayta so'rov idempotent, boshqacha takroriy so'rov 409. `COMMIT` javobi noaniq bo'lsa server muvaffaqiyat qaytarmaydi.
3. `GET /api/bookings` va `GET /api/bookings/:id` javobidagi `late_notice` faqat avvalgi ruxsatli scope ichida ko'rinadi. Sartaroshning bron kartasi **+N min** ogohlantirishini ko'rsatadi; mijoz esa o'z bronida shuni ko'radi. O'zbek/rus/ingliz tili mavjud.
4. Xabar **jadvalni ko'chirmaydi**, navbatni ham o'zgartirmaydi; sartarosh rozilik bildirgani degani emas. Sartarosh bronlar sahifasini yangilaganda xabarni oladi, **Telegram push yetkazish, acceptance flow va real-time yangilanish bu bosqichda yo'q**.
5. Mijoz uchun noto'g'ri yoki uzilgan javob avtomatik qayta yuborilmaydi: bronni avval qayta yuklash kerak. Talablar va muddat real PostgreSQL bilan sinovdan o'tmagan.

## #95–#100 audit natijasi

| # | Manba holati | Ochiq qism |
|---|---|---|
| 95 | Mavjud 2–3 sartarosh solishtirish (`compareModel`, `ComparisonPanel`) | Real API ma'lumotlarining yangiligi, mobil E2E |
| 96 | Umumiy bronni to'xtatish va sana istisnolari mavjud | Alohida xizmat pauzasi, parallel bron DB testi |
| 97 | Kuzatish (`social_follows`), saqlash va kuzatilganlar Home’da bor | Xizmat favoritlarini alohida boshqarish, E2E |
| 98 | 5 daqiqalik sessiyadagi bron drafti mavjud | Haqiqiy login/OTP ↔ draft tiklash E2E |
| 99 | Inline progressiv bron sahifasi mavjud | Mobil accessibility, yakuniy E2E |
| 100 | Server javobi va booking receipt tekshiruvi mavjud | Real PostgreSQL commit race va browser E2E |

## Testlar va cheklovlar

- `node --test frontend/test/*.test.js`: **1656/1656 PASS**.
- `node --test backend/test/*.unit.test.js`: **1611/1640 PASS**, **29 ta test FAIL** (`express`, `pg`, `jsonwebtoken`, `bcrypt` paketlari bu muhitda o'rnatilmagan); **umumiy backend suite yashil emas**.
- Yangi funksiyalar, SQL bootstrap, audit va oldingi migratsiya mosligi bo'yicha tanlangan testlar: **34/34 PASS**.
- 5 ta o'zgargan JSX/JS frontend fayllarning sintaksisi TS parser yordamida tekshirildi.
- SQL offline bootstrap/migratsiya auditi: **52 forward + 2 rollback**, faqat statik PASS.
- PostgreSQL, Telegram, brauzer E2E, production bundle va real worker: **NOT RUN**.

## Keyingi release oldidan

- Mahalliy PostgreSQL staging bazada migratsiyani qo'llashga *alohida ruxsat oling*, bir vaqtda ikki POST idempotency va bron cancel race sinovlarini bajaring.
- Brauzerda turli akkauntlarda role isolation, 2 soat / 10 daqiqa chegaralari va bo'sh backend holati E2E.
- #101 uchun Telegram xabari/real-time qachon zarurligini foydalanuvchi roziligiga ko'ra alohida ishlab chiqish.
- Qolgan qisman va hali indekslanmagan qarorlarni ham yakunlash kerak.

**Holat:** v169 maqsadli kod/test manbalari mavjud; **production-ready emas**.
