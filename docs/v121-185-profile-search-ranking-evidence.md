# USTARA v121 — 185 qaror asosida profil va qidiruv (2026-11-20)

**Manba:** `USTARA-v120-185-Booking-Recovery-Receipt-Integrity.zip` (1043 fayl), SHA-256 `bdcb166ca5f82bb00be85e1e4287943670a56e7bfdc7f24ff3a05b3257524d3f`. Bu loyiha oldingi v113→v114 **qayta tiklangan** lineage asosida; tarixiy v114 bilan aynan bir xil ekani tasdiqlanmagan.

## 7 ta bajarilgan vazifa

1. **#3 / #42:** Explore'dagi «Profilni ko‘rish» endi katalog ichidagi qisqa detail emas, `(/user)/barbers/:id` to‘liq public profiliga yo‘naltiradi; `location.state.from` orqali qidiruvga qaytish holati saqlanadi.
2. **#3 / #164:** Xarita markeridan profilga o‘tganda ham avvalgi `q`, `area`, `sort` va boshqa URL filtrlari qaytish uchun saqlanadi.
3. **#16:** Query berilganda public ism/familiya eng ustuvor, keyin salon, mutaxassislik, xizmat va manzil bo‘yicha asosli relevance reytingi qo‘shildi. Bir xil score'larda server tartibi saqlanadi; soxta reyting yaratilmaydi.
4. **#16:** Narx (arzon→qimmat / qimmat→arzon) va ism bo‘yicha saralash; narxi noma’lum profillar oxirida; saralash URL'da saqlanadi, mobil select UI qo‘shildi.
5. **#164:** Manzildagi vergul, chiziqcha va `8-mavze` kabi belgilar moslashuvchan normallashadi; faqat serverda ko‘rsatilgan manzil/tuman qidiriladi, koordinatadan tuman taxmin qilinmaydi.
6. **#16:** Manfiy, `Infinity`, `NaN` va ters min/max narx oralig‘i filtrlari fail-closed rad etiladi, xato interfeysda ko‘rsatiladi.
7. **#3:** Post thumbnail'lari media URL'i almashganda eski «rasm ochilmadi» holatini yangi postga ko‘chirmaydi. Xato yuklangan video uchun dekorativ video belgisi yashiriladi. Yangi holatlar uchun regressiya testlari qo‘shildi.

## Natijalar

- Yangi `frontend/test/v121ExploreSortProfile.test.js`: **16 PASS, 0 FAIL**.
- Barcha frontend `node --test test/*.test.js`: **992 PASS, 0 FAIL, 0 SKIP**.
- Backend `node --test test/*.unit.test.js`: **1327 PASS / 26 FAIL**, shu oldingi paket yetishmasligi bilan bog‘liq; backend kodi bu bosqichda o‘zgarmadi.
- 4 JSX faylda TypeScript transpile parser syntax smoke: **0 sintaksis diagnostikasi**. Bu Vite build emas.
- `scripts/v67-decision-audit.cjs`: **185 qaror**, hash PASS; tarixiy holat bo‘yicha 130 tekshiruv kerak, 47 qisman, 7 keyinga qoldirilgan/bekor, 1 ochiq, 0 to‘liq verifikatsiyalangan.
- `scripts/v67-migration-audit.cjs`: **45 forward + 2 rollback**; offline PASS. Asl CSV va 47 migration fayllari baytma-bayt saqlangan.
- **NOT_RUN:** Vite build (`node_modules` yo‘q), real PostgreSQL, browser/mobile, Telegram E2E, production deployment.
- **Production-ready: NO.** Yangi testlar server/DB ma'lumotining real ishlab turganini emas, koddagi izolyatsiyalangan holatlarni tekshiradi.

## Keyingi bosqich v122

1. Backend/frontend npm paketlarini tarmoqqa ulangan izolyatsiyalangan muhitda `npm ci` bilan o‘rnatish; 26 eski backend dependency xatosini qayta tekshirish.
2. Real Vite production build va mobil 320px/360px/768px layout testlari.
3. #3/#16/#164 ishlashini haqiqiy GET /api/barbers javobi, PostgreSQL test bazasi, to‘liq profil/bron E2E bilan sinash.
4. Barcha 185 qaror uchun dalil, haqiqiy bajarilgan/qisman/ochiq holatini izchil yangilash; asl qaror matnini o‘zgartirmaslik.
