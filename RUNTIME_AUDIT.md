# USTARA ishga tushirish tekshiruvi — 2026-11-17

## Topilgan va tuzatilgan muammolar

1. Backend oddiy ishga tushirishda `Production database nomi test bazasi bo'lishi mumkin emas` xatosi bilan to‘xtagan. `.env` test bazasini ko‘rsatgan, test muhiti belgilanmagan. Foydalanuvchi haqiqiy SMS muhitini tanlaganidan so‘ng `DB_NAME=ustara_db`, `NODE_ENV=development` belgilandi. Eskiz adapteri va maxfiy qiymatlar saqlandi. Xavfsizlik tekshiruvi yumshatilmadi.
2. Local test bazasida `20261118_social_portfolio_reviews` migrationi yetishmagan. Foydalanuvchi ruxsati bilan qo‘llandi.
3. `ustara_db`da quyidagi beshta migration yetishmagan: `20261115_slots_02_booking_no_overlap`, `20261116_account_profile_deletion_integrity`, `20261117_barber_profile`, `20261117_barber_profile_02_booking_acceptance`, `20261118_social_portfolio_reviews`. Alohida ruxsat bilan qo‘llandi. Dastlab birinchi migration `btree_gist` yo‘qligida to‘xtadi va tranzaksiya bekor qilindi. Extension ham alohida ruxsatdan keyin o‘rnatildi. Ilova bazasidagi users/customers/barbers/bookings yozuvlari soni oldin va keyin bir xil: har birida 0 ta.
4. `GET /api/barbers/me/portfolio` noto‘g‘ri `404` qaytargan. Maxsus route `req.params.id` bermagan; endi mavjud `/:id/portfolio` route `me` parametrini controllerga yetkazadi. Autentifikatsiya va rol tekshiruvlari saqlandi. Haqiqiy API qayta tekshiruvida `200` olindi.

## Haqiqatan bajarilgan tekshiruvlar

- Oddiy backend ishga tushirildi; `/api/health` PostgreSQL bilan `200` qaytardi.
- Local test bazasida OTP test adapteri orqali bitta mijoz va bitta usta yaratildi, haqiqiy login bajarildi. 28 ta API amali kutilgan statusni berdi: profil, xizmat, jadval, bo‘sh vaqt, booking yaratish/tasdiqlash/bekor qilish, media, post, like, save, izoh, follow, portfolio va sharhlarni o‘qish.
- Qo‘shimcha 8 ta API tekshiruvi o‘tdi: booking yaratish, ustma-ust bookingni `409` bilan rad etish, bekor qilish, sharh yaratish, sharhlarni olish, ustaning javobi, takroriy sharhni `409` bilan va begona rol orqali profil o‘zgartirishni `403` bilan rad etish. Sharh sinovi uchun o‘tgan vaqtga tegishli `completed` booking test fixture sifatida bazada yaratildi; xizmatni tugatish oqimi bu bilan tekshirildi deb hisoblanmaydi.
- Chrome orqali 20 ta sahifa/manzil 1440 px va 390 px ekranlarda tekshirildi: bosh sahifa, auth sahifalari, himoyalangan yo‘naltirishlar, mijoz va usta ichki sahifalari. Yakuniy tekshiruvlarda console xatosi, sahifadan yuborilgan HTTP xatosi va gorizontal toshish aniqlanmadi. Bu sahifalarni ochish va API tekshiruvi; har bir UI tugmasini bosib chiqish sinovi emas.
- Yangi route regressiyasi: `node test/socialRoutes.unit.test.js` — 2 PASS, 0 FAIL. Router haqiqiy Express bilan, DB va HTTP socketsiz tekshirildi.
- Eskiz auth endpointi haqiqiy sozlamalar bilan `200` va token qaytardi. SMS yuborilmadi; token va maxfiy qiymatlar loglarga yozilmadi.

## Loglar

`runtime-audit/2026-11-17/` ichida backend ishga tushish logi, API oqimi, booking/sharh sinovlari, desktop/mobile natijalari va Eskiz tekshiruvi bor. Sessiya tokenlari, OTP, parollar va ulanish URL’lari bu fayllarga kiritilmadi.

