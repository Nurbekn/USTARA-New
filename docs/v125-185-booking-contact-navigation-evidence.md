# USTARA — checkpoint v125 (2026-11-20)

**Asos:** `USTARA-v124-185-Map-to-Booking-Access.zip`, SHA-256 `e8bc1756cf53a62c2705b7e11a6bba80073aa020d63ad9d9529a406a4184500c`. Ishchi manba v113→v114 rekonstruksiyasi asosida rivojlantirilgan; tarixiy original v114 nusxasi deb da'vo qilinmaydi.

## 185 qaror bo‘yicha keyingi 7 texnik ish

1. **#174 — bronlar ro‘yxati:** faqat JWT orqali aniqlangan customer profiliga tegishli bronlarni qaytaruvchi customer GET list SQL endi sartarosh `salon_name`, `address`, `latitude`, `longitude` va `users` jadvalidagi sartarosh telefonini oladi; `customer_phone` tanlanmaydi.
2. **#174 — bron tafsiloti:** owner-scoped `GET /api/bookings/:id` ham shu barber aloqa va manzil ma'lumotlarini oladi; WHERE `bookings.id=$1 AND bookings.customer_id=$2` saqlangan; boshqa rollar uchun SQL o‘zgartirilmagan.
3. **#159 — shaxsiylik:** frontend faqat mos barber telefon formatini `tel:` uchun qabul qiladi, server tasodifan yuborgan `customer_phone` maydonini customer view modeldan olib tashlaydi.
4. **#174 — manzil:** server koordinatalari faqat haqiqiy son va geografik chegarada bo‘lsa `salon.location` ga o‘tadi; manzil va salon nomi bo‘lmasa to‘qib chiqarilmaydi.
5. **#141 — xaritaga havolalar:** haqiqiy koordinatalardan Google Maps, Yandex Maps, 2GIS va OpenStreetMap havolalari qurildi. Koordinatasi bo‘lmagan bronlarga hech qanday soxta link chiqmaydi; bu *xaritada ko‘rish*, yo‘l vaqti va mavjud biznesni tasdiqlamaydi.
6. **#58 / #174 — mobil ko‘rinish:** telefon, xarita va profil tugmalari mobil ekranda sig‘adigan, kamida 44 px balandlikdagi interaktiv elementlarga ajratildi; ma'lumot bo‘lmasa tegishli CTA yashiriladi.
7. **Xavfsizlik va regressiya:** backendga izolyatsiyalangan SQL access/role testlari va frontendga koordinata/telefon/link hamda real JWT-bound model testlari qo‘shildi. 185 qaror CSV va 47 ta SQL migratsiya o‘zgarishsiz saqlanadi.

## Haqiqiy testlar va cheklovlar

- Frontend: **1043 PASS / 0 FAIL / 0 SKIP** (`node --test test/*.test.js`). v125 da qo‘shilgan **9 frontend test** (7 alohida + 2 model), barchasi o‘tgan.
- Backend unit: yakunda **1333 PASS / 26 FAIL / 0 SKIP** (`node --test test/*.unit.test.js`). Qolgan 26 ta test nomi v124 bilan aynan bir xil va asosan mavjud bo‘lmagan npm paketlariga tegishli. Dastlab checkpoint sarlavhasi tufayli chiqqan qo‘shimcha 1 FAIL tuzatilgan.
- Yangi backend izolyatsiyalangan test: **4 PASS** (customer list/detail owner scope, barber view himoyasi, xato ID), haqiqiy PostgreSQL ishlatilmagan.
- npm paketlari va Vite mavjud emas, haqiqiy PostgreSQL, Vite build va mobil Chrome / Telegram E2E **NOT_RUN**. Sayt **production-ready emas**.
- Qaror reyestrining bu paytdagi holatlari: **130 “Tekshiruv kerak”, 47 “Qisman”, 7 bekor/keyinga qoldirilgan, 1 boshqa izoh**. Bu 185 qarorni hammasi bajarilganini anglatmaydi.

**Keyingi v126:** ajratilgan muhitda `npm ci`, haqiqiy PostgreSQL’da bron egasi asosida kontaktlar SELECT va haqiqiy mobil brauzerda navigatsiya havolalari; keyin 185 reyestrdagi keyingi talablarni tanlab 7 tadan davom etish.

## Arxiv yaxlitligi

- v124: **1053 fayl**, v125: **1057 fayl**; yangi **4**, yangilangan **7**, o‘chirilgan **0**.
- Asl 185 reyestr SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` saqlangan.
- SQL migratsiya **47/47** va `backend/database/bootstrap.sql` baytma-bayt saqlangan.
- Frontend Bookings.jsx JSX transpilation sintaksisi: **0 diagnostic** (Vite build emas).
