# USTARA v173 — #123–#129 shop galereyasi va navbat tekshiruvi

**Asos:** v172 arxivi, asl `docs/USTARA_185_NAZORAT.csv` (SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`). Qarorlar reyestri **o‘zgartirilmadi**. Manba auditi: **130/185** (oldin 123, bu safar 7 yangi noyob qaror). Bu ishlashning 130/185 qismi tayyor degani emas.

## Yangi funksiya: #124 sartaroshxona galereyasi (QISMAN)

- `backend/services/shopGalleryV173.js`: faqat haqiqiy barber sessiyasi va faol user/barber bog‘lanishi bilan `GET/PUT /api/shops/mine/gallery`. 8 tagacha, takrorlanmagan, faqat **o‘zining rasmli social_posts** yozuvi; `FOR UPDATE` va revision orqali parallel tahrirdan himoya.
- `backend/database/migrations/20261227_shop_gallery_posts.sql`: `shop_gallery_posts` jadvali, `shop_id/post_id` foreign key va `ON DELETE CASCADE`; 1–8 pozitsiya hamda unique constraint. **Haqiqiy bazada migratsiya ishga tushirilmadi**.
- `GET /api/shops/:id` va `GET /api/shops/by-barber/:barberId`: faqat ilgari mavjud `published=true`, tasdiqlangan sartarosh va faol akkaunt tekshiruvidan keyingina saralangan rasmli galereyani ommaga qaytaradi. Rasmlar avvaldan mavjud `/api/media/:id` yo‘lidan olinadi; tashqi URL va yangi yuklash tizimi qo‘shilmadi.
- Sartarosh `ShopEditV172` sahifasida 8 rasmli postni tanlaydi, yuqoriga/pastga tartiblaydi; mehmon `ShopPublicV172` sahifasida galereyani ko‘radi; UZ/RU/EN va mobil responsiv qoidalar bor.
- Server javobi noma’lum yoki revision to‘qnashsa, UI qayta yozmaydi — avval serverdan yangilaydi. Shop galereyasi hisob, bron, narx, shop verifikatsiyasi va jamoa huquqlarini o‘zgartirmaydi.
- Qisman: shop hali yakka sartaroshga bog‘langan; ko‘p xodimli galereya, shop tasdiqlash, Admin shop mediaga maxsus moderatsiya va haqiqiy browser/PostgreSQL integratsiyasi yo‘q.

## #123–#129 audit holati

| # | Qaror | Holat |
|---|---|---|
| 123 | Sartaroshxona promo kampaniyalari | **YO‘Q**: shop kampaniyalari va cheklovlari mavjud emas |
| 124 | Sartaroshxona galereyasi | **QISMAN**: owner portfoliodan 8 tagacha rasmli post tanlaydi, UI/API/migratsiya unit-testdan o‘tgan |
| 125 | Sartaroshxona va barber baholari alohida | **YO‘Q**: salon tashrifi bo‘yicha alohida rating yo‘q |
| 126 | Umumiy va shaxsiy walk-in navbat | **QISMAN**: yakka sartarosh navbati mavjud, shop-wide umumiy navbat yo‘q |
| 127 | Navbat ETA va chaqiruv xabarlari | **QISMAN**: taxminiy ETA va Telegram kod manbalari mavjud; real E2E yo‘q |
| 128 | Navbatdan ixtiyoriy chiqish | **QISMAN**: QR va manual queue self-exit, umumiy shop navbati yo‘q |
| 129 | Navbat chaqiruvi javob majburiy emas | **QISMAN**: call-next ishlash mexanizmi manba darajasida bor; real Telegram E2E yo‘q |

## Haqiqatan bajarilgan tekshiruvlar

- Yangi `backend/test/v173ShopGallery.unit.test.js` va `frontend/test/v173ShopGallery.test.js`, `backend/test/v173SevenShopQueueDecisions.unit.test.js` manba va mock testlari **17/17 PASS**.
- **Backend to‘liq Node unit:** **1648 PASS / 29 FAIL**, jami **1677**. O‘tmagan 29 nomi v172 dagi 29 test bilan **bir xil**; bu muhitda `express`, `pg`, `jsonwebtoken`, `bcrypt` kabi kerakli npm paketlari yo‘q.
- **Frontend to‘liq Node unit:** **1671/1671 PASS**.
- TypeScript parser: 4 ta yangi/yangilangan JS/JSX manbaning sintaksisi PASS. Frontend import grafigi **PASS**.
- Offline migratsiya auditi **56 forward + 2 rollback PASS**. SQL migratsiya, haqiqiy PostgreSQL schema, browser E2E, real Telegram, Vite production build **NOT_RUN**. Ishlab chiqarishga tayyorlik **tasdiqlanmagan**.
- Oldingi SQL fayllari va 185 qaror reyestri faqat yangi fayllar qo‘shilgan holda aynan saqlangan; tafsilot: `docs/v173-integrity-report.json`.

**Keyingi navbat: v174 — #130–#136**. 185 ta qaror auditi tugagach qisman va bajarilmagan talablarni alohida ishlab chiqish zarur. Hali “LOYIHA TUGADI” deyilmaydi.
