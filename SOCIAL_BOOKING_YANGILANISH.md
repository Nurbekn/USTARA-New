# Social, ko‘p xizmatli bron va dashboard

## Tekshirilgan kod va o‘zgarishlar

Mavjud Social upload/read endpointlari, PostgreSQL media saqlashi, URL resolver, bron transactionlari, GiST overlap himoyasi, ish jadvali, Telegram notifier, Customer Home va Barber dashboard tekshirildi. Signup, OTP, login, Admin, telefon almashtirish va reklama mantiqi o‘zgartirilmadi.

- Social feed rasmlaridagi `/api/media/...` backend origin orqali ochiladi. Fayl PostgreSQL `ustara_media` jadvalidagi byte ko‘rinishida saqlanadi; alohida `uploads` papkasi ushbu oqimda ishlatilmaydi. Asl nisbat saqlanadi, ko‘p rasm swipe galereyada, yo‘q fayl placeholderda ko‘rsatiladi. Media viewer, brauzerning orqaga tugmasi va yashil follow belgisi qo‘shildi. Like soni API javobidan olinadi; amallar server tasdiqlaganidan keyin ko‘rsatiladi.
- Izoh qo‘shish va o‘qish saqlandi; faqat o‘z izohini tahrirlash/o‘chirish endpointlari va tasdiqlash qo‘shildi. Boshqa hisobning izohini o‘zgartirish rad etiladi.
- Bir bron 1–20 ta turli faol xizmat oladi. Server narx va davomiylikni qayta hisoblab, xizmat nomi/narxi/davomiyligini snapshot sifatida saqlaydi. Eski bronlarning qiymatlari o‘zgartirilmaydi.
- Xizmatlar → kun → soat oralig‘i → 5 daqiqalik boshlanish vaqti → tasdiqlash. Boshlanishlar 4 ustunda; band vaqt tanlanmaydi, tanlangan vaqt yashil. Tugash keyingi soatga o‘tishi mumkin, ish jadvalidan chiqishi mumkin emas.
- Barber advisory lock va mavjud PostgreSQL exclusion constraint birgalikda ishlaydi. Bekor qilish barcha xizmatlarga tegishli bitta bronni bekor qiladi. Qayta bron qilish barcha xizmatlarni birga oldindan tanlaydi va yangi kun/slot hamda joriy narxni qayta tekshiradi; xizmatlardan biri yo‘q bo‘lsa tanlashni qaytadan so‘raydi. Telegram xabarida barcha xizmatlar va jami narx bor.
- Dashboarddagi xizmat kartalari va tezkor navigatsiya, faol xizmat holati, o‘chirish tasdig‘i saqlandi/kuchaytirildi. Portfolio 3 ustunli kvadrat grid va ko‘p rasmli viewer oladi.
- Home 1–3 sartaroshda batafsil, 4+ da ixcham kartalar ko‘rsatadi; kuzatilgan/yaqin tartibi saqlanadi. Berilmagan reyting yoki masofa yaratilmaydi.
- Daromad yangi bronning jami snapshot narxini oladi. Snapshoti yo‘q eski bronlar joriy xizmat narxi bilan baholanadi va bu asos UI’da ochiq ko‘rsatiladi.

## O‘zgargan fayllar

Backend:

- `backend/controllers/bookingsController.js`
- `backend/controllers/servicesController.js`
- `backend/controllers/barbersController.js`
- `backend/controllers/socialController.js`
- `backend/controllers/barberEarningsController.js`
- `backend/routes/social.js`
- `backend/services/bookingSelection.js` — yangi.
- `backend/services/multiBooking.js` — yangi.
- `backend/services/telegramBookingNotifications.js`
- `backend/database/migrations/20261125_multi_service_bookings.sql` — yangi.

Frontend:

