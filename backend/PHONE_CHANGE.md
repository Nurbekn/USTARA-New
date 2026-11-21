# Telefon raqamini almashtirish

Customer va barber uchun profil paroli → yangi +998 raqam → Telegram self-contact → 5 xonali OTP oqimi qo‘shildi. Eski raqamga kod talab qilinmaydi. Asosiy hisob `users.id`, rol profili esa o‘z `user_id` bog‘lanishini saqlaydi.

## O‘zgargan fayllar

| Fayl | Vazifasi |
| --- | --- |
| `backend/services/phoneChangeService.js` | Parol, vaqtinchalik sessiya, raqam/chat bandligi, OTP, tranzaksion yakunlash va bildirishnoma outbox |
| `backend/controllers/phoneChangeController.js` | HTTP javoblari, IP rate limit va maxfiy tafsilotsiz xatolar |
| `backend/routes/auth.js` | Autentifikatsiyalangan beshta yangi endpoint |
| `backend/telegram/handler.js` | `pc_` havolasi va kontaktlarni signupdan alohida yo‘naltirish |
| `backend/telegram/worker.js` | Polling rejimida yangi oqim va bildirishnomalarni qayta yuborish |
| `backend/telegram/webhook.js` | Mavjud receipt/SAVEPOINT mexanizmi bilan yangi oqim |
| `backend/database/migrations/20261124_phone_change.sql` | Ikki yangi jadval va indekslar; mavjud akkauntlarni o‘zgartirmaydi |
| `backend/scripts/phone-change-notices.js` | Webhook rejimi uchun outboxni bir marta ishlatish |
| `backend/package.json` | `phone-change:notify` komandasi |
| `frontend/src/components/phoneChange/PhoneChangePanel.jsx` | Ikkala rol uchun bir xil uch bosqichli forma |
| `frontend/src/components/phoneChange/PhoneChangePanel.css` | Mobil forma, OTP va holatlar |
| `frontend/src/components/phoneChange/model.js` | API transporti, OTP paste va server vaqtini hisobga olish |
| `frontend/src/pages/user/Profile.jsx` | Telefon sahifasidagi vaqtinchalik xabar o‘rniga haqiqiy oqim |
| `frontend/src/pages/barber/Profile.jsx` | Telefon almashtirish tugmasi va mavjud Sheet oynasi |
| `frontend/src/pages/auth/utils/session.js` | Login yo‘naltirishi bilan birga sessiyani jim tozalash imkoniyati; odatiy logout xatti-harakati saqlangan |
| `frontend/src/pages/auth/Login.jsx` | Muvaffaqiyat xabari va mavjud raqam prefillidan foydalanish |
| `backend/test/phoneChange.unit.test.js` | Kontakt, OTP domenlari, controller va bot yo‘naltirishi |
| `backend/test/phoneChange.postgres.integration.test.js` | Haqiqiy PostgreSQL, HTTP, parallel so‘rovlar va regressiyalar |
| `backend/test/helpers/phoneChangeMobile.js` | Chrome mobil E2E; telefon API va login haqiqiy test serveriga boradi |
| `frontend/test/phoneChange.test.js` | OTP paste/fokus, vaqt hisoblash va API chegarasi |

Signup dizayni, dashboard tuzilishi, Social, Admin, reklama va bronning biznes kodi o‘zgartirilmadi. Telefon almashtirishda `users.phone`, akkaunt sessiya versiyasi va OTP Telegram bog‘lanishi yangilanadi. `barber_telegram_links` mustaqil bron bog‘lanishi saqlanadi.

## API

Barchasi `POST`, `Authorization: Bearer <joriy JWT>` bilan. Faqat DBda tasdiqlangan customer/barber qabul qilinadi. Javoblar `Cache-Control: no-store` bilan beriladi.

| Endpoint | Body | Natija |
| --- | --- | --- |
| `/api/auth/phone-change/start` | `{password}` | 201: `sessionToken`, `expiresAt`, `serverNow`, `botUrl` |
| `/api/auth/phone-change/choose` | `{sessionToken,phone}` | 200: yangi raqam qabul qilinadi, hisob hali o‘zgarmaydi |
| `/api/auth/phone-change/status` | `{sessionToken}` | Yetkazish, OTP muddati, qolgan urinishlar va resend vaqti |
| `/api/auth/phone-change/resend` | `{sessionToken}` | Kontakt tasdiqlangandan keyin yangi OTP; cooldown serverda tekshiriladi |
| `/api/auth/phone-change/verify` | `{sessionToken,otp}` | 200 `phone_changed`; eski JWTlar bekor qilinadi |

