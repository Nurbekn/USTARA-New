# USTARA v149 — Ilhom komponentlari va QR mijoz navbati UZ/RU/EN

**Sana:** 2026-11-20. **Asosiy manba:** `USTARA-v148-185-Customer-Journeys-Languages.zip`, SHA-256 `8f657b9b49135a909cdc01173165ba32f57aa15e300a4dfd4121131b5ed006a5` (1 143 ta fayl).

## 185 qaror #76 — amalga oshirilgan 7 ta ish

1. **Ilhom Composer — media tanlash / tekshirish:** 6 ta rasm yoki 1 ta video, 25/100 MB limitlar, buzilgan rasmni olib tashlash, oldin/keyin, tugmalar va xato xabarlari UZ/RU/EN. Media validation va `URL.revokeObjectURL` o‘zgarmagan.
2. **Composer — tavsif va Gemini:** 2 000 belgili post tavsifi, xizmatni biriktirish, ixtiyoriy AI prompt, generatsiya holati va server tasdig‘ini kutish matnlari tarjima qilindi. AI postni avtomatik yubormaydi; `publish` payload va AbortSignal bir xil.
3. **PostCard — reaktsiyalar, kuzatish, saqlash, shikoyat:** `aria-label`, xizmat/profil havolalari, postni ulashish, media oynasi tilga mos. `like/follow/save/report` server amallari o‘zgarmagan. Profil / Explore havolalarida til saqlanadi.
4. **MediaGallery:** media yuklanmagan / buzilgan xabarlari, rasm ochish accessible label va galereya ta’riflari tarjima qilindi. `resolveMediaUrl`, disable qilinadigan lightbox va videoni o‘ynatish atributlari saqlangan.
5. **QR mijoz check-in:** til tanlash oynasi, so‘rov holatlari, kutish o‘rni va taxminiy vaqtlar tarjima qilindi; QR token, bir martalik request ID, 15 soniyalik polling, stale-response himoyasi saqlangan.
6. **QR Smart Booking / Telegram:** 5 daqiqalik taklif, 2 daqiqalik haqiqiy bron tasdig‘i, xizmat tanlash va narx, Telegram consent hamda navbatdan chiqish xabarlari UZ/RU/EN. Consent, timer, service IDs, expected_total_price va API status enumlari **o‘zgarmadi**.
7. **Ommaviy profil navbat xulosasi / xavfsiz til yo‘llari:** ko‘rinadigan walk-in ma’lumotlar, serverdan eski/xato navbat fallback, taxminiy ETA matni tarjima qilindi. `parsePublicQueueSummary` PII minimallashtirishi va 30s polling saqlangan; til o‘zgarganda OTP/token query’ga ko‘chmaydi.

`frontend/src/pages/user/social/socialQueueLocaleV149.js`: 157 ta UZ manba kaliti uchun rus/ingliz tarjimasi, `Object.hasOwn` xavfsiz fallback; tekshirilgan `formatWait` sonlarini buzmasdan birlik ko‘rinishini lokalizatsiya qiladi. Mazkur tarjimalar **faqat UI matnlariga** qo‘llanadi; serverdan kelgan nom, erkin xabar, narx, muddat, token va ID qiymatlari tarjima qilinmaydi.

## Tekshiruv natijalari

- Yangi `frontend/test/v149SocialQrLanguages.test.js`: **61/61 PASS**; tarjimalar, prototip-poisoningdan himoya, xavfsiz navigatsiya, QR status, maxfiy ma’lumotni filtrlash, API/payload va media limitlari tekshirildi. Bu Node unit/static testlar, brauzer E2E emas.
- Frontend regressiya **1 489 PASS / 0 FAIL**, v148 dagi 1 428 ta testga 61 ta yangi test qo‘shilgan.
- Backend unit **1 412 PASS / 26 FAIL**, 26 FAIL oldingi v148 testlari bilan nomma-nom bir xil; backend manba bu bosqichda o‘zgarmagan.
- 7 ta JSX fayl TypeScript JSX parserida PASS; yangi JS va test `node --check` PASS.
- Asl 185 qaror CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`; 55 SQL fayl, shu jumladan 46 oldinga va 2 rollback migratsiya, va 491 backend fayli v148 bilan baytma-bayt bir xil.

## Hal qilinmagan to‘siqlar

- `npm ci --offline --ignore-scripts`: **ENOTCACHED**, `zod-validation-error@4.0.2` paketi keshda yo‘q.
- Npm registry tekshiruvi: **EAI_AGAIN** DNS/network sababli to‘xtadi. Muhitda frontend `node_modules` yo‘q.
- `npm run build`: **BLOCKED — `vite: not found`**; Vite buildni haqiqiy ishga tushirishga erishilmadi. Boshqa tool orqali build ishladi deb da’vo qilinmaydi.
- Haqiqiy PostgreSQL, Chrome/mobil browser, Telegram bot E2E va server deploy **NOT_RUN**. #76 **QISMAN**: ichki va server erkin xabarlari hali to‘liq tarjima emas. **Production-ready: YO‘Q.**

## Keyingi v150

Tarmoqga ruxsat berilgan muhitda `npm ci` va Vite buildni haqiqatda tekshirish; QR/Telegram sinov uchun real muhit hamda 185 qaror ichidagi qolgan to‘siqlarni prioritetlash. Hozircha original reyestrni va barcha migratsiyalarni o‘zgartirmaslik.
