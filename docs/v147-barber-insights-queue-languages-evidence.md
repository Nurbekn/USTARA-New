# USTARA v147 — sartarosh statistikasi, sharhlar, bronlar va navbat UZ/RU/EN

2026-11-20. Baseline: `USTARA-v146-185-Barber-Operations-Languages.zip`, SHA-256 `e3fae3b5c767968eaa251da4b06cc1b4da1351ee21c27568aa22d92b23e9fe7c`.

## 185 qaror #76 — 7 ta amalga oshirilgan ish

1. **Sartarosh bosh paneli:** bugungi daromad, reyting, keyingi mijoz, bron so‘rovlari, xizmatlar va tezkor havolalar UZ/RU/EN. Lang faqat `siteLocalePath` orqali qo‘shiladi; maxfiy parametrlar ko‘chirilmaydi.
2. **Daromad va analitika:** 7/30 kun, xizmatlar bo‘yicha breakdown, nol qiymat va hisoblash asosidagi izohlar uch tilda. `earningsSeries`, snapshot narxlari va `/api/barbers/earnings` endpoint saqlangan.
3. **Sharhlar va javoblar:** yulduz reyting filtri, holat, saqlash, mijozga javob matnlari, rus/ingliz sanalari. Reply 200 belgi va `replyToReview` amali saqlangan.
4. **Bronlar sahifasi:** pending/confirmed/history tablari, server xatolari fallback, bo‘sh holat va qo‘shimcha 30 bronni ko‘rsatish tarjima qilindi. Status enum va paging saqlangan.
5. **Bron kartasi:** narx mavjud emas, status badge, chaqiruv, tasdiqlash/ rad etish/ bekor qilish/ tugallash tasdiqlari tarjima qilindi. `setBookingStatus` va qaytarib bo‘lmaydigan amallar uchun 2-bosqichli tasdiqlash aynan saqlandi.
6. **Jonli navbat, QR va bo‘shagan vaqt takliflari:** QR yaratish, tasdiqlash, ko‘rib chiqilayotganlar, FIFO, kelish, no-show, xizmat boshlanish/tugallanishi, bir martalik kod va takliflar statuslari uch tilda. API statuslar, QR origin, 15 soniyali refresh, bir martalik claim kodi xavfsizligi o‘zgarmagan.
7. **Audit va kun yakuni:** tartib o‘zgartirish sababini so‘rash, no-show va xizmatni tugatish tasdiqlari, kunni yopish/ochish, server checklist statuslari tarjima qilindi. 30 soniyali tasdiq muddatlari, `dayCloseIntent`, `dayReopenIntent` va fail-closed qoidalar saqlangan.

Qo‘shimcha: mavjud `AvailabilityBadge`dagi faol/yopiq/tasdiqlanmagan holati va ARIA labels ham moslashtirildi. Rus va ingliz tillaridagi bron sanalari uchun xavfsiz formatter qo‘shildi. *Faqat UI nusxalari tarjima qilinadi; foydalanuvchi yozgan qiymatlar va API ma’lumotlari avtomatik tarjima qilinmaydi.*

## Test dalillari

- Yangi `frontend/src/pages/barber/barberInsightsLocaleV147.js`: oldingi v146 tarjima moduli bilan xavfsiz, faqat ruxsat etilgan locale, `Object.hasOwn` va cheklangan `{count}` interpolation.
- Yangi `frontend/test/v147BarberInsightsLanguages.test.js`: **39/39 PASS**. Boshlang‘ich status va xavfsizlik testlari tarjima qatlamini tan oladigan qilib moslashtirildi (4 ta mavjud test), xavfsizlik assertlari o‘chirilmagan.
- Frontend barcha unit-testlar: **1 407 PASS / 0 FAIL** (v146: 1 368 PASS).
- Backend barcha `.unit.test.js`: **1 412 PASS / 26 FAIL**; xato nomlari va backend manba v146 bilan **bir xil**.
- O‘zgargan 7 ta JSX fayl sintaksisi TypeScript parser bilan **PASS**; yangi JS moduli `node --check` **PASS**.
- 185 qaror CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` **o‘zgarmadi**. 55 SQL fayl (jumladan 46 forward + 2 rollback) o‘zgarmadi. Backend fayllari o‘zgarmadi.

## Cheklovlar

- **#76 hanuz QISMAN:** ayrim serverdan keladigan xabarlar, foydalanuvchi matnlari, boshqa komponentlar/to‘liq tizim UZ/RU/EN emas.
- `vite: not found` sabab Vite build bajarilmadi; `npm ci --offline` keshga bog‘liq. Haqiqiy PostgreSQL, real brauzer/mobil, Telegram E2E va production deploy **NOT_RUN**.
- Unit-testlarning PASS bo‘lishi real ishlash yoki production readiness dalili emas. Backenddagi 26 ta dependency-related fail saqlanadi. **Production-ready: YO‘Q.**

## Keyingi yo‘nalish

v148 da #76 qolgan mijoz/moderatsiya xabarlarini qamrab olishdan oldin dep-lock, reproducible install, haqiqiy Vite build va PostgreSQL integratsiyasini ustuvor tekshirish; oldingi 185 ta qaror CSV javoblarini qayta yozmaslik. Har versiyada yettita mustaqil, tekshirilgan vazifa.
