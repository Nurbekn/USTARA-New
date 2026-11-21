# USTARA v118 — 185-qaror asosidagi haftalik booking xavfsizligi

**Sana:** 2026-11-20. **Baza:** `USTARA-v117-185-Weekly-Availability-Explorer.zip`, SHA-256 `f13c87c0e7fccd6382dfe26ccfe828d35392e2aa3acd88237d751605a79e8f75`.

## Qaysi original qarorlar

- **#92**: «7 kunlik Smart Availability Explorer» — asosiy xatolarni qayta tekshirish va keyingi tekshirilgan kunga tez o'tish.
- **#42**: «Profil bron qilish tugmasining ustuvorligi» — mijozning hafta/day tanlovi va bron qilish ketma-ketligida state yo'qolmasligi.
- **#52**: «Bron narx vaqt va manzil snapshoti» — haftalik yangilash alohida kunning narx/slot snapshotini yangilaydi; serverdan quote olmasdan avtomatik bron qilmaydi.
- **#100**: «Server tasdig‘i bilan bron yakuniy oynasi» — noaniq COMMIT natijasini muvaffaqiyatsizlik sifatida talqin qilmaydi.

## Yetti kichik o'zgarish

1. `watchAvailabilityWeek`: qatorasiga keladigan 7 ta haqiqiy ISO-sana talab qiladi, erta xato bilan to'xtaydi.
2. Sartarosh va 2–20 ta xizmat ID'lari pg int4 chegarasida, noyob va haqiqiy bo'lmasa GET yuborilmaydi.
3. `initialDays` faqat mos sana/statusdagi avvalgi natijalar uchun qabul qilinadi. Faqat xato kunlar qayta so'raladi; yangi natija yo'q joyda bo'sh vaqt taxmin qilinmaydi; 2 parallel GET chegarasi saqlanadi.
4. 7 ta so'rov tugagach, server javobiga asoslangan ilk «available» kunga tez o'tish tugmasi. Vaqt avtomatik tanlanmaydi, POST qilinmaydi.
5. Boshqa haftaga o'tishda sanani o'sha haftaga o'tkazadi, oldingi kun vaqt/soat va eski confirmation tozalanadi. Kech kelgan so'rovlar state tokeni bilan filtrlanadi.
6. «Haftani yangilash» tanlangan kunning slot/quote GET'ini ham yangilaydi va oldingi tasdiqlash oynasini bekor qiladi. Xato kunlar uchun alohida retry mavjud.
7. Backend `503 booking_result_unknown` qaytarsa, ilova «bron yaratilgan bo'lishi mumkin» deb ko'rsatadi va oldingi idempotency ID'ni saqlashga tayanadi. Takroriy POST uchun boshqa slot ID bilan yangi request yuborilmaydi.

## Haqiqiy test dalillari

- `node --test frontend/test/*.test.js`: **952 PASS, 0 FAIL, 0 SKIP**.
- `node --test frontend/test/v118*.test.js`: **13 PASS, 0 FAIL, 0 SKIP**.
- TypeScript JSX/JS parser smoke: **3 ta fayl, 0 syntax diagnostics**.
- `node --test backend/test/*.unit.test.js`: **1327 PASS, 26 FAIL, 0 SKIP** — 26 tasi mavjud `MODULE_NOT_FOUND` dependency muammolari, v117 bilan bir xil. Haqiqiy PG integratsiya ushbu unit test gate'ga kirmaydi.
- `scripts/v67-decision-audit.cjs`: 185 qaror, original hash **bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71**, PASS.
- `scripts/v67-migration-audit.cjs`: **45 forward + 2 rollback**, offline PASS; barcha avvalgi SQL va original CSV byte-for-byte saqlandi.
- **NOT_RUN:** Vite production build (vite o'rnatilmagan), haqiqiy PostgreSQL, mobil/brauzer E2E, Telegram E2E, production deploy.

**Cheklov:** bu mustaqil qayta tiklangan v114 → v117 zanjirining davomi. v118 ham tarixiy manba kodiga bayt-bayt tengligi, 185/185 talab bajarilganligi yoki production-ready holatini da'vo qilmaydi. CSV'dagi statuslar o'zgartirilmadi.