Ilova bazasining migrationdan oldingi zaxirasi: `/tmp/ustara-before-runtime-fix-20261117.dump` (269675 bayt, ruxsat 0600). Restore sinovi bajarilmadi. `/tmp` doimiy saqlash joyi emas.

## Hali tasdiqlanmagan va cheklovlar

- Telegram: alohida API tekshiruvi `503`, `telegram_unavailable`, bot sozlanmagan. `TELEGRAM_BOT_USERNAME` va bot worker uchun tegishli token/sozlamalar berilmagan; qiymatlar uydirilmadi. Telegram bog‘lash va xabar yetkazish tekshirilmadi.
- Haqiqiy SMSning telefonga yetib borishi tekshirilmadi. Eskiz autentifikatsiyasi muvaffaqiyatli bo‘lishi sender/template tasdiqlanishi yoki balans yetarliligini kafolatlamaydi.
- Password resetning to‘liq brauzer oqimi, bookingni xizmatdan keyin tugatish, katta video yuklash va tashqi hosting tekshirilmadi.
- Test accountlari va ularga tegishli yozuvlar `ustara_test_db`da qoldi. Haqiqiy ilova bazasiga test accountlari kiritilmadi.
- Avvalgi foydalanuvchi o‘zgarishlari saqlandi; commit yoki reset bajarilmadi. Tarixiy migration fayllari tahrirlanmadi.

## Ishga tushirish

Backend: `cd backend && npm start` — 5000-port.
Frontend: `cd frontend && npm run dev` — Vite ko‘rsatgan URL.
Tekshiruvda frontend `http://127.0.0.1:5178/USTARA-New/` manzilida ishlatildi.

## Keyingi tekshiruv — foydalanuvchining SMS yuborish xatosi

Eskiz hisobining `/auth/user` javobida `status=active`, `role=test`; `/user/templates` javobida 0 ta shablon qaytdi. Autentifikatsiya ishlashi haqiqiy SMS yuborishga tayyorlikni tasdiqlamagan. Hozirgi hisob haqiqiy SMS muhiti sifatida tayyor deb hisoblanmaydi. Ishlaydigan, faollashtirilgan hisob hamda tasdiqlangan sender va USTARA OTP matni kerak; maxfiy qiymatlar chatga chiqarilmasdan `.env` orqali beriladi. Bu tekshiruvda SMS yuborilmadi.

Eskiz adapteriga faqat bosqich, HTTP status va belgilangan sabab kategoriyasini yozadigan `eskiz_sms_failed` diagnostikasi qo‘shildi. Xabar matni, token, OTP, telefon va parollar logga yozilmaydi. Tashqi xatolar hali ham `503/sms_unavailable` qaytaradi; xavfsizlik cheklovlari saqlandi.

Ushbu tuzatishdan keyingi unit testlar: `registrationSms.unit.test.js` — 7 PASS; `registration.unit.test.js` — 22 PASS; `passwordReset.unit.test.js` — 10 PASS. Barchasi mock/in-memory; haqiqiy SMS yuborilmadi. Backend yangi diagnostika bilan qayta ishga tushirildi. Haqiqiy SMS yetkazilishi tashqi hisob/shablon sozlamalari hal qilinmaguncha tasdiqlanmagan.

## Telegramga o‘tish — 2026-11-17

Foydalanuvchi ko‘rsatmasiga ko‘ra faol SMS/Eskiz oqimi Telegram OTPga almashtirildi. Mavjud kirish parol bilan qoladi; registration va password-reset kodlari self-contact tasdig‘idan keyin Telegramga keladi. Yangi migration ikkala bazaga alohida ruxsat bilan qo‘llandi. Bot va worker ishlamoqda, haqiqiy kontakt tasdig‘i va aniq belgilangan sinov xabarining Telegram API tomonidan qabul qilinishi tekshirildi. 63 ta backend unit/statik tekshiruv, 12 ta PostgreSQL integratsiya holati (Telegram API mock), 3 frontend test fayli, lint, build va 6 brauzer sahifa/o‘lcham tekshiruvi o‘tdi. Tafsilotlar: [backend/TELEGRAM_OTP.md](backend/TELEGRAM_OTP.md). Ushbu bo‘lim avvalgi Eskiz muhiti haqidagi qaydlarni joriy holat sifatida almashtiradi.
