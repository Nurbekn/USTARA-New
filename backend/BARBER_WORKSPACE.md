# Sartarosh dashboardidagi tuzatishlar

Tekshirildi: xizmat create/update controlleri, umumiy barber store, jadval, availability, portfolio media/API, like/izoh endpointlari va daromad uchun mavjud booking/service schema.

## O‘zgarishlar

- Xizmat davomiyligi yangi formada 5 daqiqadan boshlanadi; +/− har safar 5 daqiqa, chegarasi 5–60 daqiqa. Backend create/update ham shu qoidani tekshiradi. Eski bronlarning saqlangan davomiyligi o‘zgarmaydi.
- Umumiy store profilni alohida, qolgan endpointlarni mustaqil natijalar bilan yuklaydi. Portfolio yoki sharh xatosi serverdan kelgan jadvalni yo‘qotmaydi. Jadval xatosi bo‘lsa bo‘sh jadvalni saqlangan deb ko‘rsatish o‘rniga xato ko‘rsatiladi.
- Tasdiq belgisi `verification_status`, ochiq/yopiq holat `accepting_bookings` va Toshkent vaqtidagi ish jadvalidan olinadi. `isAvailable: null` tufayli doimiy noma’lum holat chiqishi tuzatildi.
- Portfolio follower/following hisoblagichlari APIga ulandi; obunachi bo‘lmasa 0. Soxta postlar yoki raqamlar qo‘shilmadi.
- `/api/media/...` rasm/video manzillari API bazasiga yo‘naltiriladi. Dev muhitda frontend portiga noto‘g‘ri ketishi tuzatildi.
- Uch ustunli galereya va mobil to‘liq ekran post ko‘rinishi: avatar, media, like, izoh, saqlash, caption, to‘g‘ri sana. Mavjud Social API ishlatiladi.
- Portfolio API mavjud emas degan eskirgan matn va o‘chirilgan post qo‘shish tugmasi tuzatildi. Bo‘sh holat va haqiqiy yuklash xatosi alohida ko‘rsatiladi.
- `GET /api/barbers/earnings`: faqat autentifikatsiyalangan sartaroshning oxirgi 30 kundagi yakunlangan bronlari.
- Daromad sahifasida 7/30 kunlik ustunlar, xizmatlar taqsimoti, yakunlangan xizmat soni va o‘rtacha daromad bor. Ma’lumot bo‘lmasa 0; server xatosi bo‘lsa xato ko‘rsatiladi.

## Daromadning chegarasi

Mavjud bookings jadvalida tarixiy xizmat narxi snapshoti yoki to‘lov summasi yo‘q. Hisobot yakunlangan bronlarni **joriy xizmat narxi bo‘yicha** hisoblaydi; UI ham shu asosni aniq ko‘rsatadi. Bu to‘lov qabul qilinganini yoki tarixiy kassadagi aniq summani bildirmaydi. Tarixiy aniq hisob uchun alohida schema o‘zgarishi va yangi narx snapshoti kerak; bu vazifada migration yoki to‘lov tizimi qo‘shilmadi.

## Asosiy fayllar

Backend: `controllers/servicesController.js`, `controllers/socialController.js`, `controllers/barberEarningsController.js`, `routes/barbers.js`.

Frontend: `api/client.js`, `components/Sheet.jsx`, `pages/barber/data/store.js`, `data/availability.js`, `data/earnings.js`, `Services.jsx`, `Schedule.jsx`, `Portfolio.jsx`, `Earnings.jsx`, `components/AvailabilityBadge.jsx`, `components/PostReactions.jsx`, `barber.css`.

Testlar: `frontend/test/barberWorkspace.test.js`, `backend/test/servicesBody.unit.test.js`, `backend/test/barberWorkspace.postgres.integration.test.js`, `backend/test/helpers/barberWorkspaceMobile.js`.

## Bajarilgan tekshiruvlar

