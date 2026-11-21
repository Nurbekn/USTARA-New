# Telegram orqali USTARA tasdiqlash kodlari

Ro‘yxatdan o‘tish va parol tiklash kodlari Telegramga yuboriladi. Telefon/parol bilan login o‘zgarmaydi. Bitta telefon — bitta canonical `users` accounti qoidasi saqlanadi. Kontakt ulashish account yaratmaydi va OTP tekshiruvini almashtirmaydi.

## Foydalanuvchi oqimi

1. Saytdagi “Telegram botni ochish” tugmasini bosing.
2. Botda Start tugmasini bosing va “Telefon raqamimni ulashish” tugmasi orqali o‘z kontaktingizni yuboring.
3. Saytga qaytib, xuddi shu telefon raqami bilan kod so‘rang.
4. Botga kelgan 5 xonali kodni saytga kiriting. Kod 1 daqiqa amal qiladi.

Kontakt tasdig‘i 30 daqiqa davomida kod yuborishga yaroqli. Keyin botni qayta ochib kontaktni yana ulashish kerak. Bot xabarini forward qilish, boshqa odam kontaktini yuborish, username yoki qo‘lda yozilgan telefon tasdiqlash sifatida qabul qilinmaydi. Telegram `contact.user_id`, yuboruvchi va shaxsiy chat IDsi bir xil bo‘lishi shart. Kontaktlar bot IDsi bo‘yicha ajratiladi.

## Sozlash

BotFather orqali bot yarating. Tokenni chatga, Gitga yoki loglarga chiqarmang. Backend process muhiti yoki local `backend/.env` orqali quyidagilarni bering:

```env
OTP_DELIVERY_ADAPTER=telegram
TELEGRAM_BOT_TOKEN=<BotFather bergan token>
TELEGRAM_BOT_USERNAME=<boshida @ bo‘lmagan username>
```

`OTP_HMAC_KEY`, `JWT_SECRET` va mavjud baza sozlamalari kerak. Eskiz qiymatlari bu oqimda ishlatilmaydi. Eski `OTP_SMS_ADAPTER=eskiz` ham SMS yuborishni yoqmaydi. `OTP_DELIVERY_ADAPTER=test` faqat development/test muhitidagi testlar uchun; productionda rad etiladi. Tarixiy test harnesslari uchun `OTP_SMS_ADAPTER=test` mosligi saqlangan.

`20261119_telegram_otp_delivery.sql` yangi migrationi `telegram_otp_contacts` jadvalini yaratadi. Oldingi OTP, password-reset va barber Telegram migrationlari talab qilinadi. Migrationni alohida tasdiqsiz bajarmang. Jadval akkaunt jadvallarini o‘zgartirmaydi. Schema va migration tracking uchun avvalgi deployment kabi tegishli ruxsatlar kerak. Backend va worker turli DB rollari bilan ishlasa, backendga jadvalda SELECT, workerga SELECT/INSERT/UPDATE/DELETE talab qilinadi; ruxsatlar bu kod tomonidan avtomatik berilmaydi.

Backend papkasida alohida processlarda:

```sh
npm start
npm run telegram:worker
```

Worker `getMe` bilan bot IDsi va username mosligini tekshiradi; webhook mavjud bo‘lsa pollingni ishga tushirmaydi. Bitta bot uchun faqat bitta poller yetakchisi ishlaydi. Mavjud barber bog‘lash va booking callbacklari saqlangan. Worker ishlamasa yangi kontaktlar tasdiqlanmaydi. Kodlar backenddan Telegramga yuboriladi; worker API tokenini tekshiradi va contact update’larini qabul qiladi.

## API va xatolar

- `GET /api/auth/telegram`: maxfiy tokensiz `channel` va xavfsiz bot URL’i. Bot hali sozlanmagan bo‘lsa 503.
- Registration va password-reset endpointlari/payloadlari avvalgidek qoladi.
- `telegram_contact_required`: botda o‘z kontaktini ulashib, saytga qaytish kerak.
- `telegram_otp_unavailable`: bot konfiguratsiyasi yoki Telegramga yetkazish ishlamayapti.
- Parol tiklashda mavjud va mavjud bo‘lmagan telefonlar uchun bir xil umumiy javob saqlanadi; yetkazish xatosi account mavjudligini ochib bermaydi.

Urinishlar, resend, vaqtinchalik/doimiy bloklar, HMAC va session tokenlari o‘zgartirilmagan. Tarixiy DB audit eventlari va `sms_limit` kabi eski kodlar schema mosligi uchun saqlangan; ular endi Telegram orqali yuborish limitlariga ham tatbiq etiladi. Ochiq OTP yoki bot tokeni logga chiqarilmaydi. Telegram xatosida avtomatik SMS fallback va noaniq yetkazish holatida avtomatik qayta yuborish yo‘q.

## Tekshiruvlar

