# USTARA — 5 xonali Telegram OTP va yangilangan signup

## Kiritilgan o'zgarishlar
- Registration va password reset uchun OTP kodi 6 tadan **5 xonaga** tushirildi. Backend kodi `crypto.randomInt` bilan generatsiya qilinadi, boshidagi 0 saqlanadi, HMAC himoyasi va 3 daqiqalik muddat saqlangan.
- Registration OTP va password reset sahifalaridagi inputlar 5 xonaga moslashtirildi.
- Mijoz va barber signup ekranidagi sarlavha, bosqichlar, Telegram izohi va dizayn yangilandi; boshqa auth sahifalarning global uslubi almashtirilmadi.
- Oldindan mavjud Telegram worker, contact/link, password reset va bronni qabul qilish/rad etish tugmalari saqlandi. SMS kiritilmadi.

## Muhim: Telegram qanday ishlaydi?
- Saytda mijoz bron yaratadi; backend tegishli barberga Telegram xabari va **Tasdiqlash / Rad etish** tugmalarini yuboradi.
- Usta tugmani bosganda Telegram callback backendda barber chat ID va bron holatini tekshiradi; holat o'zgartiriladi.
- Ro'yxatdan o'tish paytida foydalanuvchi botda o'z kontaktini ulashadi va kodni Telegram orqali oladi.
- Parol tiklashda ham botga bog'langan telefon kerak. Begona odam kontaktini yuborish mumkin emas.
- Login telefon va parol orqali davom etadi. Kodni saytda tasdiqlaydi; bot bevosita akkaunt ochmaydi.

## Tekshirish
- `node --test backend/test/telegramOtp.unit.test.js` — 11/11 PASS.
- `node --test frontend/test/registration.test.js frontend/test/passwordReset.test.js` — 17/17 PASS.
- `createOtpCrypto` bilan 200 ta 5 xonali kod va HMAC mosligi tekshirildi — PASS.
- Full backend regressiya, production frontend build, real PostgreSQL, haqiqiy Telegram tokenlari va real bron yetkazilishi **bu muhitda tekshirilmagan**; npm paketlari o'rnatilishi tarmoq sabab yakunlanmadi.

## Productiondan avval
1. Muhit sozlamalarini alohida saqlang. Maxfiy `.env`, BotFather tokeni, JWT va OTP_HMAC_KEY'ni gitga qo'shmang. Boshqa joydan ko'chirilgan arxivda maxfiy sozlamalar yo'q.
2. `cd backend && npm ci` va `cd frontend && npm ci` bajaring. Backend `npm start`, worker `npm run telegram:worker`, frontend `npm run build`.
3. Eski 6 xonali kodlar bilan boshlanib yakunlanmagan auth sessiyalarini to'xtating va **yangidan kod so'rang**. Kutilayotgan tokenlar saqlansa ham, endi 5 xonali tekshiruv eski kodni qabul qilmaydi.
4. Database migrationlarini tekshiring; ular haqiqiy bazada bu ishda bajarilmadi. Eski migratsiya fayllari o'zgartirilmadi.
5. Telegram kontakt, yangi mijoz ro'yxati, barber ro'yxati, bronni botdan tasdiqlash/rad etish va parol tiklashni haqiqiy qurilmada sinab chiqing.
6. HTTPS, CORS, server worker lifecycle, backup/restore, monitoring va loggingni productionda sozlang.

**Holat:** muhim qismlarga tuzatishlar kiritilgan kod arxivi. Productionga 100% tayyor deb tasdiqlanmagan.
