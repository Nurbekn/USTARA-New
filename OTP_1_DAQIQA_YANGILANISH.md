# USTARA — OTP sahifasining yakuniy holati

OTP sahifasi ixchamlashtirildi. Signup formasi va dashboardlar qayta dizayn qilinmadi.

## Ishlash tartibi

- Sahifada Orqaga, sarlavha, telefon, Telegram botni ochish, beshta input, Tasdiqlash va Qayta yuborish mavjud.
- Bot havolasi: https://t.me/ustara_booking_bot. Alohida reg_ havola yaratilmaydi.
- Telegram tugmasi ikkilamchi, Tasdiqlash asosiy harakat sifatida ko‘rsatiladi.
- Yagona countdown backenddagi resend_available_at asosida hisoblanadi. Dastlabki 60 soniya signup so‘rovi yaratilganida boshlanadi.
- OTP xavfsizlik muddati va haqiqiy yuborish limiti alohida saqlanadi. Kontakt yoki /start ko‘rinadigan cooldownni qayta boshlamaydi.
- Faqat qabul qilingan resend yangi cooldown yaratadi. 429 Retry-After alohida retryAt cheklovi sifatida saqlanadi; status yangilanishi uni yo‘qotmaydi.
- Refresh sessionStorage orqali, ochiq tablar BroadcastChannel orqali sinxronlashadi. Registration credential localStorage yoki URLga yozilmaydi.
- To‘liq kod avtomatik tekshiriladi; inFlight takroriy so‘rovlarni to‘sadi. Noto‘g‘ri kodda kataklar tozalanib, fokus birinchi inputga qaytadi.
- Backend texnik xatolari OTP foydalanuvchisiga ko‘rsatilmaydi.

## O‘zgargan fayllar va sabablari

| Fayl | Sabab |
| --- | --- |
| frontend/src/pages/auth/Otp.jsx | Minimal UI, beshta raqam, fokus, qisqa xatolar va yagona resend taymeri. |
| frontend/src/pages/auth/auth-ui.css | Faqat OTP uchun 380px card, 320px moslashuv, 48px tugmalar va aniq fokus. |
| frontend/src/pages/auth/utils/registration.js | Server cooldowni, refresh, tablar sinxronlashuvi va Retry-After saqlanishi. |
| frontend/src/api/client.js | 429 javobining Retry-After sarlavhasini olish. |
| backend/services/registrationService.js | Cooldownni signup/resend qabul qilinganda yozish; statusda server vaqtini qaytarish. |
| backend/telegram/handler.js | /start va faol so‘rov topilmagan holatdagi matnlarni qisqartirish. Bron callbacklari o‘zgarmadi. |
| backend/database/migrations/20261123_registration_resend_cooldown.sql | Alohida cooldown ustuni va amaldagi 1 daqiqalik OTP bilan schema mosligi. |
| backend/test/helpers/registrationPool.js | Yangi cooldown yozuvini unit test modelida qo‘llash. |
| backend/test/telegramRegistration.unit.test.js | Signup/contact/resend cooldowni va eski generation rad etilishini tekshirish. |
| backend/test/otpCooldown.postgres.integration.test.js | Vaqtinchalik PostgreSQL, parallel so‘rovlar, eski yozuvlar, login va bron regressionlari. |
| frontend/test/registration.test.js | Server vaqti, refresh, 429 va xatoda avvalgi holat saqlanishi. |
| frontend/test/otp.browser.cjs | Mobile va desktop Chrome UI E2E. API to‘liq taqlid qilinadi. |
| OTP_1_DAQIQA_YANGILANISH.md | Eski, endi mos kelmaydigan tavsif va test natijalarini yangilash. |

## Migration va ishga chiqarish

Yangi migration **kerak**: 20261123_registration_resend_cooldown.sql.

U 20261122_telegram_phone_requests migrationidan keyin, yangi backend ishga tushishidan oldin qo‘llanadi. Haqiqiy bazada bajarish alohida foydalanuvchi ruxsatini talab qiladi. Bu ishda haqiqiy bazaga ulanilmadi va unda migration bajarilmadi.

Yangi nullable resend_available_at ustuni qo‘shiladi. Eski sessiyalarda created_at + 60 soniya zaxira qiymati ishlatiladi. Tarixiy schema aynan 3 daqiqalik OTPni talab qilgan, amaldagi servis esa 1 daqiqalik OTP yaratadi. Yangi constraint 1 va tarixiy 3 daqiqalik yozuvlarni qabul qiladi; servis yangi kodlarni 1 daqiqalik qilib yaratishda davom etadi. Eski yozuvlar o‘zgartirilmaydi. Urinish va yuborish limitlari saqlanadi.

