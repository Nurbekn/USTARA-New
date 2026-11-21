# USTARA v187 — Admin suspend / restore (qaror #177)

## Natija

- Admin mijoz yoki sartarosh akkauntini maʼlumotlarini o‘chirmasdan vaqtincha to‘xtata oladi, so‘ng alohida amal bilan cheklovni olib tashlay oladi.
- `PATCH /api/admin/users/:role/:id/suspension` — faqat Admin, `action`, `expectedSuspended`, `reason` (5–300 belgi) talab qilinadi. Eski holat qayta yozilmaydi (`409`). Bajarilgan amal append-only audit jadvalida yoziladi.
- `users.admin_suspended_at` — mijozning o‘zi so‘ragan `deactivated_at` dan mustaqil. Admin cheklovini olib tashlash foydalanuvchi o‘zi bekor qilgan akkauntni avtomatik qayta ochmaydi.
- Suspend va restore paytida `account_session_versions` o‘sadi va `account_device_sessions`dagi faol sessiyalar bekor qilinadi; avvalgi JWTlar qayta kuchga kirmaydi.
- `getIdentity` va password-login yo‘li suspend holatini tekshiradi. Login paytida `FOR SHARE` user lock suspend tranzaksiyasi bilan serializatsiya qiladi. Parol to‘g‘ri bo‘lsa ham suspend holatida token berilmaydi.
- Admin suspend qilishdan oldin **o‘qish uchun** bron taʼsiri preview sini ko‘radi; mavjud pending/confirmed bronlar **saqlanadi**, avtomatik cancel, boshqa sartaroshga transfer yoki xabar yuborish yo‘q. Bron muammosini operatorlar alohida hal qilishi kerak.
- JSON javob `bookingsChanged:false`, `sessionsRevoked:true`; javob yo‘qolsa, qayta PATCH qilmasdan oldin ro‘yxat yangilanadi.
- Uch til (uz/ru/en), admin user ro‘yxatida suspend/deactivate holatlari alohida ko‘rsatiladi.

## Migratsiya

`backend/database/migrations/20261230_admin_account_suspensions.sql` — **59-forward** migratsiya, oldingi 58 ta forward hamda 2 ta rollback fayli o‘zgarmagan; haqiqiy bazaga qo‘llanmagan. Stagingdagi PostgreSQL `bootstrap.sql` zanjiri orqali migration → idempotency guards → auth → login va suspend/restore integratsion sinovlari kerak.

## QA (shu muhitdagi natija)

- `node --test frontend/test/*.test.js`: **1725/1725 PASS**.
- `node --test backend/test/*.unit.test.js`: **1731/1760 PASS**, **29 MODULE_NOT_FOUND** (`express`, `pg`, `bcrypt`, `jsonwebtoken`), yaʼni to‘liq backend PASS emas.
- v187 maqsadli testlar: **12/12 PASS**.
- Frontend import grafigi **PASS**.
- SQL migration offline audit: **59 forward + 2 rollback PASS**.
- Haqiqiy PostgreSQL, login/booking concurrency E2E, brauzer UI va production build: **NOT_RUN**.

## Ochiq ishlar

1. Suspend paytida foydalanuvchilarga va bron taraflariga xavfsiz xabar yuborish, kerak bo‘lsa operator boshqaradigan cancel/reschedule jarayoni.
2. Haqiqiy PostgreSQL tranzaksion raqobat testi: login bilan suspend, bir vaqtdagi ikki admin, amaldagi bronlar, workerlar.
3. `npm ci`dan keyin to‘liq backend va browser E2E/build.
4. Mavjud yakunlanmagan jamoa, review, Privacy Center va boshqa 185 qarordagi qisman funksiyalar.

**Muhim:** 185/185 — qarorlar reyestrini manba auditi qamrovi, loyiha production-ready degani emas. `LOYIHA TUGADI` deb belgilamang.