- `node test/telegramOtp.unit.test.js`: self-contact, boshqa/forward/group kontaktini rad etish, TTL, botlar orasidagi ajratish, OTP yetkazish, xatolarning maxfiyligi, bir transaction clientidan foydalanish va bot ko‘rsatmasi — 9 PASS.
- `node test/telegram.unit.test.js`: mavjud barber bot/worker regressiyasi — 9 PASS.
- `node test/registration.unit.test.js`: OTP/session/identity cheklovlari — 22 PASS.
- `node test/passwordReset.unit.test.js`: reset va eski JWTni bekor qilish — 10 PASS.
- `node test/bootstrap-plan.unit.test.js`: yangi migration tartibi va bootstrap — 13 PASS.
- Frontend lint, tegishli 3 test fayli va production build o‘tdi.

Bu natijalar offline unit/mock va build tekshiruvlari. Haqiqiy bot orqali telefon kontakti va OTP yetib borishi bot tokeni kiritilmaguncha tasdiqlanmagan. Yangi migrationni qo‘llash va PostgreSQL integratsiyasi alohida qayd etiladi.

## 2026-11-17 bajarilgan ishga tushirish tekshiruvi

Yangi migration `ustara_db` va `ustara_test_db`ga foydalanuvchi ruxsati bilan qo‘llandi. Oldin har bir bazaning 0600 ruxsatli backupi `/tmp/ustara-before-telegram-otp-<database>-20261117.dump`ga olindi. Mavjud accountlar soni o‘zgarmadi.

`/tmp/ustara-telegram-otp-postgres.cjs` bilan haqiqiy local PostgreSQLda 12 ta tekshiruv o‘tdi: ikkala rol uchun kontakt yo‘qligida rollback, kontaktni saqlash, tasdiqlangan chatga kod marshrutlash, OTP orqali canonical account yaratish, parolni tiklashdan keyin session versionini oshirish va reset tokenining bir martalikligi. Ushbu integratsiya sinovida Telegram API mock qilindi. Ikkita yangi test accounti va tegishli fixture yozuvlari faqat `ustara_test_db`da qoldi; ilova bazasiga test accountlari kiritilmadi.

Haqiqiy bot `getMe` orqali tekshirildi: token va username mos; webhook yo‘q. Worker ishga tushirildi; bazada yetakchi locki va cursor mavjud. Bitta haqiqiy self-contact worker orqali tasdiqlandi. `GET /api/auth/telegram` to‘g‘ri bot URL’ini qaytardi.

Chrome orqali ro‘yxatdan o‘tishning ikkala roli va parol tiklash sahifalari 1440 va 390 px ekranlarda tekshirildi: 6 PASS; bot linki va ko‘rsatma mavjud, console/HTTP xatosi hamda gorizontal toshish yo‘q.

Telegram kontaktini tasdiqlash modeli [Telegram Bot API](https://core.telegram.org/bots/api#keyboardbutton)dagi `request_contact` va `contact.user_id` maydonlariga tayanadi. Faqat o‘z private chatidagi self-contact qabul qilinadi.

Haqiqiy yetkazish sinovi: production Telegram adapteri orqali botda tasdiqlangan yagona kontaktinga bir dona aniq belgilangan sinov xabari yuborildi. Telegram API xabarni qabul qilib `message_id` qaytardi, chat mosligi tekshirildi. Sinov kodi saytdagi auth sessiyasiga bog‘lanmagan va xabarda uni saytga kiritmaslik aytilgan. Telefon, OTP va token logga chiqarilmadi; SMS yuborilmadi. Foydalanuvchining saytdan boshlanadigan to‘liq haqiqiy ro‘yxatdan o‘tishi hali alohida tasdiqlanmagan.

### Keyingi ishga tushirish xatosi: OTP kaliti yo‘q

Foydalanuvchining haqiqiy registration urinishida eski umumiy xabar qaytdi. Tekshiruvda `.env`dagi `OTP_HMAC_KEY` yo‘qligi va `createOtpCrypto().ready()` aynan `otp_unavailable` qaytarishi tasdiqlandi. Telegram bot konfiguratsiyasi, worker locki va kontakt tasdig‘i tayyor edi. Faqat yetishmayotgan kalit 32 bayt kriptografik tasodifiy qiymatning hex ifodasi bilan yaratildi; JWT va bot tokenlari almashtirilmadi. Backend qayta ishga tushirildi, OTP hamda Telegram konfiguratsiya tekshiruvlari o‘tdi. Kod o‘zgarmagani uchun unit testlar takrorlanmadi. Kalit doimiy saqlanishi kerak; uni o‘chirish yoki almashtirish avval berilgan OTP tekshiruviga ta’sir qiladi. Foydalanuvchining yangi registration urinishidan oldin qo‘shimcha kod yuborilmadi.

### Davom etishdan keyingi OTP sahifasi

`RegistrationForm`, registration state va `/otp` route tekshirildi. Chrome’da mijoz hamda usta formasini telefon/parol/CAPTCHA bilan to‘ldirish, “Davom etish”ni bosish, 5 ta kod maydoni bor `/otp` sahifasiga o‘tish va koddan keyin `/complete-profile`ga yo‘naltirish bajarildi — 2 PASS. API javoblari browser interception orqali mock qilindi, haqiqiy kod yuborilmadi va DBga yozilmadi. Mavjud o‘tishlar to‘g‘ri ishlagani sabab kod o‘zgartirilmadi. Haqiqiy yuborish xatosida forma OTP sessiyasi yaratilmaguncha shu sahifada qolishi kerak.