Muhim xatolar: `invalid_password`, `invalid_phone`, `same_phone`, `phone_change_conflict`, `phone_change_expired`, `telegram_contact_required`, `invalid_otp`, `otp_expired`, `resend_too_soon`, `phone_change_limited`, `phone_change_unavailable`. 429 javobi `Retry-After` beradi. Konflikt javobi boshqa akkauntning kimligini ochmaydi.

## Xavfsizlik va limitlar

- Parol mavjud `verifyPassword` orqali tekshiriladi; uzun parollar uchun mavjud SHA256+bcrypt mexanizmi saqlangan.
- Tasdiqlash sessiyasi 10 daqiqa amal qiladi va joriy akkaunt, eski raqam hamda login sessiya versiyasiga bog‘langan. Parol tasdiqlash qayta boshlansa, oldingi sessiya va bot havolasi yaroqsiz bo‘ladi.
- OTP 5 xonali, 1 daqiqalik, HMAC ko‘rinishida. Domeniga akkaunt IDsi, jarayon IDsi, yangi raqam va issuance nonce kiradi. Signup/reset kodlari bu jarayonni yakunlay olmaydi.
- Bir sessiyada 5 noto‘g‘ri OTP, 3 yuborish va yuborishlar orasida 60 soniya chegara bor. Resend urinishlarni tozalamaydi.
- Sessiya qayta yaratilsa ham umumiy budjetlar saqlanadi: akkaunt uchun 15 daqiqada 5 parol tekshiruvi, 10 OTP tekshiruvi; akkaunt va yangi raqam uchun 15 daqiqada 3 yuborish. Parol tekshiruvining IP budjeti 15 daqiqada 20. HTTP IP chegarasi har amal uchun 10 daqiqada 30, status uchun 240. Mavjud bot limiti ham ishlaydi.
- OTP/parol/session token bazaga ochiq yozilmaydi va logga chiqarilmaydi. Forma parolni muvaffaqiyatli tekshiruvdan so‘ng tozalaydi; jarayon sessiyasi faqat komponent xotirasida qoladi.
- `pc_` payload 51 belgili, bot URLsi umumiy konfiguratsiyadagi `@ustara_booking_bot`ga yo‘naltiradi. `/start pc_...` shu chat uchun kontakt maqsadini tanlaydi. Oddiy `/start` kontaktni signup oqimiga qaytaradi. Parol tiklash mavjud account-contact bog‘lanishidan foydalanishda davom etadi.
- Faqat private chatdagi self-contact qabul qilinadi: `contact.user_id === from.id === chat.id`, bot bo‘lmasligi va forward belgisi bo‘lmasligi kerak. Matn bilan yozilgan telefon OTP yubormaydi.
- Bir xil yangi raqam uchun parallel tanlashlar transaction advisory lock bilan ajratiladi; faqat bir faol sessiya raqamni band qiladi. Telegram chat ham bir nechta akkauntning faol telefon almashtirish so‘roviga ulanmaydi.
- Yakunlashda foydalanuvchi, sessiya va bog‘lanishlar qayta tekshiriladi; muddatlar oxirgi locklardan keyin ham tekshiriladi. `users.phone` UNIQUE cheklovi parallel signup bilan konfliktni ham to‘xtatadi.
- Telefon, Telegram kontakt bog‘lanishi, `account_session_versions` va yakunlangan holat bitta tranzaksiyada saqlanadi. Profil IDlari, mavjud parol, bron va Social bog‘lanishlari o‘zgarmaydi.
- Eski OTP Telegram chat mavjud bo‘lsa, telefon raqami yoki kodni ko‘rsatmaydigan xavfsizlik xabari outboxga yoziladi. Xabar yetkazilmasa telefon o‘zgarishi bekor qilinmaydi. Polling worker qayta yuboradi; webhook rejimida quyidagi notifierni scheduler orqali ishlating.

## Migration va joylashtirish

Yangi migration production bazada bajarilmadi. Avtomatik migration qo‘shilmagan.

1. API va Telegram worker uchun shu kodni joylashtirishdan oldin bazaning zaxira nusxasini odatiy tartibda oling va migration egasini belgilang.
2. Barcha oldingi migrationlar, xususan `20261123_registration_resend_cooldown`, qo‘llanganini tekshiring. Yangi migration shu marker bo‘lmasa rad etiladi.
3. Eski va yangi API/worker yozuvchilarini vaqtincha to‘xtating. Ulanish parametrlarini operator muhitidan bering; maxfiy ma’lumotlarni komanda matniga yoki logga yozmang.
4. Alohida tasdiqdan so‘ng, `backend` katalogidan:

   ```bash
   psql -X -v ON_ERROR_STOP=1 -f database/migrations/20261124_phone_change.sql
   ```

