# USTARA v45 — 5 ta ish

| № | Vazifa | Amaliy o'zgarish | Test/dalil |
|---|---|---|---|
| 1 | Staging TAP tekshiruvi | TAP sarlavhasi, `not ok`, `Bail out!` ham qat'iy tekshiriladi | `v45Integrity.unit.test.js`, v41/v43 fixture updates |
| 2 | Telegram operator aggregati | Mantiqan noto'g'ri `due/overdue/stale_lease` rad qilinadi, shaxsiy data yo'q | `v45Integrity.unit.test.js` |
| 3 | Smart Booking mobil sahifasi | Muddati o'tgan taklif uchun qabul/tasdiq yo'q, no-request on expired | `offerActionStateV45.test.js` |
| 4 | npm readiness | Paket papkasidan tashqariga resolve qiladigan entry rad | `v45Integrity.unit.test.js`, oldingi v44 testlar |
| 5 | 185 qaror yaxlitligi | CSV struktura + SHA-256 majburiy tekshiruv | `npm run v45:decisions`, v45Integrity.unit.test.js |

**Natijalar:** backend tanlangan 21/21; frontend tanlangan 9/9, full 175/175. Backend full 357 PASS / 26 missing dependency FAIL. Production build, real PostgreSQL, Telegram API va browser E2E NOT_RUN. 185 qaror ro'yxati barcha funksiyalar ishlashini bildirmaydi.
