# USTARA v120 — 185 qaror / bron javobi va recovery kontrakti

**Asos:** `USTARA-v119-185-Booking-Transport-Contract.zip` (1041 fayl), asl qarorlar CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.

## Aynan 7 ta yakunlangan kod va test vazifasi

1. **#52 — server narxi majburiy:** mijoz oldindan narxni tasdiqlaganida server bron javobida `total_price` qiymatini yubormasa, success ko'rsatilmaydi; holat noma'lum sifatida qoladi. Server qaytargan narx so'm/tiyin darajasida solishtiriladi.
2. **#5 — ko'p xizmat yaxlitligi:** 2–20 xizmatli bron tasdig'ida `services` ro'yxati va tartibi bo'lishi shart; bir xizmatli legacy javob hali ham ishlaydi.
3. **#52 — qoidalar validatsiyasi:** `expected_cancellation_policy` qiymati POSTdan oldin tekshiriladi; cutoff null yoki 0–10080 butun daqiqa, matn 280 belgigacha.
4. **#144 — request ID validatsiyasi:** yuboriladigan ixtiyoriy `request_id` UUIDv4; browserning `crypto.randomUUID()` natijasi ham tekshiriladi. Buzilgan qiymat serverga yuborilmaydi.
5. **#100/#144 — recovery bog'lanishi:** read-only GET natijasi saqlangan barber ID, xizmatlar tartibi va aniq vaqt bilan solishtiriladi. Brauzer UI eski pending signature qiymatini recoveryga uzatadi; boshqa bronni xato tasdiqlamaydi.
6. **#144 — idempotency va sessiya:** bir vaqtda yuborilgan POSTni birgalikda kutish faqat bir xil account, bearer token, customer profile, tanlov va quote uchun ruxsat. Noto'g'ri session yoki yangilangan quote eski so'rovning javobiga ulanmaydi.
7. **#100/#144 — noto'g'ri recovery payload:** serverda `found:false` + row yoki `found:true` + `uncertain:true` kabi qarama-qarshi javoblar rad qilinadi; sessionStorage'dagi buzilgan signature tiklash uchun ishonchli deb olinmaydi. Regressiya testlari kengaytirildi.

## Haqiqiy natijalar (2026-11-20)

- Frontend Node unit tests: **976 PASS, 0 FAIL, 0 SKIP**, qo'shilgan v120 testlar **11/11 PASS**.
- Backend Node unit tests: **1327 PASS, 26 FAIL, 0 SKIP**. 26 ta failure avvalgi v119 dagi kabi o'rnatilmagan dependency / MODULE_NOT_FOUND bilan bog'liq; bu backend to'liq PASS degani emas.
- Kengaytirilgan backend (unit + integration test fayllari, servis/DB o'rnatilmasdan): **1327 PASS, 52 FAIL, 20 SKIP**. Bu integratsiya tasdiqlangani emas; integratsiya suitlarining bir qismi dependency/PostgreSQL yo'qligi sabab o'tmadi.
- `npm ci --offline` (backend/frontend izolyatsiya qilingan package manifest nusxalarida): ikkisi ham **ENOTCACHED**; network orqali install qilinmadi.
- Frontend `npm run build`: **BLOCKED**, `vite: not found`.
- Dependency preflight: backend 0/7, frontend 0/17 declared direct paket installed, lockfile consistency issues 0.
- **Haqiqiy PostgreSQL**, DB concurrency, browser/mobile E2E, Telegram E2E, deploy: **NOT_RUN** (postgres/psql yo'q).
- 185 CSV hash va 45 forward + 2 rollback SQL original bytes: arxiv chiqarilishida alohida byte-to-byte audit qilinadi; asl qaror statuslari o'zgarmaydi.

## Eslatma

Bu v114 tarixiy kodining aynan nusxasi emas, v113 asosida tiklangan keyingi lineage. V120 unit-testlar ma'lum kod yo'llarini tekshiradi; real HTTP server, production bazasi va live booking monitoringini tasdiqlamaydi. **Production-ready: YO'Q.**

## v121 uchun navbat

Network mavjud muhitda `npm ci`, Vite build va izolatsiyalangan `ustara_test_db` da GET slot → POST booking → lost COMMIT/HTTP → GET recovery ni sinash. So'ng #3 Instagram profil, #16 qidiruv va #164 tuman/manzil ko'rinishlarining haqiqiy brauzer tekshiruviga qaytish. Production DB ga test yubormang.