20261122 migrationi Telegram chatining tarixiy so‘rovlariga noto‘g‘ri UNIQUE qo‘yilishidan keladigan konfliktni hal qiladi. Bu ishdagi real PostgreSQL parallel signup/contact/resend testlari yangi 23505 konfliktini qayd etmadi.

## Bajarilgan tekshiruvlar

- Frontend unit: barcha 13 test fayli o‘tdi. Registration faylidagi 16 holat ham alohida bajarildi.
- Backend: bajarilgan 13 unit test faylidan 12 tasi o‘tdi. Registration, Telegram, login himoyasi, password reset va bron regressionlari tekshirildi.
- Eski registrationSms.unit.test.js dagi 7 test yiqildi: fixture hali 6 xonali kod beradi, amaldagi umumiy OTP formati 5 xonali. SMS kodi va bu testlar o‘zgartirilmadi.
- Telegram registration unit: 9/9 o‘tdi.
- PostgreSQL 16 integration: 5/5 o‘tdi. SQL, transaction, FK va locklar haqiqiy; Telegram transporti taqlid qilindi. Eski 3 daqiqalik yozuvlar saqlanishi va yangi migrationni takror qo‘llash ham tekshirildi.
- Shu vaqtinchalik bazada haqiqiy TCP login so‘rovi hamda Telegram bron tasdiqlash/bekor qilish/bildirishnoma regressionlari o‘tdi.
- Chrome E2E: 320px customer, 390px barber, 1280px desktop — 3/3 o‘tdi. Signup → OTP, boshlang‘ich cooldown, tabiiy tick, virtual vaqt tugashi, boshqa tab, refresh, paste, Backspace, fokus, noto‘g‘ri/eskirgan kod, offline, 429, 500, resend, tezkor takroriy bosish, kichraygan viewport va keyingi signup bosqichi tekshirildi. API javoblari taqlid qilingan.
- npm run build -- --config /tmp/ustara-otp-final.vite.config.mjs — o‘tdi. Vaqtinchalik config envDir:false orqali environment fayllarini yuklashni o‘chiradi; asl Vite config o‘zgarmadi.
- Frontend to‘liq ESLint — o‘tdi.
- Backup bilan solishtirildi: signup RegistrationForm.jsx o‘zgarmagan.

Integration hisobot: /tmp/ustara_otp_pg16_SHt7Tl/report.json. Vaqtinchalik PostgreSQL serveri to‘xtatilgan. E2E hisobot: /tmp/ustara-otp-final-e2e.json. Mobil rasmlar: /tmp/ustara-otp-final-mobile-320.png va /tmp/ustara-otp-final-mobile-390.png.

## Ishga tushirish

Migration alohida tasdiqlanib qo‘llangandan keyin, loyiha ildizidan alohida terminallarda:

```bash
cd backend
npm run dev
```

```bash
cd backend
npm run telegram:worker
```

```bash
cd frontend
npm run dev
```

Frontend unit va ESLint:

```bash
cd frontend
node --test test/*.test.js
npm run lint
```

Faqat yangi, ajratilgan vaqtinchalik PostgreSQL klasterini yaratadigan integration testi:

```bash
cd backend
USTARA_DISPOSABLE_OTP_TESTS=I_AUTHORIZE_TEMP_DATABASE node test/otpCooldown.postgres.integration.test.js
```

## Tekshirilmagan narsalar

- Haqiqiy ustara_booking_bot orqali /start → shaxsiy kontakt → jonli kod → saytda tasdiqlash.
- Haqiqiy Telegram ilovasiga o‘tish va undan qaytish, real iOS/Android klaviaturasi. Chrome viewport emulyatsiyasi fizik qurilma sinovi o‘rnini to‘liq bosmaydi.
- Haqiqiy bazadagi schema holati va yangi migrationni unda qo‘llash.
- Jonli Telegram tarmog‘i, token, webhook/worker sozlamalari va yetkazish kechikishi.

Dastlabki backup: /tmp/ustara-otp-before-final-20261117.tar.gz. Mavjud foydalanuvchilar va bronlar o‘zgartirilmadi. Commit yoki deploy bajarilmadi.
