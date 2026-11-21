# USTARA v46 — aynan 5 ta bajarilgan ish

| № | Ish | Kod | Dalil / ehtiyot shart |
|---|---|---|---|
| 1 | Navbatdagi yozuvlar uchun akkaunt egasini tekshirish va lock tartibini tuzatish | `backend/controllers/walkinQueueController.js` | `barbers.user_id=$2`, `FOR SHARE OF b,u` *advisory lock*dan oldin; v46 unit |
| 2 | Sartaroshga tegishli navbatni ko'rishda ham ownership | `backend/controllers/walkinQueueController.js` | `GET /mine` owner query ID+user ID bilan; v46 unit |
| 3 | Chaqirilgan mijozning tugallanmagan takliflarini tozalash | `backend/services/queueOfferLifecycle.js`, `walkinQueueController.callNext` | `pending/accepted` va tasdiqlanmaganlar cancel, opening reopen, faqat pending offer outbox cancel; replay duplicate call yaratmaydi |
| 4 | Navbat yakunida Telegram va Smart Booking izlarini tozalash | `walkinQueueController.finish` | Queue outbox cancel, subscriptions va invites o'chiriladi; oldindan yaratilgan bronlar saqlanadi |
| 5 | SQL staging va avtomatik test | `v46QueueLifecycle.postgres.integration.test.js`, `v46-staging.js`, unit testlar | 40/40 selected unit PASS; real DB `SKIP`, staging 6 real testga yopiq guard |

**Cheklovlar:** real PostgreSQL integratsiyasi va Telegram/mobil E2E o'tmadi; production uchun ishga tushirmang. 185 qaror reyestri o'zgarmagan.
