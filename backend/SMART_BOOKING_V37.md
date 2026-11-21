# USTARA v37 — navbatdan ixtiyoriy chiqish, Telegram consent epoch, candidate filtering

**Holat:** development; real PostgreSQL/Telegram E2E va build/lint tasdiqlanmaguncha production-ready emas.

## API va semantika
- `POST /api/queue/qr-leave` — anonim, ammo **faqat tasdiqlangan QR ticketning token + 128-bit receipt** egasiga; IP rate limiter saqlanadi. Body: `{ "token": "<48-hex>", "request_id": "<32-hex>" }`. QR token va receipt SQLga raw yuborilmaydi, domain-separated SHA-256 tekshiriladi.
- `POST /api/queue/manual/:id/leave` — `auth` va faol **mijoz akkaunti**, aynan o‘z navbati uchun. Akkaunt va rozilik tranzaksiya ichida qulflanadi.
- **Faqat bugungi `waiting` yoki `called`** navbatni `left`ga o'tkazish mumkin. `left` qayta yuborilsa xabar takrorlanmaydi (`replayed: true`); `served/missed` va eski kun uchun tegishli xatolik qaytadi.
- Chiqishda hali tasdiqlanmagan `pending/accepted` takliflar bekor qilinadi, bo‘sh vaqt keyingi navbatga qaytariladi. **Haqiqiy booking hech qachon o‘chirilmaydi.** Qolgan queue notification outbox `pending/processing` bekor qilinadi va Telegram subscription/invite bog‘lanishlari uziladi. Tarmoqdagi allaqachon boshlangan xabarni qaytarib olish kafolatlanmaydi.
- `walkin_queue_events` auditi uchun **41-migratsiya** `20261212_queue_self_exit_audit.sql`: `actor_source` = `staff|customer|qr_guest`, QR uchun `actor_user_id=NULL` ruxsat. Boshqa `NULL` va noto‘g‘ri actor/action kombinatsiyalarini CHECK rad etadi. Eski eventlar `staff` bo‘lib qoladi. Migratsiyani productionga o‘zboshimchalik bilan qo‘llamang.

## Telegram va navbat
- `smartBookingTelegram`: jo‘natish `offers_consent_at <= t.created_at` bo‘lgandagina ruxsat; revoke va keyingi re-opt-in oldingi outboxni jonlantirmaydi. Callback ham eski xabar uchun `created_at` orqali tekshiriladi. Ixtiyoriy opt-in hech qachon majburiy bo‘lmaydi. Send paytidagi opt-out race uchun aniq `exactly-once` kafolat yo‘q.
- Smart Booking worker manual nomzodlar uchun `customers` va `users`dagi **faol customer akkauntini** ham tekshiradi. Bu selection-time filtr; haqiqiy `confirm` tranzaksiyasi yana session/account holatini tekshiradi.

## Offline sinovlar (shu arxivda)
```sh
cd backend
npm run test:smart-booking:v37
npm run audit:phase1
npm run audit:decisions
# Barcha testlar faqat to‘liq dependencies o‘rnatilgach:
npm ci
npm run test:unit
cd ../frontend
npm ci
npm run test:unit
npm run build
npm run lint
```

## Real PostgreSQL staging — faqat mahalliy va ruxsat bilan
1. PostgreSQL serverni **lokal** ko‘taring, `ustara_test_db` bazasi va **superuser bo‘lmagan** `ustara_account_test` rolini tayyorlang. SQLni production yoki boshqa bazaga ishlatmang.
2. Credentialsni faqat terminaldagi xavfsiz env orqali `USTARA_TEST_DATABASE_URL`ga bering. `.env` yoki ZIP ichiga kiritmang.
3. Test DBga tasdiqlangan **41 ta forward migration**ni reviewdan keyin tatbiq eting. Runner migratsiyalarni o‘zi productionga qo‘llamaydi.
4. Quyidagi buyruq test URL, rol, host, DB nomi va superuser emasligini tekshiradi; real baza bo‘lmasa ishga tushmaydi:
```sh
NODE_ENV=test USTARA_V37_STAGING=I_AUTHORIZE_LOCAL_STAGING npm run test:smart-booking:v37:db
```
5. Runner v28/v29/v30/v35 testlaridan keyin `queueSelfExitV37.postgres.integration.test.js`ni ham ishga tushiradi. So‘ng test uchun yaratilgan, current userga tegishli **ephemeral** schema cleanup qilinadi. Bu test v37 audit migratsiyasini minimal izolyatsiyalangan jadvalda tekshiradi; butun ilova uchun to‘liq E2E o‘rnini bosmaydi.

## Hali ochiq
- Npm paketlari tarmoqdan o‘rnatilmagan (oldingi 26 ta backend test `MODULE_NOT_FOUND` bilan o‘tmaydi), Vite/ESLint build sinovi bajarilmagan.
- Real PostgreSQL + Telegram callback/worker, opt-out race, QR/manual mobil brauzer E2E va accessibility sinovlari kerak.
- 185 kelishuvdan #128 **qisman** deb belgilandi, qolgan ochiq qarorlar avtomatik bajarildi deb yozilmadi. #175 shop deletion o‘zgartirilmadi.
