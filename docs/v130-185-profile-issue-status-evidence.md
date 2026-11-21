# v130 / 185 qaror — dalillar va cheklovlar

## Manba
- `USTARA-v129-185-Profile-Issue-Queue-Safety.zip` SHA-256: `66bcefa573e62f8f66a436e714ffbbf6b829e838a3cf00e3fb7b4164ac1397d7`.
- Qarorlar: #178 `Profildagi xatoni bir tugma bilan bildirish`, #83 `Admin kontent moderatsiyasi`, #49 `Dalilli shikoyat va apellyatsiya` (bu bosqichda apellyatsiya/to‘liq dalil yuklash qo‘shilmadi). #159 shaxsiy telefon maxfiyligi ham inobatga olindi.

## Yetti kod yo‘nalishi
1. Customer-only, self-scoped `ownPending()` GET, SQL parametrlar, faqat `pendingReasons` qaytariladi.
2. Auth middleware, ID/rol fail-closed, boshqa foydalanuvchining ID/izoh/telefonini oshkor qilmaslik.
3. Client pending-categories model va mavjud ochiq turdagi shikoyatni takror yuborishni bloklash; backend UNIQUE cheklov o‘zgarishsiz.
4. React holatida profile/token almashuviga `AbortController`, login/token guard, konservativ failure UI.
5. Admin 101 lookahead query, ko‘rinadigan 100 yozuv va aniq `hasNext` (ilgari exact 100 holatida noto‘g‘ri next bor edi).
6. Admin request query whitelist va noto‘g‘ri ro‘yxat qiymatlarini fail-closed rad etish.
7. PATCH body strict status va noaniq commit/timeout uchun halol error; hech qanday avtomatik PATCH retry qo‘shilmadi.

## Test usullari
- `node --test backend/test/v128ProfileIssueReports.unit.test.js backend/test/v129ProfileIssueQueue.unit.test.js backend/test/v130ProfileIssueModeration.unit.test.js` — **35/35 PASS**.
- `node --test frontend/test/v128ProfileIssueReporting.test.js frontend/test/v129ProfileIssueQueue.test.js frontend/test/v130ProfileIssueExperience.test.js` — **29/29 PASS**.
- Frontend `npm run test:unit`: **1097 PASS**, backend `npm run test:unit`: **1385 PASS / 26 dependency FAIL** (26 eski test nomi v129 bilan mos kelishi alohida taqqoslanadi).
- Source-only tests mock DB bilan; haqiqiy PostgreSQL transaction/quarantine correctness tasdiqlanmagan.
- JSX parse TypeScript; bu build yoki browser E2E emas.

## Hali bajarilmagan
- Haqiqiy PostgreSQL migration va queries, browser/mobile va Telegram E2E.
- Npm paketlarini o‘rnatib `vite build` dan o‘tish, foydalanuvchi oqimini yakunigacha browserda ko‘rish.
- #49 ning to‘liq shikoyat dalili yuklash va apellyatsiya oqimi. Original 185 qaror holatlari o‘zgarmagan, barcha talablar tugagan deyilmaydi.

**Production-ready: YO‘Q.**
