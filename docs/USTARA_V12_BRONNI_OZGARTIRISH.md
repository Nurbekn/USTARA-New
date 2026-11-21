# USTARA v12 — Broni xavfsiz ko‘chirish va xizmatlarni tahrirlash

## Maqsad va holat

185 kelishuvdan #106 (bronni boshqa vaqtga xavfsiz ko‘chirish) va #162 (mijoz xizmatlarini o‘zgartirish) bo‘yicha **qisman implementatsiya**. 2-bosqich real DB testlari ham ochiq qoladi. Ushbu loyiha hali production-ready emas.

## Ishlaydigan qismlar

- Mijozning `Bronlarim > Tafsilotlar` sahifasidagi **Boshqa vaqtni tanlash** tugmasi sana bo‘yicha mavjud 5 daqiqalik bo‘sh slotlarni ko‘rsatadi. Tanlangan sana uchun oldingi bronning o‘zi band deb hisoblanmaydi. Boshqa mijozlar va shu mijozning boshqa sartaroshlardagi bronlari hisobga olinadi.
- `GET /api/bookings/:id/modify-slots?date=YYYY-MM-DD`: faqat bron egasiga o‘z bronini tahrirlash uchun read-only slot ro‘yxati. Bron davomiyligi tasdiqlangan snapshotdan olinadi. O‘zgartirishning o‘zi bo‘sh slotni rezerv qilmaydi.
- `PATCH /api/bookings/:id/modify`: faqat mijoz/bron egasi. JSON: `{ "expected_booking_time": "2030-02-01T10:00:00+05:00", "booking_time": "2030-02-01T11:00:00+05:00" }`.
- Ko‘chirish **bitta transaction**: customer row `FOR UPDATE` -> barber advisory lock -> booking `FOR UPDATE` -> barber ruxsati -> ish soati -> boshqa sartarosh/mijoz vaqt to‘qnashuvlari -> vaqt tekshiruvi -> UPDATE -> COMMIT. Faqat COMMIT bo‘lgach barberga Telegram xabari yuborishga urinish bo‘ladi.
- Muvaffaqiyatsiz ko‘chirishda (403/404/409/503, DB lock/constraint) **asl bronning vaqti, statusi, narxi va xizmatlari o‘zgarmaydi**. Tasdiqlangan narx va davomiylik shunchaki yangi vaqtga ko‘chirilganda qayta hisoblanmaydi.
- `expected_booking_time` bilan ikki qurilmadagi stale data aniqlanadi; bir xil yangi vaqtga tarmoq xatosidan keyingi qayta urinishda mavjud bron qaytariladi, yangi bron yaratilmaydi.
- Xizmatlarni almashtirish backend API’da ixtiyoriy `service_ids` bilan mavjud. Bunda `expected_total_price` **majburiy**; narx server tomonidan `services` ma’lumotlaridan qayta hisoblanadi va mos kelmasa `409 price_changed` bilan ROLLBACK. Yangi `booking_services` snapshotlari ham shu transaction ichida almashtiriladi. Eski katalog o‘zgargani uchungina tarixiy xizmat snapshotini o‘zgartirmaymiz.
- Bildirishnoma `rescheduled` statusida barberga yuboriladi. Agar Telegram xatosi bo‘lsa, DB’da commit bo‘lgan bron noto‘g‘ri `500` xato bilan bekor bo‘lgandek ko‘rsatilmaydi.

## Cheklovlar va keyingi ish

- Customer UI hozir **vaqtni ko‘chirishni** qo‘llaydi. Xizmatlar ro‘yxatini onlayn tanlab o‘zgartirish uchun pricing/confirmation UI #162 doirasida keyingi ish.
- Turli qurilmalardagi bir xil vaqtda update qilinishi haqiqiy PostgreSQL’da va browser E2E’da sinovdan **o‘tmagan**; #106/#162 hali **qisman**.
- Narxlar tarixini ko‘rish va bron o‘zgarishlarining alohida audit jadvali hali yo‘q. Real-time websocket, customer Telegram notification, delivery retry/outbox keyingi bosqichlar vazifasi.
- Haqiqiy test PostgreSQL’da 20261125–20261129 migratsiyalarni qo‘lda tekshirib qo‘llash zarur. Hech qanday production bazaga yozilmadi; yangi migratsiya kiritilmadi (jami **28**).
- Yangi endpointlarda status faqat `pending` yoki `confirmed` bo‘lgan, vaqti kelmagan mijoz bronlari tahrirlanadi. Mijoz faqat **o‘zi** uchun bron ko‘chiradi.

## Tekshiruv (2026-11-18)

- `cd frontend && node --test test/*.test.js`: **124/124 PASS**.
- `cd backend && node --test test/bookingModification.unit.test.js test/bookingRescheduleNotifications.unit.test.js test/bookingPriceSnapshot.unit.test.js test/bookingIdempotency.unit.test.js test/slotGrid.unit.test.js test/bookingNotificationAfterCommit.unit.test.js test/bookingSelection.unit.test.js test/audit-phase1.unit.test.js test/bootstrap-plan.unit.test.js`: **44/44 PASS**.
- `cd backend && node scripts/audit-phase1.js`: 185 ta qaror, 28 migratsiya ro‘yxati **PASS**.
- Backend yangi JavaScript `node --check` va `Bookings.jsx` TypeScript JSX syntax parser **PASS**.
- `npm ci`, to‘liq backend unit suite, Vite build, real PostgreSQL E2E va Telegram real API testi: **ushbu ish muhitida bajarilmadi**.
