# USTARA v119 — 185 qaror doirasidagi booking HTTP contract, recovery va build readiness

**2026-11-20.** Ish v118 `USTARA-v118-185-Booking-Availability-Safety.zip` kodidan davom ettirildi. Bu v113 dan qayta tiklangan versiyalar zanjiridir; tarixiy v114 byte-for-byte nusxasi emas.

## 7 ta bajarilgan ish

1. v118 ZIP original SHA-256 va 1039 fayl CRC tekshirildi, 185 qaror/SQL audit qaytadan tasdiqlandi.
2. `createBooking.js` da `request('POST', '/api/bookings', { body, token, signal })` kontrakti tuzatildi. Ilgari `token` va `signal` ortiqcha pozitsion argument sifatida uzatilgan va HTTP client ularni e'tiborga olmagan; endi JWT `Authorization` headerida bor.
3. Bron yuborilayotgan vaqtda `AbortSignal` aynan transportga o'tadi: chiqish/signout paytida bekor qilingan so'rov boshqa sahifa holatini yangilamaydi. Abort qilingan POST serverda commit bo'lmaganiga dalil emas; recovery mexanizmi saqlanadi.
4. Server `409 booking_in_progress` qaytarganida browser idempotency `request_id`ni o'chirmaydi. Oldingi so'rov noma'lum bo'lganida boshqa tanlov bilan POST bloklanadi.
5. Read-only `GET /api/bookings/recovery/:requestId` javobini qabul qilishda shu sessiyaning roli, akkaunt IDsi, mijoz profili va tokeni o'zgarmaganligi qo'shimcha tekshiriladi.
6. `frontend/test/v119BookingHttpContract.test.js` ichida GET slot → quote/confirmation → authenticated POST, bir xizmat va ko'p xizmat, narx, idempotency, 503 unknown, 409 in-progress, GET recovery, sessiya xotirasi bo'yicha 13 yangi contract testi yozildi.
7. Backend/frontend lockfile va o'rnatilgan modul holati tekshirildi; real dependency install/build/postgres holati aniq NOT_RUN yoki BLOCKED sifatida saqlandi. Talab/qarorlar va SQL migrationlar o'zgarmadi.

## Haqiqiy tekshiruv dalili

- Original v118 ZIP: `0a086a13005bc01a70f271ad445fba9b13f7bc9e9d48b5e2411618943c7da1be`, 1039/1039, CRC PASS.
- Yangi v119 contract testlari **13 PASS, 0 FAIL**, frontend umumiy **965 PASS, 0 FAIL, 0 SKIP** (v118: 952 PASS).
- Backend unit **1327 PASS, 26 FAIL, 0 SKIP**. 26 tasi `MODULE_NOT_FOUND` sinfida (bcrypt, jsonwebtoken, pg, express va boshqa importlar). Bu 26 failure v118 dagi miqdor bilan teng; real paketlar o'rnatilmagani uchun ular bartaraf bo'lmadi.
- `v113-dependency-readiness.js`: backend 0/7, frontend 0/17 direct dependency mavjud; lockfile mismatch = 0.
- `npm ci --offline --ignore-scripts` (har bir qismning package/lockfile nusxasida): `ENOTCACHED`. Registry ulanish urinishi: `EAI_AGAIN`; shu sabab test muhitida ruxsatli dependency install imkoni bo'lmadi.
- `npm run build`: `vite: not found` (exit 127), **BUILD BLOCKED**, PASS emas.
- Node `--check` booking va test moduli PASS; TypeScript parser orqali InlineBooking.jsx JSX syntax PASS.
- Qaror audit: 185, original CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`. Historical statuses auditning o'zi production proof emas.
- SQL migrations: 45 forward + 2 rollback, offline order audit PASS, v118 dan bitma-bit o'zgarmagan.
- **NOT_RUN:** haqiqiy PostgreSQL `ustara_test_db` integration, Chrome/mobile browser E2E, Telegram, deployment. Real DB da ma'lumot o'zgartirilmagan. **Production-ready: YO'Q**.

## 185 qarorlarga moslik

Ushbu ish #5 (ko'p xizmat), #6 (slot tanlash), #42 (profil bron jarayoni), #52 (server narx/time snapshoti), #92 (7 kunlik ko'rinish), #100 (yakuniy server tasdig'i), #144 (internet uzilishidan tiklash) bilan bog'liq. Ularning birortasi to'liq production tekshiruvdan o'tdi deb belgilanmaydi; CSV holatlari o'zgartirilmadi.

## Keyingi v120

Tarmoq mavjud test muhitida aynan `package-lock.json` bilan `npm ci`; frontend Vite build va haqiqiy Chrome mobil/desktop flow. Alohida lokal **ustara_test_db** (production connection qabul qilinmasin), kam huquqli DB user, buning ustiga GET → POST → idempotent replay/lost COMMIT/parallel slot tests. Haqiqiy PASS dalillarigagina status o'zgartirish. #16/#164 qidiruv backend, #92 weekly availability jarayonini browser orqali tekshirish.
