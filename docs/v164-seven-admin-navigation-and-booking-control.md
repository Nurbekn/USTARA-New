# USTARA v164 — #60–#66 admin navigatsiyasi, bronlarni xavfsiz ko‘rib chiqish

**Asos:** v163 ZIP va undagi original `docs/USTARA_185_NAZORAT.csv` reyestri. Bu bosqich `70/185` qaror uchun **kod/test manbalarining indeksini** anglatadi, production uchun tayyorlikni emas.

## v164 da yangi qo‘shilgan #66 qismi

- `GET /api/admin/bookings/control`: faqat autentifikatsiya qilingan **Admin**; `authMiddleware`, `adminOnly` va handler ichidagi qo‘shimcha rol nazorati.
- **Faqat o‘qish**: bronlarni ko‘rish uchun `SELECT`, hech qanday status mutation yoki avtomatik ko‘chirish/bekor qilish yo‘q.
- **Server-side filtrlar**: holat (`all/pending/confirmed/completed/cancelled/rejected`), bron sanasi (Asia/Tashkent +05:00 kun chegarasi), ixtiyoriy sartarosh ID.
- **Sahifalash**: har sahifada ko‘pi bilan 50 ta, 1–100 sahifa. Har doim aniq jami o‘rniga `hasNext` qaytadi; 51-yozuv faqat keyingi sahifa borligini aniqlashga ishlatiladi.
- **SQL himoyasi**: filtrlar allowlist, qat’iy sana/ID validatsiyasi va parametrli query; parol, JWT, telefon, Telegram ma’lumotlari select qilinmaydi. `Cache-Control: no-store`.
- **Admin UI**: 3 tilda status/sana/sartarosh filtri, yangilash va avvalgi/keyingi sahifa. Filter o‘zgarsa eski natija bekor qilinadi; akkaunt almashsa eski javob ko‘rsatilmaydi.
- Eski `GET /api/admin/bookings` endpointi boshqa eski mijozlar uchun saqlandi. Eski bron yaratish, cancel va Smart Booking logikasi o‘zgarmadi.
- **SQL migratsiya qo‘shilmadi**. Baza, frontend build, brauzer, mobil E2E va PostgreSQL haqiqiy data bilan tekshirilmagani ochiq qoladi.

## Original #60–#66 reyestrdagi holat

| # | Qaror | Manba dalili / cheklov |
|---|---|---|
| 60 | Mijoz beshta navigatsiya bo‘limi | UserLayout 5 tab va havola tartibi bor, mavjud unit-test; mobil E2E yo‘q |
| 61 | Sartarosh beshta navigatsiya bo‘limi | BarberLayout 5 tab va ularning manzili bor; browser E2E yo‘q |
| 62 | Admin desktop sidebar | AdminPanel va CSS sidebar bor; responsive/a11y real qurilma tekshiruvi yo‘q |
| 63 | Admin dashboard ko‘rsatkichlari | Umumiy hisoblash API va frontend hisoblagichlar bor; real DB natijalari tekshirilmagan |
| 64 | Admin akkauntlar va xavfsizlik | Admin login, rol cheklovi, akkauntlar ro‘yxati va o‘chirish oqimi bor; to‘liq security audit yo‘q |
| 65 | Admin sartarosh monitoringi | Sartaroshlar ro‘yxati va verification mavjud; full monitoring/alert/SLA yo‘q |
| 66 | Admin Booking Control Center | **Yangi read-only filtrlangan bron ko‘rinishi**; bronni boshqarish, eskalatsiya va ops audit workflow hali yo‘q |

## Natija va aniq cheklovlar

- Yangi Booking Control API+UI: **9/9 PASS** (6 backend, 3 frontend).
- #60–#66 original reyestrning statik dalil auditi: **2/2 PASS**, hisob **63 → 70 / 185**, qolgan **115**.
- Frontend umumiy testlari **1641/1641 PASS** (o‘zgarishdan keyin qayta tekshiriladi).
- Backend barcha unit-testlar **1574/1603 PASS; 29 FAIL** (o‘rnatilmagan `express`, `pg`, `jsonwebtoken`, `bcrypt` moduliga bog‘liq; suite to‘liq yashil emas).
- SQL migration audit: **49 forward + 2 rollback, OFFLINE_PASS**; real migratsiya **NOT_RUN**.
- JSX syntax parse: AdminPanel va yangi booking control komponentlari **PASS**; full Vite production build **NOT_RUN**.
- PostgreSQL, Telegram, brauzer E2E, real parallel bronlar, xavfsizlik pentesti va accessibility: **NOT_RUN**. Production readiness: **NOT_VERIFIED**.

## Navbatdagi ish

v165 — original #67–#73 qarorlar. Ochiq #49 apellyatsiya, #52 manzil snapshoti, #54 absence-triggered muqobil taklif, #57 sartaroshning o‘z aksiyalari va boshqalarning production integratsiya testlari ham qoladi.
