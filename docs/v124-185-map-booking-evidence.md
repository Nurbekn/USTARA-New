# USTARA v124 — xaritadan profil/bron xavfsizligi (2026-11-20)

**Asos:** `USTARA-v123-185-Location-Search-Booking-Access.zip`; SHA-256 `4d7a7bda69d67272210e465da053a33afac83bc4e4c1feb11b30faa810b14797`. Tarixiy v114 manbasining aynan nusxasi emas: v113 asosida v114 rekonstruksiya qilinib, keyin v123 gacha rivojlantirilgan.

## 185 qaror bo‘yicha 7 ta texnik ish

1. #3/#164: xarita pinlari endi manzil va sartarosh ismini ko‘rsatadigan Popup ochadi; pin ichidan profil havolasi ochiladi, mavjud qidiruv URL manzili `state.from` orqali saqlanadi.
2. #42: xarita popup'ida faqat e'lon qilingan haqiqiy xizmatlar bor bo‘lsa «Bron qilish» havolasi chiqadi. Bu bronni avtomatik tasdiqlamaydi.
3. #42: Explore’da tanlangan xizmat IDsi shu sartaroshda mavjud bo‘lsa, popup orqali bron sahifasining `services` parametriga uzatiladi; boshqa xizmatga ulanmaydi.
4. #164: koordinatasi yo‘q natijalarda xarita soxta pin chizmaydi va ro‘yxatga o‘tish tugmasini taklif qiladi.
5. #16: xarita plitkalari yuklanmasa ham ro‘yxatga o‘tish mumkin; mobilda bosish maydoni va klaviatura fokusi aniq.
6. #16/#164: mijoz profili koordinatasi yo‘q bo‘lsa, masofa filtri va eng yaqin saralash ikkalasi ham aniq yordam xabarini beradi; «natija yo‘q» deb yashirilmaydi.
7. #16/#42: ommaviy katalogda narx/xizmat/manzil o‘zgaruvchanligi sababli `Cache-Control: no-store` qo‘yildi; izolatsiyalangan backend tekshiruvi bilan success/failure holatlarida sinovdan o‘tdi.

## Haqiqiy dalillar

- Frontend Node.js unit-test: **1034 PASS / 0 FAIL / 0 SKIP**, v124 yangi **15 PASS**.
- Backend unit-test: **1329 PASS / 26 FAIL / 0 SKIP**, yangi v124 **2 PASS**. Qolgan 26 xato nomi v123 dagi 26 ta bilan bir xil; npm paketlari o‘rnatilmagan (`bcrypt`, `pg`, `jsonwebtoken` va boshqalar).
- `node --test test/*.test.js` kengroq backend sinovi: **1329 PASS / 52 FAIL / 20 SKIP**. Bu tarkibga dependency hamda alohida integratsion testlar kiradi; production/PG sifatida PASS emas.
- `npm ci --offline` frontend/backend: **ENOTCACHED**. `npm run build`: **exit 127 (`vite: not found`)**. TypeScript transpilation syntax: **0 diagnostic** (haqiqiy Vite build emas).
- Asl 185 qaror CSV SHA-256 **`bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`**, o‘zgarishsiz. Reyestr holatlari amalda to‘liq verified deyilmaydi.
- **45 forward + 2 rollback SQL** va bootstrap o‘zgarishsiz, offline audit PASS. PostgreSQL real concurrency, mobil Chrome va Telegram sandbox sinovlari **NOT_RUN**.
- **Production-ready emas**. Keyingi bosqichda tarmoqqa ulangan ajratilgan muhitda npm ci + build + haqiqiy test DB va brauzer E2E.
