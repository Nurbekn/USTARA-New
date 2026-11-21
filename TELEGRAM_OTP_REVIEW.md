# Telegram OTP va signup bo‘yicha hisobot

## Tekshirilgan qismlar va qarorlar

`services/telegramRegistration.js`, `registrationService.js`, `telegramOtp.js`, `otpDelivery.js`, `passwordResetService.js`, `telegramLinkService.js`, `telegramBookingNotifications.js`, Telegram worker/webhook/handler va booking callbacklari, auth route/controllerlari, migration ketma-ketligi, signup/OTP/profilni yakunlash sahifalari tekshirildi.

- Oddiy signup endi foydalanuvchiga xos `reg_` havola chiqarmaydi. Bot URL konfiguratsiyadagi umumiy username orqali tuziladi; ishlatish uchun `TELEGRAM_BOT_USERNAME=ustara_booking_bot` va aynan shu botning tokeni kerak. Jonli konfiguratsiya tekshirilmadi.
- Sayt so‘rov yaratadi. Bot private chatda `contact.user_id === from.id === chat.id` bo‘lgan, forward qilinmagan shaxsiy kontaktni qabul qiladi. Telefon normallashtirilib faol so‘rov topiladi. So‘rovsiz kontakt saqlanmaydi va kod yuborilmaydi.
- `token_hash` ustuni ichki tasodifiy generation identifikatori sifatida saqlandi; u URL yoki API javobiga chiqmaydi. Resend va kontaktning parallel kelishida eski generation kod yubora olmaydi.
- Bir telefon uchun bitta pending yozuv va telefon bo‘yicha transaction lock saqlandi. Keyingi signup restart tuzatishida faol so‘rovni ham yangi start orqali atomik almashtirish joriy qilindi. Eski token, OTP va completion tasdig‘i bekor qilinadi; yangi sessiya yangi OTPsiz account yarata olmaydi. Urinishlar va yuborish limitlari saqlanadi. Tafsilotlar: `SIGNUP_RESTART_REVIEW.md`.
- OTP 5 xonali, yetkazilgandan keyin 1 daqiqa amal qiladi. Mavjud 5 urinish, yuborish limiti, cooldown, admin bloklari va HMAC himoyasi saqlandi. SMSga fallback yo‘q.
- `reg_` bilan eski `/start` buyruqlari kontakt tugmasini ko‘rsatadi; sayt sessiyasini chatga claim qilmaydi. Brauzerdagi eski pending havola umumiy URLga aylantiriladi. Zarur bo‘lsa, OTP sahifasida so‘rovni yangilash eski chat bog‘lanishini tozalaydi.
- Signupdagi SMS bloki va takroriy reklama matnlari olib tashlandi. Tugma `Kod olish`. Kontakt ulashish ko‘rsatmasi OTP kutish bosqichida chiqadi; yetkazilgach kodning qolgan vaqti ko‘rinadi. Expired kod maydonlari bloklanadi.
- Brauzer sinovi topgan mavjud profil muammosi tuzatildi: API `first_name/last_name` maydonlari qabul qilinadi, hisob yaratilgach yana ism-familiya sahifasiga qaytish bartaraf etildi.
- Mavjud kodda bron bekor qilingandagi Telegram xabari ulanmagan edi. PUT status va legacy DELETE bekor qilish yo‘llariga commitdan keyingi bildirishnoma qo‘shildi. Yetkazish xatosi bekor qilishni qaytarmaydi. Bekor qilish xabarida qabul/rad tugmalari bo‘lmaydi.

## O‘zgargan fayllar

Backend:

- `backend/services/telegramRegistration.js`
- `backend/services/telegramOtp.js`
- `backend/services/telegramBookingNotifications.js`
- `backend/telegram/handler.js`
- `backend/controllers/bookingsController.js`

Database:

- `backend/database/migrations/20261122_telegram_phone_requests.sql` — yangi migration.
- `backend/database/bootstrap.sql`
- `backend/database/bootstrap/verify.sql`

Backend testlari:

- `backend/test/helpers/registrationPool.js`
- `backend/test/telegramRegistration.unit.test.js`
- `backend/test/telegramOtp.unit.test.js`
- `backend/test/telegramAuthHardening.unit.test.js`
- `backend/test/telegramWebhookTransaction.unit.test.js`
- `backend/test/bookings.unit.test.js`
- `backend/test/bootstrap-plan.unit.test.js`
- `backend/test/telegram-auth.postgres.integration.test.js`
- `backend/test/telegram-bookings.postgres.integration.test.js` — yangi test.

Frontend:

- `frontend/src/pages/auth/components/RegistrationForm.jsx`
- `frontend/src/pages/auth/components/TelegramOtpNotice.jsx`
- `frontend/src/pages/auth/Otp.jsx`
- `frontend/src/pages/auth/auth-ui.css`
- `frontend/src/pages/auth/utils/registration.js`
- `frontend/src/pages/auth/profileCompletion.js`
- `frontend/test/registration.test.js`
- `frontend/test/profileCompletion.test.js` — yangi test.

Hisobot: `TELEGRAM_OTP_REVIEW.md`.

## Migration va joriy qilish

Yangi migration faqat `telegram_registration_chat_idx` unique indexini oddiy indexga almashtiradi va migration markerini yozadi. Telefon bo‘yicha pending uniqueness va Telegram kontakt/account uniqueness cheklovlari saqlanadi. Foydalanuvchi yoki bron ma’lumoti o‘chirilmaydi. Tarixiy migration fayllari o‘zgartirilmadi.

Old shart: `20261121_telegram_auth_hardening` va uning avvalgi migrationlari qo‘llangan bo‘lishi kerak. Eski API/worker yozuvchilarini to‘xtatib, migrationni qo‘llash, keyin yangi API va bitta tanlangan Telegram update rejimini ishga tushirish kerak. Tarixiy `20261120` migrationni yangi index ustida qayta ishlatmang: uning eski schema tekshiruvi unique indexni kutadi.

Migration faqat foydalanuvchi ruxsat bergan `/tmp/ustara-phone-otp-mxUgDo/data` alohida PostgreSQL klasterida bajarildi. Haqiqiy loyiha bazasiga ulanish, upgrade yoki deploy bajarilmadi. Haqiqiy bazada bajarish alohida ruxsat talab qiladi.

Quyidagi buyruq faqat operator tasdiqlagan ulanish bilan, alohida ruxsatdan keyin bajariladi:

```sh
psql -X "$APPROVED_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/migrations/20261122_telegram_phone_requests.sql
```

Yangi, bo‘sh baza uchun `backend/database/bootstrap.sql` yangi migrationni ham qamrab oladi; mavjud bazada bootstrapni ishlatmang.

## Bajarilgan tekshiruvlar

- Backend: 12 ta tegishli unit test fayli o‘tdi — registration, Telegram registration/OTP, password reset, Telegram linking/worker, bookings, auth hardening/policy, delivery response, webhook lifecycle/transaction, bootstrap plan.
- Frontend: registration, passwordReset, telegramLink va profileCompletion unit test fayllari o‘tdi.
- Alohida haqiqiy PostgreSQL 18.6: bootstrap va yangi migration o‘tdi.
- Telegram auth PostgreSQL integration: 12 ta ssenariy o‘tdi (TAP: 13/13, ota test bilan). Parallel kontakt, provider xatosidagi rollback, noto‘g‘ri kontakt/kod, account yaratish, account FK bog‘lanishi, reset, expired so‘rov/kod, resend, eski generation, eski chat sababli 23505 regressiyasi, umumiy rate limit va webhook receipt/retry tekshirildi.
- Telegram bookings PostgreSQL integration: 3 ta ssenariy o‘tdi (TAP: 4/4, ota test bilan). Profil bog‘lash/uzish, yangi bron xabari, qabul/rad, begona callback, parallel takroriy callback, PUT/DELETE bekor qilish, xabarnoma va transport xatosi tekshirildi.
- Chrome E2E: 390 px customer va 1440 px barber; haqiqiy frontend, Express registration controller/service va PostgreSQL bilan signup, umumiy bot URL, kontaktgacha bloklangan OTP, noto‘g‘ri kod, to‘g‘ri kod, profilni yakunlash va bazada account yaratilishi o‘tdi. Gorizontal overflow aniqlanmadi. CAPTCHA brauzerda chizilgan belgilar orqali to‘ldirildi.
- Frontend `npm run lint` o‘tdi. O‘zgargan 5 backend production fayli ESLint recommended/Node konfiguratsiyasi bilan o‘tdi. Loyihada alohida backend lint script yo‘q; qo‘shimcha konfiguratsiya test artefaktida saqlandi.
- Yakuniy frontend production build Vite API orqali `envDir:false` bilan o‘tdi. Backend o‘zgargan asosiy fayllarining `node --check` tekshiruvi ham o‘tdi.