5. `phone_change_requests`, `phone_change_notices` va `ustara_schema_migrations`dagi `20261124_phone_change` belgisini tekshiring. Migration mavjud account/profile/booking/social qatorlariga tegmaydi. Lock uchun 5 soniya, statement uchun 30 soniya chegara bor; xato butun tranzaksiyani bekor qiladi.
6. Yangi API va mos Telegram worker/webhook versiyasini birga ishga tushiring. Migrationdan oldin yangi workerni yoqmang: u yangi outbox jadvalidan foydalanadi.

Migration forward-only. Qayta bajarish ataylab rad etiladi; qo‘llangan marker va schemani tekshiring. Koddan qaytish kerak bo‘lsa, telefon almashtirish yozuvchilarini to‘xtatib, oldingi API/worker/frontend versiyasini joylashtiring va yangi jadvallarni saqlang. Jadvalni DROP qilish yoki tasdiqlangan raqamlarni eski qiymatiga qaytarish bu rollbackning qismi emas. Noto‘g‘ri biznes ma’lumotini tiklash alohida ko‘rib chiqilgan reja, zaxira nusxa va explicit ruxsat talab qiladi.

## Ishga tushirish

Mavjud DB, JWT, OTP HMAC va Telegram sozlamalari ishlatiladi; yangi secret talab qilinmaydi. API va worker bir xil `OTP_HMAC_KEY`, key ID va Telegram bot konfiguratsiyasidan foydalanishi shart. `TELEGRAM_BOT_USERNAME=ustara_booking_bot`. Muhit qiymatlari supervisor tomonidan beriladi; maxfiy fayllarni ochish shart emas.

```bash
# backend katalogida
npm start
# Polling rejimida, API bilan bir xil muhitda:
node telegram/worker.js
# Webhook rejimida notifierni masalan har daqiqada scheduler orqali:
npm run phone-change:notify
```

```bash
# frontend katalogida
npm run dev
# Production frontend:
npm run build
```

Webhook rejimida polling workerni ishga tushirmang. Notifier bir chaqiriqda 10 ta tayyor xabarni qayta ishlaydi; muvaffaqiyatsiz xabarlar 5 daqiqadan keyin qayta uriniladi. Telegram yuborish va DB commit tashqi servislar orasidagi yagona atomik operatsiya emas: transport natijasi noaniq qolsa, kod qayta yuborilishi yoki xavfsizlik xabari takrorlanishi mumkin. Yakuniy telefon o‘zgarishi va sessiya revocation esa PostgreSQL ichida atomik. Test transporti bundan tashqari sun’iy ravishda muvaffaqiyatsizlik holatlarini ham tekshiradi.

## Test komandalar va natijalar

Repo ildizidan:

```bash
node --test backend/test/phoneChange.unit.test.js
node --test backend/test/telegram.unit.test.js backend/test/telegramAuthHardening.unit.test.js backend/test/telegramRegistration.unit.test.js backend/test/passwordReset.unit.test.js backend/test/phoneChange.unit.test.js
node --test frontend/test/phoneChange.test.js frontend/test/registration.test.js frontend/test/login.test.js
```

Frontend katalogidan `npm run lint` va `npm run build` bajarildi, ikkalasi o‘tdi. O‘zgargan backend JS fayllari ham ESLint recommended qoidalari va Node globals bilan alohida tekshirildi, xato yo‘q.

Haqiqiy PostgreSQL integration va mobil E2E uchun PostgreSQL 16 binarlari (`/usr/lib/postgresql/16/bin`), `btree_gist`, Chrome va ishlayotgan frontend kerak. Har bir test o‘zining `/tmp/ustara_otp_pg16_*` katalogi, Unix socketi va `ustara_test_db` nomli **alohida klaster**ini yaratadi. Production `db.js`/`.env` yuklanmaydi. SQL, locklar, tranzaksiyalar, vaqt, parol hash va JWTlar haqiqiy; faqat Telegram HTTPS transporti test adapter bilan almashtiriladi.

```bash
USTARA_DISPOSABLE_OTP_TESTS=I_AUTHORIZE_TEMP_DATABASE \
USTARA_PHONE_CHANGE_E2E=1 \
node --test backend/test/phoneChange.postgres.integration.test.js
```

Frontend manzili odatda `http://127.0.0.1:5173/USTARA-New`; boshqa manzil uchun `USTARA_FRONTEND_URL`ni bering. Mobil testda faqat aloqasiz dashboard GET javoblari fixture; telefon almashtirish va login haqiqiy test HTTP → auth middleware → service → PostgreSQL orqali bajariladi. Telegram contact esa haqiqiy handler/service formatidagi test update bilan beriladi.

