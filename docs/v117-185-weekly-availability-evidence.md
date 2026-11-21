# USTARA v117 — #92 Smart Availability (7 kun) va #16/#164 search contract

**Manba:** v116-185 public-profile ZIP, 1031 fayl; manba SHA-256 `c84bf4be49bcec272f519083fc40de8fe1c42907411159622aff186fd1f9f0d1`.

## 7 texnik ish

1. 185-qaror CSV va oldingi ZIP tarixiy yaxlitligi tekshirildi; original qarorlar va SQL migratsiyalariga tegilmadi.
2. `InlineBooking`da xizmat tanlagandan keyin 7 kunlik har bir kun uchun server tekshirgan natijani ko‘rsatadigan Smart Availability Explorer qo‘shildi (#92).
3. 14 kunlik mavjud bron oynasi ikkita 7 kunlik haftaga ajratildi, ayni sanani tanlab yakuniy kunlik booking interfeysiga o‘tish saqlandi.
4. GET so‘rovlari existing `/api/bookings/available-slots` orqali `barber_id`, ko‘p `service_ids` va har bir `date` bilan yuboriladi; 2 tadan ortiq parallel so‘rov yo‘q. Manba sanasi va free-slotlar mavjud adapterda tekshiriladi.
5. Xizmat/hafta o‘zgarsa eski so‘rovlar bekor qilinadi va kech javob UIga chiqmaydi. Bir kunning xatosi qolgan oltita kunni to‘xtatmaydi. `Yangilash` qayta tekshiradi.
6. Mobil/klaviatura UX: 44px tugmalar, `aria-pressed`, yuklanmoqda/xato/dam olish/qabul qilinmaydi/bo‘sh vaqt yo‘q/tasdiqlangan vaqtlar holati, server tasdig‘i haqida aniq ogohlantirish. Haqiqiy brauzer screenshot mavjud emas.
7. #16 Smart Search va #164 manzil/tuman uchun API -> katalog -> bir nechta qidiruv/filtr kesishmasi, manzili yo‘qligida taxmin qilmaslik regressiya testlari; butun frontend test/audit.

## Xavfsizlik va cheklovlar

- Haftalik ko‘rinish **hech narsani band qilmaydi** va tezkor kunlik bron tasdig‘ining o‘rnini bosmaydi. Server tasdiqlamagan bo‘sh vaqt, foydalanuvchi identifikatori yoki band jadval ko‘rsatilmaydi.
- Haftalik natija tez eskirishi mumkin; tanlangan kunning mavjud slot/narxi alohida qayta olinadi. Bron tasdiqlanishi backend tranzaksiyasiga bog‘liq.
- 7 kunlik ro‘yxat mijoz profili ichida joylashgan; butun katalog bo‘yicha real vaqtli multi-barber availability qidiruvi **bajarilmadi**.
- #92, #16, #164 **QISMAN**: PostgreSQL real server, mobil browser, Vite build, Telegram E2E bilan isbotlanmagan. Asl 185 CSV statuslari o‘zgartirilmadi.

## Haqiqiy testlar

- `node --test frontend/test/v117WeeklyAvailability.test.js frontend/test/v117ExploreSearchContract.test.js`: **12 PASS**, 0 FAIL, 0 SKIP.
- `npm test` frontend: **939 PASS**, 0 FAIL, 0 SKIP.
- TypeScript JSX syntax parser: `InlineBooking.jsx`, `BarberPublicProfile.jsx`: **2/2 PASS**.
- `node scripts/v67-decision-audit.cjs`: original 185 qaror SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` PASS.
- `node scripts/v67-migration-audit.cjs`: 45 forward + 2 rollback SQL offline PASS.
- `npm run build` frontend: **BLOCKED / vite: not found**; `npm ci` amalga oshirilmagan.
- Backend `npm test` birinchi urinish: 1326 PASS / 27 FAIL. 26 modul yo‘qligi; 1 eski checkpoint nomini o‘qish testidagi xato. Yangi `docs/USTARA_LATEST_CHECKPOINT.md`da checkpoint v117 nomi o‘rnatilib, o‘sha test qayta tekshiriladi. Backend kodiga tegilmadi.
- Haqiqiy PostgreSQL, Chrome UI E2E va Telegram E2E **NOT_RUN**. **Production-ready: YO‘Q**.