- Frontend workspace va backend services unit test fayllari o‘tdi.
- Frontend lint va production build o‘tdi.
- O‘zgargan backend controller, route va testlar ESLint tekshiruvidan o‘tdi.
- Alohida PostgreSQL 16 + mobil Chrome: **7/7 test o‘tdi**. Pending sartaroshning 6 kunlik jadvali, duration chegaralari, bo‘sh/to‘liq daromad, portfolio hisoblagichi, haqiqiy media javobi, mobil post, like va izoh tekshirildi.
- Browser haqiqiy vaqtinchalik API va PostgreSQL bilan ishladi. Media so‘rovlari test APIga yo‘naltirildi; real foydalanuvchi bazasi ishlatilmadi.
- Yakuniy artefaktlar: `/tmp/ustara_otp_pg16_2CieeS/`; jadval, xizmat, portfolio, post va nol/to‘liq daromad skrinshotlari bor.

```bash
# Repo ildizida
node --test frontend/test/barberWorkspace.test.js backend/test/servicesBody.unit.test.js
USTARA_DISPOSABLE_OTP_TESTS=I_AUTHORIZE_TEMP_DATABASE USTARA_WORKSPACE_E2E=1 node --test backend/test/barberWorkspace.postgres.integration.test.js
npm --prefix frontend run lint
npm --prefix frontend run build
```

Haqiqiy foydalanuvchining bazasiga ulanilmadi, migration bajarilmadi. Haqiqiy video faylining turli Android/iOS kodeklarida ijrosi va foydalanuvchining mavjud media yozuvlari alohida qo‘lda tekshirilishi kerak. Mobil E2E Chrome emulyatsiyasida bajarildi.

## Profil tasdig‘i va Social saqlanishi bo‘yicha keyingi tuzatish

- `VerifiedAvatar` komponenti qo‘shildi: ko‘k tasdiq belgisi rasmning pastki o‘ngida. Dashboard headeri, navigatsiya, profil, portfolio va post avtorida ishlatiladi.
- Ish holati alohida: ochiq — yashil, yopiq — qizil nuqta; `prefers-reduced-motion` yoqilmaganida yurak urishiga o‘xshash animatsiya. Tasdiqlanmagan profilga ko‘k belgi berilmaydi.
- Sartarosh profilidagi `Salon nomi` UI/error matni `Sartaroshxona nomi`ga almashtirildi. API maydonining mavjud `salon_name` identifikatori saqlandi.
- Yashil aksentlar post qo‘shish tugmasi, ochiq holat, saqlash/izoh amallari va daromad diagrammasiga qo‘shildi.
- `GET /api/social/posts/:id` autentifikatsiyalangan customer va barber uchun postning yangi holatini beradi. Post ochilganda cache bilan cheklanilmaydi.
- Like/saqlash endpointlari tranzaksiyada yozadi, serverdagi `likeCount`, `liked`, `saved` qiymatlarini qaytaradi. Frontend faqat tasdiqlangan javobni ko‘rsatadi va portfolio cache’ini ham yangilaydi.
- Izoh yozish va avtor/count javobini tayyorlash bir tranzaksiyaga olindi. Izohlar mavjud autentifikatsiyalangan foydalanuvchilar uchun umumiy API orqali o‘qiladi. Tasdiqlanmagan sartarosh postlari bo‘yicha oldingi himoya saqlangan.
- PostgreSQL/mobil tekshiruv: **8/8 o‘tdi**. Customer va barber bir-birining izohini ko‘rdi; bir xil like qayta yuborilganda hisob ikki marta oshmadi; sahifa qayta ochilganda like va izohlar saqlangani tekshirildi.
- Yakuniy artefaktlar: `/tmp/ustara_otp_pg16_DZjqC7/`. Frontend workspace/Social unit fayllari, frontend lint/build va o‘zgargan backend JS ESLint tekshiruvlari o‘tdi.
- Foydalanuvchining haqiqiy akkauntida DBga yozish yoki schema o‘zgartirish bajarilmadi. Real mobil qurilma tekshiruvi alohida qoladi.
