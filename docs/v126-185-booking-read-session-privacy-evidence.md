# USTARA v126 — 185 qaror: bronni xavfsiz o‘qish (2026-11-20)

**Manba:** v125 `USTARA-v125-185-Booking-Contact-Navigation.zip`; oldingi arxivdan davom etildi. 185 asl qaror CSV va 47 SQL migratsiyaga o‘zgartirish kiritilmadi.

## Amalga oshirilgan 7 ish

1. **#159/#174:** mijozning GET `/api/bookings` javobi eski sessiyadan bo‘lsa ko‘rsatilmaydi; `session_changed` (409) qaytariladi.
2. **#159/#174:** GET `/api/bookings/:id` ham shu post-request sessiya tekshiruviga ega.
3. **#159/#52:** xizmat tanlashdagi GET `/api/services?barber_id=` tugagandan keyin sessiya qayta tasdiqlanadi.
4. **#42/#52:** xizmat qatorlari aynan tanlangan sartaroshga tegishli bo‘lishi, ID takrorlanmasligi, musbat/narxi to‘g‘ri va soni chegaralangan bo‘lishi talab etiladi; faol bo‘lmagan xizmatlar tanlovga kirmaydi.
5. **#159:** customer booking frontend modeli server qatoridan faqat kerakli ustunlarni oladi; noma’lum private `customer_phone`, `password_hash`, `internal_notes` va ixtiyoriy xizmat maydonlari UI state ga ko‘chmaydi. Xato service snapshot yoki xato umumiy narx rad etiladi.
6. **#159/#174:** backend customer/barber GET list/detail uchun JWT-derived `profileId` yaroqli musbat integer bo‘lmasa 403 beradi va SQL bajarilmaydi; adminning mavjud detail view huquqi saqlanadi.
7. **#159:** auth talab qiluvchi `/api/services` GET ro‘yxat javobiga, 400 va 500 javoblariga ham `Cache-Control: no-store` qo‘yiladi.

## Haqiqiy sinovlar

- Frontend `node --test test/*.test.js`: **1053 PASS / 0 FAIL / 0 SKIP**; yangi v126 faylida **10 PASS**.
- Backend `node --test test/*.unit.test.js`: **1350 PASS / 26 FAIL / 0 SKIP**; yangi v126 faylida **17 PASS**. 26 nosoz testning nomlari oldingi v125 bilan to‘liq bir xil (mavjud bo‘lmagan dependencies).
- `npm run build`: **FAIL**, `vite: not found` — frontend dependencies o‘rnatilmagan.
- Real PostgreSQL test DB, Chrome/mobile E2E, Telegram live/sandbox: **NOT_RUN**.
- Original 185-decision registry and all 47 migration SQL, bootstrap baseline: **byte-for-byte unchanged**; ZIP CRC va SHA-256 audit.
- **Production-ready: YO‘Q.** Unit-testlar bazadagi haqiqiy rollar va tranzaksiya race shartlarini tasdiqlamaydi.

## v127 uchun

1. Paketlarni ishonchli tarmoqda ikkala paket-lock bilan `npm ci` o‘rnatish va `vite build`ni yakunlash.
2. Izolyatsiyalangan `ustara_test_db` PostgreSQL da `bookings GET` owner-scope, join, contact va servislarni E2E tekshirish; faqat test rollaridan foydalanish.
3. Mijozning bron kartalari va xizmat tanlashning mobil brauzer testlari; akkaunt almashganda eski GET natijasi ko‘rinmasligini tekshirish.
4. 185 ro‘yxatidagi keyingi tekshiruv talab qiladigan qarorlarni real testlar bilan tanlab olish. Bajarilganlar sonini auditdan ortiqcha baholamaslik.
