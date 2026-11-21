# Ro‘yxatdan o‘tish: sayt → OTP sahifasi → bot → kontakt → kod

“Davom etish” telefon/parolni tekshirib, registration sessiyasini yaratadi. Telegram kontakti oldindan talab qilinmaydi va bu bosqichda kod yuborilmaydi. Sayt `/otp` sahifasini ochadi; shu yerda “Botdan kod olish” havolasi va 5 ta kod maydoni ko‘rinadi.

Bot havolasi aynan shu registration sessiyasiga bog‘langan, 64 belgidan qisqa `reg_…` capability olib boradi. Bu web session tokeni emas: u kodni sayt nomidan tekshirish yoki account yaratish huquqini bermaydi. Bazada faqat uning SHA-256 hashi saqlanadi; havola/session/OTP loglarga yozilmaydi. Sahifada bu havola faqat tab sessionStorage’da saqlanadi.

Botda Start bosilgach o‘z kontaktini ulashish tugmasi chiqadi. Telegram chat IDsi, yuboruvchi va `contact.user_id` mos bo‘lishi shart. Kontakt raqami saytdagi raqamga teng bo‘lmasa kod yuborilmaydi. Mos bo‘lsa mavjud OTP service yangi kod yaratadi va Telegramga yuboradi. OTPning 3 daqiqalik muddati shundan boshlanadi; sayt statusni tokenni URLga chiqarmaydigan POST so‘rovi orqali oladi va kod maydonlarini faollashtiradi.

Bir havola bilan kontakt qayta yuborilsa qo‘shimcha kod yuborilmaydi. Yangi kod saytdan so‘raladi: mavjud 3 daqiqalik interval, yuborish va xato urinish limitlari hamda admin bloklari saqlangan. Yangi bot havolasi eskisini bekor qiladi. Worker restartida chat/request bog‘lanishi bazada qoladi. Registration tugashi yoki pending sessiya o‘chirilishi requestni FK cascade orqali tozalaydi. Hech bir account OTPsiz yaratilmaydi.

`20261120_telegram_registration_requests.sql` migrationi oldingi `20261114_otp_registration` va `20261119_telegram_otp_delivery`ni talab qiladi. U yangi `telegram_registration_requests` jadvali va indeksini yaratadi; mavjud account yoki tarixiy migrationlarni tahrirlamaydi. Bu migrationni bajarish alohida ruxsat talab qiladi. Bootstrap ro‘yxati va yakuniy inventory yangilangan.

Eski pending schema’sidagi NOT NULL/vaqt CHECKlari saqlanadi. Kutish bosqichida mavjud ustunlar yetkazilmagan placeholder issuance metadata’sini saqlaydi; yangi requestning `delivered_at IS NULL` holati va OTP history yozuvi yo‘qligi kod hali yuborilmaganini bildiradi. Bu bosqichda verify `otp_not_sent` qaytaradi, placeholder kod bilan autentifikatsiya qilib bo‘lmaydi. Haqiqiy yuborishda HMAC/nonce va vaqtlar qayta yaratiladi. Yuborish hisoblagichi faqat shu payt oshadi.

O‘zgarish mijoz va ustaning ro‘yxatdan o‘tishiga tegishli. Parol tiklashning mavjud Telegram kanali saqlangan; `/start otp` eski kontakt oqimi bilan mos. Barber booking bog‘lash va callbacklar o‘zgarmagan.

Offline tekshiruvlar: yangi 5 ta unit holati va mavjud registration (22), Telegram (9), bootstrap (13) suite’lari o‘tdi. Frontend lint, registration/password-reset test fayllari va build o‘tdi. Yangi migration va PostgreSQL sinovi bajarilishi alohida qayd etiladi.