Dastlabki yangi expiry testida timestamp fixture database CHECKga mos kelmagani tuzatildi va integration qayta o‘tdi. Eski matn/havola taxminlariga bog‘langan testlar yangi oqimga moslandi. Mavjud `local-booking.integration.test.js` vaqtinchalik klaster Debian `pg_lsclusters` registrida bo‘lmagani sabab setupda to‘xtadi; u muvaffaqiyatli deb hisoblanmadi. Shu sabab alohida, haqiqiy PostgreSQL bilan ishlaydigan `telegram-bookings.postgres.integration.test.js` qo‘shilib bajarildi.

Telegram transporti barcha avtomatik testlarda taqlid qilindi. Haqiqiy bot orqali kontakt ulashish, jonli OTP yetkazish, jonli bron callbacklari va jonli reset qo‘lda tekshirilmadi. Production ma’lumotlarida upgrade sinovi bajarilmadi. Tashqi Telegram yuborishini PostgreSQL rollback ortga qaytara olmaydi: webhook commitdan oldin uzilsa qayta yuborilgan kod kelishi mumkin, ammo faqat committed OTP tasdiqlanadi. Bildirishnomalar uchun durable outbox qo‘shilmadi.

## Test va ishga tushirish komandalari

Repository ildizidan:

```sh
node --test backend/test/registration.unit.test.js backend/test/telegramRegistration.unit.test.js backend/test/telegramOtp.unit.test.js backend/test/passwordReset.unit.test.js backend/test/telegram.unit.test.js backend/test/bookings.unit.test.js backend/test/telegramAuthHardening.unit.test.js backend/test/authPolicy.unit.test.js backend/test/telegramDeliveryResponse.unit.test.js backend/test/telegramWebhookLifecycle.unit.test.js backend/test/telegramWebhookTransaction.unit.test.js backend/test/bootstrap-plan.unit.test.js
node --test frontend/test/registration.test.js frontend/test/passwordReset.test.js frontend/test/telegramLink.test.js frontend/test/profileCompletion.test.js
node backend/scripts/bootstrap-plan.js
```

Faqat oldindan tayyorlangan va yozish/tozalash uchun ruxsat berilgan local test bazasida:

```sh
NODE_ENV=test USTARA_TELEGRAM_AUTH_TESTS=I_AUTHORIZE_TEST_DATA USTARA_TEST_DATABASE_URL="$APPROVED_TEST_DATABASE_URL" node --test backend/test/telegram-auth.postgres.integration.test.js backend/test/telegram-bookings.postgres.integration.test.js
```

`APPROVED_TEST_DATABASE_URL` faqat `ustara_test_db` nomli local test bazasi va `ustara_account_test` non-superuser roli bo‘lishi kerak.

`frontend` papkasida:

```sh
npm run lint
node --input-type=module -e 'import("vite").then(({build})=>build({envDir:false}))'
npm run dev
```

`backend` papkasida, migration va bot sozlamalari operator tomonidan tasdiqlangandan keyin:

```sh
npm start
npm run telegram:worker
```

Worker buyrug‘i polling rejimi uchun. Webhook rejimida alohida polling workerini ishga tushirmang.

Test yozuvlari tozalangani tekshirildi: `users`, `bookings`, `pending_registrations`, `telegram_otp_contacts` soni 0. Vaqtinchalik klaster testlardan keyin to‘xtatildi; dalil va skriptlar saqlandi.

Brauzer E2E skripti va screenshotlar: `/tmp/ustara-phone-otp-mxUgDo/`. Skript: `browser-e2e.cjs`. Bu faqat ushbu vaqtinchalik klaster/portlar bilan ishlaydigan lokal test yordamchisi; productionga qo‘shilmaydi.
