# USTARA v23 — FIFO override va Admin QR muddatini boshqarish

**Holat:** kod/unit/build PASS, **PostgreSQL va haqiqiy brauzer E2E hali sinalmagan**. v21+v22 migratsiyalardan so'ng `20261206_queue_order_qr_settings.sql` ni faqat ko'rib chiqilgan va zaxiralangan DB uchun qo'llash mumkin. Ishlayotgan production bazada integratsion testni bajarmang.

## Walk-in navbat tartibi (#31–#33)

- Sartarosh `Navbat` oynasida kutayotgan mijozni `↑`/`↓` tugmasi bilan bir pog'ona suradi. 10–200 belgili sabab majburiy. Chaqirilgan/yakunlangan yoki boshqa sanaga tegishli mijozlarni joyidan surib bo'lmaydi.
- `PATCH /api/queue/:id/reorder` faqat sartarosh JWT orqali, body: `{ "direction":"up", "reason":"Mijozning asosli iltimosi", "expected_order":[11,12,13] }`.
- Barcha ma'lumotlar bitta SQL transaction ichida, barcha booking/calendar/QR oqimlari bilan umumiy barber advisory lock ostida o'qiladi. Brauzerda ko'rilgan navbat eskirgan bo'lsa `409 queue_changed`. Sabab + eski/yangi o'rin `walkin_queue_reorder_events`ga yoziladi; DB xatosi => `ROLLBACK`.
- Eski queue yozuvlarining `queue_position=NULL` bo'lishi **oldingi FIFO (id)** tartibini saqlaydi. Yangi mijozlar o'zgartirilgan qatorning oxiriga qo'shiladi. `callNext` endi `queue_position ASC NULLS LAST, id` tartibiga amal qiladi. Yangi joylashtirish bronni band qilmaydi.

## QR muddati (Admin maxsus talabi)

- Admin boshqaruv paneli → **QR va navbat**: QR amal qilish muddatini **1 dan 120 daqiqagacha** belgilaydi. **10 daqiqa** boshlang'ich qiymat. Faqat yangi yaratiladigan QRga tatbiq etiladi, avvalgi tokenlarning `expires_at` maydoni **o'zgarmaydi**.
- `GET /api/admin/queue/qr-settings`, `PUT /api/admin/queue/qr-settings` (`{"ttl_minutes":25}`): Admin JWT va `adminOnly`, update `SELECT ... FOR UPDATE`, audit `walkin_qr_settings_events` (old/new/admin ID/vaqt), no-change audit qo'shmaydi.
- Barber `POST /api/queue/qr-tokens` vaqtida sozlama qatori `FOR SHARE` bilan transaction ichida o'qiladi. Bu parallel Admin tahrir bilan tartibli bo'lishni ta'minlaydi. QR javobida `ttl_minutes` va aniq `expires_at` bor. 192-bit maxfiy QR token, SHA-256 saqlash va 1 marta ishlatish v22 dagidek qoladi.
- TTL ning 1–120 daqiqa oraliq cheklovi DB `CHECK` va API/Frontend darajasida ham mavjud. `walkin_qr_settings.changed_by_user_id` / audit aktori `admin_accounts(id)`ga bog'langan (oddiy `users` emas).

## Test va chekli da'volar

- Backend 404/404 unit PASS (v22 bazasi 395), frontend 149/149 PASS, Vite build PASS, JSX ESLint PASS.
- `npm run test:queue:reorder:db`: test DB izolyatsiyalangan bo'lishi, `NODE_ENV=test`, `USTARA_QUEUE_REORDER_DB_TESTS=I_AUTHORIZE_TEST_DATA`, `USTARA_TEST_DATABASE_URL` va tekshirilgan maxsus `ustara_account_test` rolini talab qiladi. Oldindan v23 migratsiyasi qo'llangan bo'lishi shart. Hozir PostgreSQL server mavjud emas: bu test **SKIP**.
- Live ETA/real-time, Telegram chaqiruv, 5 daqiqalik bo'sh slot taklifi, shop-wide navbat, real browser E2E, multi-worker edge rate limit hali yo'q. Production-ready EMAS.
