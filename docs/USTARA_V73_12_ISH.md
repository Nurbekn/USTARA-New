# USTARA — so‘nggi checkpoint v73 (2026-11-19)

**Manba:** USTARA-4-Bosqich-Barber-Setup-Integrity-v72.zip (819 fayl).
**v73:** USTARA-4-Bosqich-Service-Editor-Safety-v73.zip.

## Amaliy o‘zgarishlar
1. Sartarosh xizmat nomi NFC orqali normalizatsiya qilinadi va ortiqcha bo‘shliqlar birlashtiriladi.
2. Nom 2–50 ta Unicode belgisi bo‘lishi kerak, yashirin boshqaruv belgilari rad etiladi.
3. Xizmat narxi faqat 1000–99999999 oralig‘idagi butun so‘m miqdori bo‘lishi kerak.
4. Katta/negative/decimal/exponent narxlar rad etiladi, narx maydoni 8 raqam bilan cheklanadi.
5. Narx +/- tugmalari chegaradan chiqmaydi.
6. Davomiylik 5–60 min, 5 daqiqalik qadamlar bo‘yicha tekshiriladi.
7. Saqlash/o‘chirishda reentrant ikki so‘rovning oldi olinadi (ref lock).
8. Amaliyot davomida o‘zgartirish/o‘chirish/qo‘shish tugmalari bloklanadi.
9. Mijoz/sartarosh sessiyasi o‘zgarsa eski javob bilan ro‘yxat yoki formani o‘zgartirmaydi.
10. Xizmat listi yo‘q yoki noto‘g‘ri bo‘lsa komponent bo‘sh ro‘yxat bilan ishlaydi.
11. Xizmatni o‘chirishdan oldin ID integer/positive ekanligi tekshiriladi.
12. Yangi sozlamalar bitta mustaqil testlanadigan modulga chiqarildi.

**O‘zgargan:** frontend/src/pages/barber/Services.jsx
**Yangi:** frontend/src/pages/barber/data/serviceForm.js, frontend/test/v73ServiceForm.test.js.

## Tekshirish
- Frontend Node unit testlar: **264/264 PASS** (v72: 244, yangi: 20).
- Backend service body unit testlar: **17/17 PASS**.
- 185 qaror audit: **PASS**, CSV SHA-256 bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71 (o‘zgarmagan).
- 42 forward + 2 rollback migratsiya: OFFLINE_PASS; DB runtime NOT_RUN.
- React Vite build, haqiqiy brauzer, PostgreSQL, Telegram: **NOT_RUN**; production-ready emas.
- Tarixiy audit: needs_verification 130, partial 47, deferred_or_cancelled 7, open 1; completed deb belgilanmagan.

**Keyingi v74:** backend service katalogidagi ruxsatlar, UI/server validatsiya mosligi va booking narx snapshotini tekshirish.
