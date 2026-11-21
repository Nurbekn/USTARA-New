# Sartaroshning dastlabki profil sozlashi

## Tuzatilgan sabablar

Eski `/barber/setup` sahifasi `updateProfile` orqali umumiy dashboard store ichidagi `profile.id`ga tayanardi. Booking, portfolio yoki boshqa qo‘shimcha so‘rov bajarilmasa profil hali bo‘sh qolib, yaroqli login uchun ham `Sartarosh sessiyasi topilmadi` xabari chiqardi. Bundan tashqari, oddiy ish jadvali endpointi `pending` sartaroshni rad etardi; eski sahifa muvaffaqiyatdan keyin ham pending sahifasiga o‘tmasdi.

Setup endi faqat `/api/barbers/me` va `/api/barbers/working-hours`ni yuklaydi. Boshqa dashboard so‘rovlari xatosi setupga ta’sir qilmaydi. Haqiqiy sessiya yaroqsiz bo‘lsa yoki profil yuklanmasa saqlash tugmasi ishlamaydi va xato/yuklash holati ko‘rsatiladi.

## Natija

- Yangi jadvalda dushanba–shanba 09:00–18:00 yoqilgan, faqat yakshanba dam olish.
- Oldin saqlangan jadval serverdan o‘z holicha olinadi; foydalanuvchi tanlovlari almashtirilmaydi.
- `PUT /api/barbers/setup`, autentifikatsiya va faqat o‘z barber profili uchun.
- Body: `{address,location,working_hours:[{day_of_week,start_time,end_time}]}`.
- Profil va jadval bir PostgreSQL tranzaksiyasida saqlanadi. Jadval yozish xatosi manzil o‘zgarishini ham bekor qiladi.
- `pending` sartarosh dastlabki ma’lumotini saqlay oladi; `verification_status` serverda o‘zgartirilmaydi. `rejected` rad etiladi. Oddiy jadval endpointining mavjud admin tasdig‘i talabi saqlanadi.
- Saqlash tasdiqlangandan keyingina joriy sessiyaga `setupDone: true` yoziladi va `/barber/pending`ga o‘tiladi. Avval tasdiqlangan sartaroshning holati saqlanib, `/barber`ga qaytiladi.
- Auth middleware, DBdagi akkaunt/profil bog‘lanishi, sessiya versiyasi va ruxsatlar tekshiriladi. Jadval uchun mavjud booking advisory lock tartibi ishlatiladi.

## Fayllar

- `backend/services/barberSetup.js`
- `backend/controllers/barberSetupController.js`
- `backend/routes/barbers.js`
- `frontend/src/pages/barber/data/setup.js`
- `frontend/src/pages/barber/BarberProfileEdit.jsx`
- `frontend/test/barberSetup.test.js`
- `backend/test/barberSetup.unit.test.js`
- `backend/test/barberSetup.postgres.integration.test.js`
- `backend/test/helpers/barberSetupMobile.js`

Schema o‘zgarmadi, yangi migration talab qilinmaydi. Production bazaga ulanilmadi va haqiqiy profil/jadval saqlanmadi. Mahalliy backend `nodemon` orqali yangi route faylidan keyin qayta yuklangani jarayon va fayl vaqtlaridan tekshirildi.

## Bajarilgan tekshiruvlar

- Frontend setup unit fayli: o‘tdi.
- Backend setup unit va mavjud bookings unit fayllari: o‘tdi.
- Alohida PostgreSQL 16 + mobil Chrome: **7/7 o‘tdi**; autentifikatsiya, pending/approved/rejected, olti kunlik saqlash, takroriy so‘rov, xato paytida rollback va `/barber/pending`ga o‘tish.
- Mobil E2Eda aloqasiz dashboard endpointlari ataylab 503 qaytardi; setup profil/jadval APIlari va saqlash haqiqiy vaqtinchalik PostgreSQL orqali ishladi.
- Frontend to‘liq lint va production build, o‘zgargan backend JS uchun ESLint: o‘tdi.
- Integration artefaktlari: `/tmp/ustara_otp_pg16_LegslB/`; mobil setup va pending skrinshotlari shu katalogda.

```bash
# Repo ildizida
node --test frontend/test/barberSetup.test.js backend/test/barberSetup.unit.test.js backend/test/bookings.unit.test.js
USTARA_DISPOSABLE_OTP_TESTS=I_AUTHORIZE_TEMP_DATABASE USTARA_SETUP_E2E=1 node --test backend/test/barberSetup.postgres.integration.test.js
```

Frontend 5173-portda ishlashi kerak; boshqa manzil uchun `USTARA_FRONTEND_URL`. Testlar vaqtinchalik klaster yaratadi, haqiqiy `db.js` va `.env` yuklanmaydi.

Yakuniy tekshiruv sifatida foydalanuvchi o‘z brauzerida sahifani yangilab, o‘z ma’lumotini saqlashi kerak. Uning haqiqiy akkaunti bilan DBga yozish testi bajarilmadi.
