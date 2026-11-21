# Takroriy signup tuzatishi

## Sabab va yechim

Backend `registrationService.start()` faol `pending_registrations` yozuvini topsa `409 registration_exists` qaytarardi. Frontend foydalanuvchini eski oyna yoki sessiya muddati tugashiga yo‘naltirardi.

Endi Telegram signup `start` telefon bo‘yicha `registration_phone_limits` va pending yozuvni lock qiladi. Bitta transaction ichida avvalgi OTP tarixi `registration_restarted` sababi bilan bekor qilinadi, oldingi pending yozuv va unga FK orqali bog‘langan Telegram so‘rovi almashtiriladi, yangi id va sessionToken yaratiladi. Eski token bilan status/verify/resend/complete bajarilmaydi. Almashtirishdagi storage xatosi butun transactionni qaytaradi; avvalgi sessiya chala bekor bo‘lib qolmaydi.

Yangi parol, rol va mutaxassislik faqat yangi so‘rovda saqlanadi. Oldingi `phone_verified_at` va completion muddati ko‘chirilmaydi. Boshqa qurilmadan telefon raqamini bilib so‘rov yuborish eski sessiya yoki tasdiqni bermaydi: yangi kodni telefon egasining Telegram kontaktiga yetkazib, qayta tasdiqlash shart.

Telefonning OTP urinishlari, yuborish soni, cooldown va admin bloklari saqlanadi. Telegramga kod yuborilmaydigan `start` bosqichi cooldown tufayli bloklanmaydi; kodni haqiqatda yuborishdagi 3 daqiqalik interval saqlanadi. Yangi sahifa zarur bo‘lsa shu intervalning qolgan vaqtini ko‘rsatadi. Eski 30 daqiqalik sessiya yoki 15 daqiqalik completion muddatini kutish talab qilinmaydi.

Parallel startlar ketma-ket commit qilinadi; faqat oxirgi commit qilingan sessiya ishlaydi. Complete oldin accountni yaratib ulgurgan bo‘lsa, keyingi start `phone_exists` qaytaradi. Mavjud accountni almashtirish yoki ma’lumotlarini o‘chirish yo‘li qo‘shilmadi.

## Tekshirilgan va o‘zgargan fayllar

Tekshirildi: registration start/verify/resend/complete, Telegram request generation va yetkazish, telefon limitlari, pending/FK cheklovlari, signup formasi va browser storage, eski so‘rovlar javoblarini qayta ishlash.

O‘zgardi:

- `backend/services/registrationService.js`
- `frontend/src/pages/auth/components/RegistrationForm.jsx`
- `frontend/src/pages/auth/utils/registration.js`
- `frontend/src/pages/auth/Otp.jsx`
- `backend/test/registration.unit.test.js`
- `backend/test/telegramRegistration.unit.test.js`
- `backend/test/telegram-auth.postgres.integration.test.js`
- `backend/test/registration-restart.postgres.integration.test.js` — yangi.
- `frontend/test/registration.test.js`
- `TELEGRAM_OTP_REVIEW.md` — avvalgi faol sessiya siyosati haqidagi matn yangilandi.
- `SIGNUP_RESTART_REVIEW.md` — ushbu hisobot.

Yangi schema yoki migration kerak emas: mavjud telefon uniqueness, FK cascade va transaction locklar yetarli. Avvalgi Telegram migrationlariga qo‘yilgan talablar o‘zgarmadi.

## Haqiqatan bajarilgan testlar

- Backend unit: `registration.unit.test.js` va `telegramRegistration.unit.test.js` o‘tdi. Yangi holatlar: faol va tasdiqlangan tugallanmagan sessiyani almashtirish, eski token/generationni bekor qilish, cooldown va urinishlar saqlanishi, rollback.
- Frontend unit: `registration.test.js` o‘tdi. Yangi token storagega yozilishi, eski token qayta ishlatilmasligi, restart/cooldown holati, eski in-flight statusning 401 javobi yangi sessiyani tozalamasligi tekshirildi.
- Haqiqiy Express HTTP + alohida PostgreSQL: yangi restart integration testidagi 7 ssenariy o‘tdi (TAP ota test bilan 8/8). Boshqa qurilma, kod yuborilgandan keyingi restart, tasdiqlangan sessiya, 6 parallel start, verify/complete bilan parallel restart, storage rollback, urinish/yuborish limitlari tekshirildi.
- Avvalgi Telegram auth PostgreSQL integration: 12 ssenariy o‘tdi (TAP ota test bilan 13/13); OTP, reset va webhook regressiyasi aniqlanmadi.
- Chrome E2E: customer 390 px va barber 1440 px. Haqiqiy frontend + Express + PostgreSQLda bir raqam bilan signupni takrorlash, yangi sessiya/banner, eski tokenning 401 javobi, yangi OTP bilan tasdiqlash va account yaratish o‘tdi.
- Frontend `npm run lint` va yakuniy production build o‘tdi. Backend service va yangi integration testi ESLint recommended/Node bilan tekshirildi; mavjud xavfsizlik regexpining control character tekshiruviga tegishli `no-control-regex` qoidasi bu qo‘shimcha lint chaqirig‘ida o‘chirildi. Regexp yoki input xavfsizligi o‘zgartirilmadi. `node --check` ham o‘tdi.

PostgreSQL testi oldin ruxsat berilgan `/tmp/ustara-phone-otp-mxUgDo/data`, 55449 portdagi alohida klasterda bajarildi. Haqiqiy loyiha bazasiga ulanilmadi va migration bajarilmadi. Telegram transporti taqlid qilindi; jonli Telegram tekshiruvi bajarilmadi. Productionga deploy yoki ishlayotgan loyiha serverlarini qayta ishga tushirish bajarilmadi.

Test yozuvlari tozalangani tekshirildi: users, bookings, pending va contacts soni 0. Vaqtinchalik PostgreSQL serveri to‘xtatildi.

## Qayta bajarish

Repository ildizidan:

```sh
node --test backend/test/registration.unit.test.js backend/test/telegramRegistration.unit.test.js frontend/test/registration.test.js
NODE_ENV=test USTARA_TELEGRAM_AUTH_TESTS=I_AUTHORIZE_TEST_DATA USTARA_TEST_DATABASE_URL="$APPROVED_TEST_DATABASE_URL" node --test backend/test/registration-restart.postgres.integration.test.js backend/test/telegram-auth.postgres.integration.test.js
```

Integration buyrug‘i faqat oldindan tayyorlangan, yozish/tozalash uchun ruxsat berilgan local `ustara_test_db` va non-superuser `ustara_account_test` bilan ishlatiladi.

Frontend papkasida:

```sh
npm run lint
node --input-type=module -e 'import("vite").then(({build})=>build({envDir:false}))'
```

Brauzer test yordamchisi: `/tmp/ustara-phone-otp-mxUgDo/browser-restart-e2e.cjs`. U faqat ushbu vaqtinchalik klaster/portlar bilan ishlaydi va productionga qo‘shilmaydi.
