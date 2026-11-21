# USTARA v38 — 10 ta yaxshilanish, Smart Booking yakunlanishi va QA

**Asos:** v37 (605 fayl). Bu versiya qo‘shimchalarini v37 kodiga qo‘shing, oldingi migratsiyalarni qayta ishlamang.
**Production-ready emas.** Real PostgreSQL, Telegram va mobil E2E bajarilmaguncha production deploy qilmang.

## v38 — bajarilgan 10 aniq ish

1. `smartBookingConfirmation.confirm`: `walkin_queue_events` yozuvida `actor_source='customer'` (v37 41-migratsiya auditoriyasi bilan mos), eski `staff` defaultiga suyanmaydi.
2. Bron tasdiqlanganda `walkin_queue_notification_outbox`dagi `pending/processing` xabarlar `cancelled` bo‘ladi va lease tozalanadi. Bu networkdagi allaqachon boshlangan xabarni qaytarish kafolati emas.
3. Shu tranzaksiyada hozirgi offer uchun pending `smart_booking_telegram_outbox` bekor qilinadi.
4. Tasdiqlangan bron bilan tugagan navbatning `walkin_queue_telegram_subscriptions` bog‘lanishi uziladi.
5. Hali ishlatilmagan `walkin_queue_telegram_invites` ham o‘chiriladi. Hech qaysi haqiqiy booking o‘chirilmaydi.
6. `smartBookingTelegram` hatto inject qilingan Telegram API klient javobini `message_id` va aynan to‘g‘ri `chat.id` bilan tekshiradi. Soxta/malformed javob `sent`ga ACK qilinmaydi, noaniq statusga o‘tadi.
7. `pending` va `attempts>=5` bo‘lgan Telegram xabarlar `failed`ga o‘tkazilib, yashirin abadiy pending holati tugatiladi; avtomatik qayta yuborish yo‘q.
8. `ManualQueue.jsx`: mijoz sessiyasi almashganda/chiqqanda shaxsiy navbat, tanlov, xatolik va kodlar tozalanadi; eski token bilan kech kelgan javob yangi akkaunt ma’lumotini almashtira olmaydi. Mijoz login qilmaganida login havolasi va disabled submit chiqadi.
9. `ManualQueue.jsx`: xizmatlar katalogining bir xil offer bo‘yicha takroriy API chaqiruvlari oldi olinadi, xato bo‘lsa cheksiz so‘rov o‘rniga **Qayta yuklash** tugmasi chiqadi.
10. `manualQueueModel.js`: bitta taklifga ko‘pi bilan 20 xizmat belgilash (UI limit), invalid/muddati tugagan countdown `0` ko‘rsatadi va ortiqcha tanlashni bloklaydi. Serverdagi narx/muddat tekshiruvlari avvalgidek majburiy.

## Sinovlar va aniq cheklovlar
- `cd backend && npm run test:smart-booking:v38` — eski v37 + v38 tanlangan testlar.
- `cd backend && npm run test:unit` — barcha backend unit; bu muhitda `303 PASS / 26 MODULE_NOT_FOUND` (npm dependencies install bo‘lmagan).
- `cd frontend && npm run test:unit` — `162/162 PASS`. `manualQueueModelV38.test.js` yangi UI helpers va statik himoyani tekshiradi.
- `npm run audit:phase1` va `npm run audit:decisions` — **185 qaror / 41 migratsiya**, tuzilma tekshiruvi; real feature E2E emas.
- `npm ping`: registry.npmjs.org DNS `EAI_AGAIN`. `vite` va `eslint` yo‘qligi sabab build/lint NOT RUN. Real lokal PostgreSQL serveri yo‘q, staging runner (`npm run test:smart-booking:v37:db`) bajarilmadi.
- Testlar oddiy mock/query order unit dalili. Xususan bir vaqtning o‘zida `confirm` va `opt-out`, DB lock, Telegram send/ACK race, haqiqiy SQL syntax real PostgreSQL’da hali tasdiqlanmagan.

## Keyingi bosqich
- Internet bor muhitda `backend/npm ci` va `frontend/npm ci`; to‘liq unit, frontend build/lint.
- Productiondan ajratilgan **lokal** `ustara_test_db`/`ustara_account_test` rolida v37 staging runner, yangi v38 booking cleanup SQL uchun haqiqiy transactional test.
- Haqiqiy Telegram bot va ikkita telefon brauzerida E2E; opt-out/sending race, oldingi xabar, xizmat narxi o‘zgarishi, offline/retry, accessibility.
- #175 shop deletion haqida foydalanuvchi qarori olinmaguncha destructive shop deletion yozilmadi.

**Maxfiy `.env`, API token, parol, `node_modules` va `dist` arxivga kiritilmasin.**
