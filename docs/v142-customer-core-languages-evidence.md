# USTARA v142 — #76 mijoz Home, qidiruv va bron interfeysining uch tilli qismi

Sana: 2026-11-20. Asos: `USTARA-v141-185-Site-Navigation-Languages.zip`.

Bu ish **185 qaror reyestridagi #76 "O‘zbek rus ingliz tillari va Admin tarjimasi"** ning **qisman** bajarilishidir. Yordam/Admin/umumiy navigatsiyadagi avvalgi ishlar saqlangan.

## 7 ta amaliy vazifa

1. `frontend/src/pages/user/coreLocale.js`: `uz`/`ru`/`en` uchun Home, Explore va asosiy bron UI tarjimalari. Noto‘g‘ri yoki takrorlangan `lang` → o‘zbekcha fallback; API statuslari, JWT, narx va ID'lar tarjima qilinmaydi.
2. `UserHome.jsx`: qidiruv, kuzatilganlar, tavsiyalar, reklama belgilari, karta amallari, bo‘sh/xato holatlar. Ommaviy profil va bron havolalari tilni saqlaydi.
3. `UserHome.jsx` soch turmagi galereyasi: yo‘nalishlar, sarlavha, izoh va CTA tarjima qilindi; 3×3 oldindan mavjud tasvir/rotatsiya logikasi saqlandi.
4. `Explore.jsx`: qidiruv, saralash, narx, manzil, masofa, xizmat filtrlarining label/placeholder/empty/error ko‘rinishlari tarjima qilindi. ID va filter selection ma'nosi o‘zgarmaydi.
5. `ResultCard.jsx` + `ComparisonPanel.jsx`: profil, bron, narx, solishtirish, masofa va asosiy natija matnlari tarjima qilindi; narx boshqa xizmatdan taxmin qilinmaydi, xizmat ID havolada qoladi.
6. `InlineBooking.jsx`: xizmat tanlash, hafta/kuni/slot ko‘rinishi va bron tasdiqlash modali tarjima qilindi. Narx, xizmatlar, vaqt, maxfiy ma’lumot, qayta tiklash va server xatosi semantikasi o‘zgartirilmadi. Ba'zi xavfsizlik xabarlari / server xatolari hali o‘zbekcha: **butun bron oqimi 100% tarjima qilingan deb da'vo qilinmaydi**.
7. `siteLocaleSwitchUrl`: qidiruvning tekshirilgan ommaviy filtrlari va sartarosh profilida `tab=services&services=...` uchun 1–20 ta yagona ijobiy butun xizmat IDlarini til almashtirishda saqlash. `otp`, `token`, password, ortiqcha va noto‘g‘ri query parametrlari tashlanadi. 13 ta yangi test va 7 ta eski struktura testlari yangilandi; tekshiruvlar yumshatilmadi.

## Test dalillari

- Frontend `node --test test/*.test.js`: **1289 PASS, 0 FAIL, 0 SKIP** (v141: 1276; yangi v142: 13).
- Backend `node --test test/*.unit.test.js`: **1412 PASS / 26 FAIL, 0 SKIP**. 26 FAIL nomi v141 bilan **aynan bir xil**, source/back-end o‘zgarmagan; yetishmayotgan paketlar sabab.
- Global TypeScript parser: `coreLocale.js`, `UserHome.jsx`, `Explore.jsx`, `ResultCard.jsx`, `ComparisonPanel.jsx`, `InlineBooking.jsx`, `siteLocale.js` — 0 parse diagnostics; `node --check` — PASS.
- `npm ci --offline --ignore-scripts --no-audit --no-fund`: **ENOTCACHED** (`zod-validation-error-4.0.2.tgz` keshda yo‘q).
- `npm run build`: **BLOCKED** (`vite: not found`).
- Original `docs/USTARA_185_NAZORAT.csv` SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`; o‘zgarmadi.
- 46 ta forward + 2 ta rollback SQL migratsiya, barcha oldingi backend fayllar — byte-to-byte o‘zgarmagan.
- Haqiqiy PostgreSQL, brauzer/mobile, Telegram, deployment sinovlari: **NOT_RUN**.

**Status:** #76 — QISMAN. **Production-ready: NO**.

## Cheklov va keyingi v143

Mehmon/public-profile tab sarlavhalari, mijoz bronlar ro‘yxati, auth/OTP, sartarosh ichki ekranlari va API/server matnlari hali ham to‘liq tarjima qilinmagan. Vite va PostgreSQL real testlari ham ochiq. Keyingi versiyada #76 qolgan ko‘rinishlarini bosqichlab tarjima qilish va brauzer/deploy sinovlariga tayyorlash, asl 185 qaror reyestrini dalilsiz o‘zgartirmaslik.