Faqat ma’lum tekshiruvni qayta bajarish uchun `USTARA_PHONE_CHANGE_CASE=mobile` yoki `extended`; mobil rolni ajratish uchun `USTARA_PHONE_CHANGE_ROLE=customer` yoki `barber` ishlatiladi. O‘tgan testlarni asossiz qayta bajarmang.

Bajarilgan natijalar:

- Backend unit/regression: **46 test o‘tdi**, xato yo‘q.
- Frontend unit: telefon almashtirish, registration va login bo‘yicha **3 test fayli o‘tdi**, xato yo‘q.
- Yakuniy PostgreSQL + mobil E2E: **22/22 o‘tdi** (21 ichki holat va umumiy test).
- Yakuniy integration artefaktlari: `/tmp/ustara_otp_pg16_KVhl12/`; hisobot, serverning to‘xtaganligi va kirish fayllari o‘zgarmagani shu yerda tekshiriladi.
- Mobil E2E customer uchun 360px, barber uchun 390px da parol xatosi, yangi raqam, kontakt kelguncha OTP yopiq bo‘lishi, cooldown, paste, backspace/fokus, noto‘g‘ri OTP, muvaffaqiyat, eski token tozalanishi va yangi raqam bilan loginni tekshirdi.
- Haqiqiy PostgreSQLda parallel reservation/complete/contact, OTP expiry/attempt/resend, DB/provider xatosida rollback, sessiyalar revocationi, notification retry, webhook receipt deduplicationi, signup/reset regressiyasi hamda bron/Social yozuvlari saqlanishi tekshirildi. Telefon o‘zgargandan keyin Telegram orqali haqiqiy booking status amali ham bajarildi.

Dastlabki mobil test muvaffaqiyat xabari sessiya tozalash bilan yo‘qolishini topdi; yo‘naltirish tartibi tuzatildi. Kengaytirilgan schema uchun test akkaunt va profil fixturelari bitta tranzaksiyaga olindi. Yuqoridagi natija shu tuzatishlardan keyingi yakuniy ishga tushirishga tegishli.

## Haqiqiy Telegram bilan qo‘lda tekshirish

1. Tasdiqlangan test/staging bazaga migrationni qo‘llab, mos API va worker yoki webhookni yoqing. Haqiqiy bot bilan avtomatik test yuborilmagan.
2. Customer profilidagi Telefon raqami → Raqamni almashtirishni oching. Barberda Telefon yonidagi Raqamni almashtirish tugmasini bosing.
3. Noto‘g‘ri profil paroli bilan keyingi bosqich ochilmasligini tekshiring; so‘ng haqiqiy profil parolini kiriting.
4. Joriy yoki boshqa accountga tegishli raqam rad etilishini tekshiring. O‘zingiz nazorat qiladigan, bo‘sh yangi +998 raqamni kiriting.
5. Saytdagi Telegram botni ochish havolasidan aynan `@ustara_booking_bot`ni oching va Start bosing. Yangi raqamga tegishli Telegram hisobidan Telefon raqamimni ulashish maxsus tugmasini bosing. Matn/forward yoki boshqa raqam qabul qilinmasligini tekshiring.
6. Telegramdan kelgan 5 xonali kodni saytga kiriting. Paste, avtomatik fokus, backspace va 60 soniyalik resend cooldownni tekshiring. Eski raqamga kod yuborilishi talab qilinmasligi kerak.
7. Tasdiqlashdan keyin login sahifasiga o‘tilsin. Yangi raqam va eski parol bilan kiring; boshqa ochiq qurilmadagi eski JWTlar rad etilsin.
8. Eski OTP Telegram bog‘lanishi mavjud bo‘lsa xavfsizlik xabarini, profillar/bronlar/Social ma’lumotlari saqlanganini va barber Telegram bron tugmalari ishlashini tekshiring.
9. Xuddi shu tekshiruvni ikkinchi rol uchun bajaring.

## Tekshirilmagan chegaralar

Haqiqiy Telegram tarmog‘i/botidan real kod yetkazilishi, real mobil qurilmaning Telegram ilovasidan brauzerga qaytishi, production DB grantlari va deploy muhiti qo‘lda tekshirilishi kerak. Mobil E2E Chrome emulyatsiyasi, haqiqiy Android/iOS qurilmasi emas. Production migration va server/worker restartlari bajarilmagan. Webhook-only muhitda bildirishnoma retry schedulerini operator yoqishi kerak.
