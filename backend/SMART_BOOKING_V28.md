# USTARA v28 — QR Smart Booking ko‘p xizmatli tasdiqlash

> **Production-ready emas.** v27 kod bazasidan davom etildi. 5 daqiqa taklif, 2 daqiqa booking tasdiq oynasi va QR + customer JWT talablarining o‘zi saqlangan. Hech qanday real DB migration yoki live Telegram jo‘natish qilinmagan.

## 1. O‘zgartirishlar

- `POST /api/queue/offers/:id/services`: taklif egasi QR token va request receipt bilan davomiyligi mavjud openingdan katta bo‘lmagan **faol** xizmatlarni oladi (`LIMIT 100`); `duration_minutes` va `max_services:20` qaytariladi. Yangi UI `multi_service:true` yuboradi; eski v27 mijozlari `multi_service` yubormasa faqat durationga aynan teng xizmatlarni ko‘radi.
- `POST /api/queue/offers/:id/confirm-booking`: v28 `service_ids:[id1,id2,...]` (1–20 ta, noyob, musbat integer), `expected_total_price` va v27 QR + customer JWT. v27 `service_id` formati eski mijozlar uchun saqlangan. Ikkalasini birga yuborish 400.
- `services/bookingSelection.selectedServices()` xizmatlarni `FOR SHARE` qayta o‘qiydi; yig‘indi davomiylik **slotga aynan teng** va kutilgan jami narx bilan bir xil bo‘lishi shart. Slot/calendar/customer overlap va PostgreSQL exclusion yana tekshiriladi.
- Bitta `bookings` qatori va tanlangan tartibda har xizmatga `booking_services` snapshot (nom, narx, davomiylik) **bitta transaction**da saqlanadi. Idempotent replay mavjud booking IDga qaytadi. Agar istalgan yozuv fail bo‘lsa, transaction rollback.
- QR sahifasida bir nechta checkbox, yig‘indi daqiqa/narx va qolgan vaqt ko‘rinadi. Narx/katalog o‘zgargan bo‘lsa eskirgan quote tozalanadi va qayta olinadi.
- **SQL migratsiya YO‘Q**: ko‘p xizmat jadvali v11 dagi `booking_services` bilan mavjud; v28 da umumiy migration soni 38.

## 2. Test (mahalliy, ma’lumotlarni o‘zgartirmaydi)

```bash
cd backend
node --test test/smartBookingConfirmation.unit.test.js test/smartBookingOffers.unit.test.js test/smartBookingTelegram.unit.test.js test/queueOfferConsent.unit.test.js test/queueTelegramNotifications.unit.test.js test/bookingPriceSnapshot.unit.test.js test/audit-phase1.unit.test.js
cd ../frontend
node --test test/*.test.js
```

- v28: tanlangan backend **47/47 PASS**, frontend **155/155 PASS**, TypeScript JSX syntax parser **0 error**.
- To‘liq backend CLI unit yugurtirilganida **230 PASS, 26 FAIL**, 26 failure `node_modules` yo‘qligi (`pg`, `express`, `bcrypt`, `jsonwebtoken`) sabab; bu testlarni PASS deb yozmang.
- Real PostgreSQL, API browser/mobile, Telegram webhook/polling E2E va Vite build/lint **bajarilmagan**.

## 3. Faqat operator roziligi bilan local staging DB audit

Stagingda barcha 38 migratsiya qo‘llangan bo‘lishi kerak. **Faqat** local `ustara_test_db` va `ustara_account_test` huquqsiz DB user qo‘llanadi. Test read-only va test connection identity/constraint/consent/trigger katalogini tekshiradi. Bu race E2E emas. *Token yoki haqiqiy production DB connection ishlatmang.*

```bash
cd backend
NODE_ENV=test \
 USTARA_SMART_BOOKING_DB_AUDIT=I_AUTHORIZE_READ_ONLY_TEST \
 USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:<test-password>@127.0.0.1:5432/ustara_test_db' \
 npm run test:smart-booking:db
```

`USTARA_TEST_DATABASE_URL` berilmaganida integration test `SKIP`. O‘rnatilgan `pg` bo‘lishi kerak. Bu terminaldagi sample URLni ishlab chiqarish kaliti bilan to‘ldirmang.

## 4. Hali talab qilinadigan sinovlar

1. Staging Postgres migratsiya/permissions va real ikki connection bilan booking overlap/race, expiry/opt-out/account deletion.
2. Telegram callback, polling/webhook, failed/uncertain delivery va mobil QR E2E.
3. Manual walk-in uchun alohida tasdiqlangan mijoz identifikatsiyasi va ixtiyoriy notification roziligi; QR bo‘lmagan mehmonni anonim Telegram chatga bog‘lamang.
4. `LIMIT 100` katalog UI tanlovini cheklashi mumkin; ko‘p katalogli sartaroshlar uchun pagination/matching keyin qo‘shiladi.
5. Service snapshot v28 oldingi v27 kabi transaction ichida, lekin production ga chiqishdan oldin real Postgres sinovlari majburiy.