- `frontend/src/pages/user/Social.jsx`, `Social.css`
- `frontend/src/pages/user/social/PostCard.jsx`, `model.js`
- `frontend/src/pages/user/social/MediaGallery.jsx`, `MediaGallery.css` — yangi.
- `frontend/src/pages/user/barber/InlineBooking.jsx`, `InlineBooking.css`, `availableSlots.js`, `createBooking.js`
- `frontend/src/pages/user/bookings/model.js`, `frontend/src/pages/user/Bookings.jsx`
- `frontend/src/pages/user/UserHome.jsx`, `UserHome.css`
- `frontend/src/pages/barber/Dashboard.jsx`, `Services.jsx`, `Portfolio.jsx`, `Earnings.jsx`, `barber.css`, `data/store.js`

Test va yo‘riqnoma:

- `backend/test/bookingSelection.unit.test.js` — yangi.
- `backend/test/multiServiceSocial.postgres.integration.test.js` — yangi.
- `backend/test/helpers/socialBookingBrowser.js` — yangi.
- `frontend/test/availableSlots.test.js`, `frontend/test/createBooking.test.js`
- `SOCIAL_BOOKING_YANGILANISH.md` — ushbu fayl.

`frontend/dist` production build orqali qayta hosil qilindi.

## API

Mavjud endpointlar kengaytirildi:

```http
POST /api/bookings
{"barber_id": 12, "service_ids": [31,32], "booking_time": "2030-01-07T09:05:00+05:00"}

GET /api/bookings/available-slots?barber_id=12&service_ids=31,32&date=2030-01-07
```

Slot javobi `duration`, `total_price`, bo‘sh `slots` va band/bo‘sh boshlanishlar uchun `candidates[{start,end,available}]` beradi. Bron list/detail yangi bronlarda `services` snapshotlari va `total_price` beradi. `service_id` yuboradigan eski mijozlar ham ishlaydi.

```http
PUT /api/services/:id
{"name":"Soch olish","price":50000,"duration_minutes":20,"is_active":false}

PUT /api/social/posts/:id/comments/:commentId
{"text":"Yangilangan izoh"}

DELETE /api/social/posts/:id/comments/:commentId
```

Barcha mutationlar autentifikatsiya va hisob egasi tekshiruvlaridan o‘tadi. O‘chirishda frontend alohida tasdiq so‘raydi. `GET /api/barbers/earnings` javobidagi `basis`: `booking_snapshot`, `mixed_snapshot_and_current_price` yoki eski sxemada `current_service_price`.

## Migrationni qo‘llash

Production bazaga migration qo‘llanmagan. Uni bajarish alohida, aniq ruxsat talab qiladi. Migration `services.is_active`, `bookings.total_price` va `booking_services` jadvalini qo‘shadi. Tarixiy migrationlar o‘zgartirilmadi.

1. Administrator bazaning to‘liq backupini olib, qayta tiklashni alohida bazada tekshiradi. Amaldagi migrationlar, xususan `20261115_slots_02_booking_no_overlap`, Barber profile/acceptance va Social migrationlari mavjudligini tasdiqlaydi.
2. Alohida PostgreSQL nusxada ushbu testni ishga tushiradi. Test o‘zi `/tmp` ichida yangi PostgreSQL 16 cluster yaratib, haqiqiy bazaga ulanmasdan migration va oqimlarni tekshiradi:

```bash
USTARA_DISPOSABLE_OTP_TESTS=I_AUTHORIZE_TEMP_DATABASE USTARA_SOCIAL_BOOKING_E2E=1 node backend/test/multiServiceSocial.postgres.integration.test.js
```

3. Faqat ruxsatdan keyin, administrator tanlagan PostgreSQL service bilan:

```bash
pg_dump 'service=ustara_migration' -Fc -f /xavfsiz-joy/ustara-before-multi-booking.dump
psql 'service=ustara_migration' -X -v ON_ERROR_STOP=1 -f backend/database/migrations/20261125_multi_service_bookings.sql
```

