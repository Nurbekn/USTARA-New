# USTARA v179 — #165–#171: 7 qaror manba auditi va muallif ma'lumoti

**Asos:** v178 ZIP, asl 185 qaror reyestri. Manba auditi: **172/185** (avval 165/185); qolgan **13 ta**. Bu production tayyorligi ko'rsatkichi emas.

## Koddagi yangi o'zgarish — #171

- Ommaviy shop galereyasidagi har bir rasmli post uchun muallifning ismi familiyasi `social_posts.barber_id` bilan bog'langan `barbers` jadvalidan olinadi (`shopGalleryV173.js`, `ITEMS_SQL`). Postning `caption` matni muallif deb qabul qilinmaydi.
- `galleryItems()` cheklangan `authorName` qiymatini qaytaradi; ism bo'sh bo'lsa soxta muallif yaratmaydi. Telefon, JWT, mijoz ma'lumoti yoki boshqa maxfiy maydonlar qo'shilmagan.
- `ShopPublicV172.jsx` rasm tagida uch tilda **Muallif / Автор / Author** yorlig'ini, ism va shu sartaroshning ommaviy profiliga havolani ko'rsatadi. React matnni xavfsiz formatlaydi.
- Yangi migratsiya yo'q: galereya mavjud post egasining jadvaliga bog'landi. Galereya boshqaruvi, ruxsatlar, revision va mavjud bookinglar o'zgarmadi.

## Yetti qarorning holati

| # | Talab | Audit natijasi |
|---|---|---|
| 165 | Smart Link Preview | Qisman: tasdiqlangan faol sartarosh uchun xavfsiz OG/Twitter preview bor; real Telegram/WhatsApp crawler, domen va HTTPS integratsiyasi tekshirilmagan |
| 166 | Takroriy akkaunt va sartaroshxona rad etiladi | Qisman: `users.phone` UNIQUE, sartaroshga bitta shop; turli owner nomidan bitta tashkilotni takror ro'yxatga olishni avtomatik aniqlash hali yo'q |
| 167 | Ish vaqtini uzaytirish maxsus workflow | **Bekor qilingan** — qayta qurilmadi |
| 168 | Faqat o'zi uchun bron qilish | Qisman: mijoz bronlari JWTdagi `profileId`ga bog'langan; real PostgreSQL/browser testi qolgan |
| 169 | Mijozning vaqt to'qnashuvchi bronlari taqiqlanadi | Qisman: app tekshiruv + exclusion SQL mavjud, jonli DB race testi o'tkazilmadi |
| 170 | Barber matching qayta muhokamasi | **Bekor qilingan** — yangi matching mexanizmi yaratilmadi |
| 171 | Portfolio muallifi ko'rsatiladi | Yangilandi: Ilhom postlaridagi mavjud nomga qo'shimcha, shop galereyasi ham kanonik muallifni ko'rsatadi; live DB/browser testi qolgan |

## Bajarilgan testlar

- Frontend `node --test frontend/test/*.test.js`: **1697 / 1697 PASS**.
- Backend `node --test backend/test/*.unit.test.js`: **1676 / 1705 PASS**, qolgan **29 ta fail** muhitda o'rnatilmagan paketlar: 11 `express`, 9 `jsonwebtoken`, 6 `bcrypt`, 3 `pg`. Umumiy backend suite **PASS emas**.
- Yangi maqsadli muallif testlari **5/5 PASS**, qaror audit testlari **3/3 PASS**; oldingi galereya testlari **15/15 PASS**.
- Frontend import grafigi **PASS** (`frontend/scripts/v153-source-graph.mjs`). JSX parser / haqiqiy Vite build **NOT_RUN** (muhitda frontend npm dependencies yo'q).
- 185 qaror reyestri saqlangan; eski SQL migratsiyalar o'zgarmagan; yangi SQL migratsiya talab qilinmadi.
- **Haqiqiy PostgreSQL, Telegram crawler, brauzer E2E, production build va deployment: NOT_RUN.**

## Keyingi bosqich

v180: **#172–#178** qarorlar. 185 indeks yakunlanganidan so'ng ham qisman talablar va to'liq integratsiya tekshiruvlarini bajarish kerak. Production-ready deb e'lon qilinmagan.
