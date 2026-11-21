# USTARA v175 — #137–#143: Identity / Smart Navigation manba auditi

**Asos:** v174 ZIP va asl `docs/USTARA_185_NAZORAT.csv` (SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`). Asl reyestr o‘zgarmagan. **144/185** qaror manba darajasida ko‘rib chiqildi, yana **41** ta navbatda. Bu production tayyorlik foizi emas.

## v175 da yangi ishlangan funksiya: #141 Smart Navigation

- Mehmon yoki mijoz sartaroshning **ommaviy profilida** xarita provayderini tanlaydi: **Google Maps, Yandex Maps, 2GIS, OpenStreetMap**. Oldin bron tafsilotida xarita havolalari va ommaviy profilda faqat OpenStreetMap mavjud edi.
- Havolalar faqat mavjud raqamli, haqiqiy geografik chegaradagi **profil koordinatalari** bo‘lsa chiqadi. Manzil matni bo‘yicha taxminiy nuqta yaratilmaydi.
- Tashqi URLga **mijoz joylashuvi, telefon raqamlari, bron tafsilotlari** yuborilmaydi. Odam o‘zi provayderni bosmaguncha xarita sayti ochilmaydi.
- Uch tilda izoh: xarita **nuqtani ko‘rsatadi**, undan keyin marshrutni provayderning o‘zida tanlash lozim. Haqiqiy navigatsiya yoki provayderning onlayn javobi bu muhitda sinov qilinmagan.
- Interfeysdagi `<details>` va havolalar klaviatura orqali ishlatish uchun oddiy HTML elementlar. Brauzer E2E, vizual/a11y audit hali bajarilmadi.
- Yangi SQL migratsiya, avtomatik bron o‘zgarishi yoki tashqi API kaliti qo‘shilmadi.

## #137–#143 holatlari

| # | Talab | Dalilli holat / qolgan ish |
|---|---|---|
| 137 | Mijoz va sartarosh alohida akkaunt | Registration/login rol bo‘yicha ajratilgan; real E2E va barcha endpoint ruxsatlari to‘liq tekshirilmagan. |
| 138 | Chiqish/kirish orqali akkaunt almashtirish | Sessiyani tozalash va kirish kodi mavjud; haqiqiy qurilmalar va browser E2E qolgan. |
| 139 | Har bir telefon faqat bitta akkauntga | `users.phone UNIQUE` va normallashtirish mavjud; real parallel PostgreSQL sinovi qolgan. |
| 140 | Professional Account Recovery | Xavfsiz murojaat va Admin review asoslari bor, ammo **real identifikatsiya/akkauntni tiklash oqimi yo‘q**. Admin review parol/telefonni tiklab bermaydi. |
| 141 | Smart Navigation 2GIS/Yandex/Google | **Yaxshilandi (qisman)**: ommaviy profil uchun 4 havola, qat’iy koordinata tekshiruvi. Live provayder, marshrut, browser E2E qolgan. |
| 142 | Smart Working Hours | Haftalik jadval UI va backend validatsiyasi mavjud; timezone, calendar exceptions va parallel bron real DB sinovlari qolgan. |
| 143 | Smart Price Transparency | Xizmat narxi/bron quote va narx snapshoti kodi mavjud; real PostgreSQL tranzaksiyasi va narx o‘zgarishi E2E qolgan. Onlayn to‘lov yo‘q. |

## Testlar

- **Frontend barcha `test/*.test.js`: 1681/1681 PASS**.
- **Backend barcha `test/*.unit.test.js`: 1653/1682 PASS**; qolgan **29 xato avvalgi versiya bilan nomma-nom bir xil**. Bular `express` (11), `jsonwebtoken` (9), `bcrypt` (6), `pg` (3) paketlari o‘rnatilmaganligi sababli.
- **Tanlangan regressiya**: frontend 39/39 PASS, backend 16/16 PASS (**55/55**).
- v175 yangi testlar: **5 frontend + 3 backend = 8/8 PASS**.
- Frontend source-graph preflight PASS; yangi JSX/JS fayllar TypeScript parser sintaksisi PASS.
- Build-doctor: **BLOCKED** (npm dependencies yo‘q). Haqiqiy **PostgreSQL, browser E2E, Telegram, production build: NOT_RUN**.

## Fayl yaxlitligi

- v174 ZIP ichidagi **1357 ta faylning hech biri yo‘qolmagan**. Yangi koddan oldingi 5 ta yangi fayl: audit skripti, audit testi, audit JSON, navigation helper va frontend testi.
- 2 ta mavjud fayl yangilandi: `BarberPublicProfile.jsx`, `BarberPublicProfile.css`.
- Tarixiy SQL migratsiyalar, `schema.sql` va asl qaror reyestri **baytma-bayt o‘zgarmagan**; yangi migratsiya yo‘q.
- CRC arxiv yaratilgach alohida tekshiriladi.

**Xulosa:** #137–#143 manbalari ko‘rib chiqildi. Identity va narx kabi muhim yo‘nalishlar production uchun to‘liq tasdiqlanmagan. Keyingi bosqich #144–#150; oldingi ochiq implementatsiyalar ham alohida qolmoqda.