`ustara_migration` — administrator sozlaydigan service nomi; parolni buyruqqa yozmang. Migration bitta transaction; lock 5 soniya, statement 30 soniya. Xato bo‘lsa commit qilinmaydi. Allaqachon qo‘llangan migration qayta bajarilmaydi.

4. Ilovaning mavjud DB roliga yangi jadval uchun `SELECT, INSERT` ruxsatlarini administrator beradi. Misol, faqat aniq schema va role tanlangach:

```sql
GRANT SELECT, INSERT ON TABLE public.booking_services TO ustara_app;
```

Bu rol nomi namuna; avtomatik rol yaratilmaydi yoki ruxsat berilmaydi. Agar mavjud ruxsatlar ustunlar kesimida berilgan bo‘lsa, `bookings.total_price` uchun SELECT/INSERT va `services.is_active` uchun SELECT/UPDATE ruxsatlari ham ko‘rib chiqiladi. `booking_services` uchun alohida sequence yo‘q.

5. Backend/frontendni odatdagi usulda deploy qilib, bitta va ko‘p xizmatli bronni tekshiring. Migration bo‘lmaganda bitta xizmatli bron saqlanadi; ko‘p xizmat uchun tushunarli 503 javob qaytadi. Xizmat holatini boshqarish ham migration talab qiladi.

Ortga qaytish: ilovaning oldingi versiyasini qaytarish mumkin; yangi jadval/ustunlarni va snapshotlarni saqlang. `DROP`, narx snapshotlarini o‘chirish yoki tarixiy bronlarni qayta yozish talab qilinmaydi. Baza uchun forward-only tuzatish migrationi afzal. Eski UI ko‘p xizmatli bronni faqat birinchi xizmat nomi bilan ko‘rsatishi mumkin, ammo uning jami davomiyligi bazada saqlanadi.

## Test komandalari

```bash
node backend/test/bookingSelection.unit.test.js
node --test backend/test/bookings.unit.test.js backend/test/servicesBody.unit.test.js backend/test/socialRoutes.unit.test.js
node --test frontend/test/availableSlots.test.js frontend/test/createBooking.test.js frontend/test/customerBookings.test.js frontend/test/socialModel.test.js frontend/test/customerHome.test.js frontend/test/barberWorkspace.test.js
npm --prefix frontend run lint
npm --prefix frontend run build
```

E2E uchun frontend `http://127.0.0.1:5173/USTARA-New` manzilida ishlashi kerak (`npm --prefix frontend run dev -- --host 127.0.0.1`); boshqa manzil `USTARA_FRONTEND_URL` orqali beriladi. Test Chrome va PostgreSQL 16 binarlarini talab qiladi. Test API alohida portda, disposable bazaga bog‘langan; haqiqiy serverga so‘rov yuborilmaydi. Parallel bron testi ikkita PostgreSQL backendning haqiqiy lock kutishini kuzatadi.

## Jonli tekshiruv

Tasdiqlangan sartaroshda 20 va 10 daqiqalik xizmat yarating. Mijoz sifatida ikkalasini tanlab, masalan 09:05 boshlanishni tasdiqlang: 09:35 tugash, ikkala xizmat va jami narx list/detail, dashboard va Telegram xabarida bir xil bo‘lsin. Parallel ikkinchi mijoz shu vaqtni ola olmasin. Bekor qilingach vaqt bo‘shasin.

Social’da haqiqiy rasm/video yuklang, boshqa hisobdan like/save/follow, izoh qo‘shish/tahrirlash/o‘chirishni bajaring va sahifani qayta oching. Galereyani suring, viewerda orqaga qayting, post havolasini ulashing. Haqiqiy botga xabar yetkazilishi, OS ulashish oynasi, eski production media fayllari va katta video fayllar ushbu avtomatik tekshiruvda tasdiqlanmagan; Telegram transporti test adapterida tekshiriladi.
