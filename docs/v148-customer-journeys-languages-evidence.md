# USTARA v148 — mijoz bronlari, xarita va Ilhom UZ/RU/EN

2026-11-20. Asosiy manba: `USTARA-v147-185-Barber-Insights-Queue-Languages.zip` (1 140 fayl), SHA-256 `a06b6fd659256059e266e36a2a731ff8f05ddfaa3a31f14cf7617b509a3121d6`.

## 185 qaror #76 — 7 ta amaliy vazifa

1. **Mijozning bronlar sahifasi:** barcha/kelgusi/tarix filtrlari, yuklanish/xato/bo‘sh holat, yordam va navbat havolalari o‘zbek, rus va ingliz tillarida. Bron statuslari API’dagi enum sifatida saqlanadi, tarjima faqat aks ettirishga tegishli.
2. **Bron kartasi va tafsilotlari:** status badge, xizmatlar, vaqt/davomiylik, umumiy summa, sartarosh bilan aloqa va tashrif tarixining asosiy UI yozuvlari tarjima qilindi. Narxlar va sana qiymatlari tarjima qilinmaydi.
3. **Bronni o‘zgartirish:** xizmat tanlash, 5 daqiqa qadamdagi bo‘sh vaqtlar, yangi narx izohi, tasdiqlash va sessiya almashganida xato holatlari tarjima qilindi. `loadRescheduleSlots`, `rescheduleCustomerBooking`, `savingRef`, `requiresRescheduleReconciliation` amallari saqlangan.
4. **Bronni bekor qilish va muqobil vaqtlar:** qaytarib bo‘lmaydigan amal tasdig‘i, server tekshiruvlari, 3 kunlik *faqat ma’lumot uchun* muqobil vaqtlar, ochiq joyni avtomatik band qilmaslik haqidagi ogohlantirishlar tarjima qilindi. `validateCancellation`, `canCancel`, `subscribeSession` himoyalari saqlangan.
5. **Xaritadagi sartaroshlar:** xarita sarlavhalari, tanlangan pinlar, profil va bron havolalari va tile xato/koordinata yo‘q fallback xabarlari tarjima qilindi. Til profil va bron havolalarida saqlanadi. `returnState` endi faqat xavfsiz `siteLocaleSwitchUrl` qiymatlaridan iborat, boshqa URL parametrlari ko‘chirilmaydi. Kenglik/uzunlik, pinlar va OSM serveri o‘zgarmagan.
6. **Ilhom lentasining asosiy qismlari:** sahifa/tablar, qidiruv, bo‘sh holat, izoh va shikoyat formasi, ulashish xabarlari UZ/RU/EN. Social API `post`, `follow`, `like`, `save`, `report`, moderation reason codes va server tasdig‘i o‘zgarmagan. Portfolio/Composer ichidagi barcha matnlar hali qamrab olinmagan.
7. **Xavfsiz tilni almashtirish:** `/user/bookings`da `status` va tekshirilgan raqamli `booking`, `/user/social`da `tab/q/category/post` faqat ruxsat etilgan qiymatlar bilan saqlanadi. Noto‘g‘ri/duplikat/uzun ID va filtr, parol, OTP, token va sessiya qiymatlari tashlab yuboriladi; ular boshqa marshrutga olib o‘tilmaydi.

`frontend/src/pages/user/customerActivityLocaleV148.js` modulida **182 ta asl matn uchun RU/EN tarjima** saqlanadi; yana 7 ta qo‘shimcha kontekst matni keyingi tekshiruvda qo‘shildi. `Object.hasOwn` va uch til uchun xavfsiz fallback ishlatiladi. Mijoz kiritgan nomlar va serverdan keladigan erkin matn avtomatik tarjima qilinmaydi. Oldingi UZ nusxasi fallback.

## Dasturiy va regressiya dalillari

- Yangi `frontend/test/v148CustomerJourneyLanguages.test.js`: **21/21 PASS**; oldingi xarita va yordam navigatsiya testlari lokalizatsiyali marshrutga moslashtirilgan, xavfsizlik tekshiruvi saqlangan.
- To‘liq frontend unit-test: **1 428 PASS / 0 FAIL** (v147: 1 407 PASS).
- To‘liq backend `.unit.test.js`: **1 412 PASS / 26 FAIL**; ayni muhitda qayta yugurtilgan v147 bilan **26 FAIL nomma-nom bir xil**.
- 5 ta o‘zgargan JSX fayl TypeScript JSX sintaksis parserdan **PASS**, yangi locale JS va `siteLocale.js` `node --check`dan **PASS**.
- 185 qaror CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` o‘zgarmagan.
- 55 SQL fayl, jumladan 46 forward va 2 rollback migratsiya, oldingi manba bilan baytma-bayt bir xil. Backend fayllari o‘zgarmagan.

## Mustaqil bajarilmagan tekshiruvlar va cheklovlar

- `npm ci --offline` — **ENOTCACHED**, keshda `zod-validation-error@4.0.2` paketi yetishmaydi.
- `npm run build` — **BLOCKED: `vite: not found`**; shuning uchun real browserga yuklash va ishlab chiqarish buildi tekshirilmagan.
- Haqiqiy PostgreSQL, mobil browser, Telegram E2E va production deploy — **NOT_RUN**. Backenddagi 26 FAIL tuzatilmagan; shu sabab production-ready emas.
- #76 hali **QISMAN**: boshqa mijoz/ustoz qismlari va server xabarlari to‘liq tarjima emas. Ushbu versiya faqat aniq sanab o‘tilgan interfeyslar uchun.

## Keyingi v149

Dependency o‘rnatishning tarmoq imkoniyati bo‘lgan muhitini tekshirish va Vite build/E2E sinovlarini ishga tushirishni ustuvor qilish; qolgan ijtimoiy post/portfolio komponentlari va QR mijoz oqimining lokalizatsiyasini alohida bosqichlarga ajratish. 185 qaror CSV va migratsiyalarni saqlash.
