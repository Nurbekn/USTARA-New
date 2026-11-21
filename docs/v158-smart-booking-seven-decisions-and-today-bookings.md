# USTARA v158 — Smart Booking #17–#23 va Bronlar sahifasidagi bugungi takliflar

**Kirish manbasi:** `USTARA-v157-185-Public-Guest-Profile-and-Seven-Decisions.zip`. Asl 185-qaror CSV reyestri va 48 tarixiy SQL migratsiyasi o'zgartirilmagan (49 fayl baytma-bayt SHA-256 bilan tekshirildi). `.env` va maxfiy kalitlar ZIPga qo'shilmadi.

## Haqiqatan o'zgargan funksionallik

- **#21:** Sartaroshning **Bronlar** sahifasiga `TodaySmartBookingOffersV158` faqat o'qish paneli qo'shildi. U mavjud `GET /api/queue/offers/mine` endpointiga autentifikatsiya bilan murojaat qiladi. Backend ushbu endpointda active + approved barber va shu barberga tegishli today's openingsni tekshiradi.
- Panelda boshlanish vaqti (Asia/Tashkent), davomiylik, taklif holati, navbatdagi ko'rsatiladigan ism va mavjud booking ID ko'rsatiladi. Barcha takliflar bron sifatida sanalmaydi: faqat backenddagi haqiqiy `booking_id` bo'lsa tasdiqlangan bron deb ko'rsatiladi.
- Sahifa ochilganda, qayta fokusta va tab ko'rinib turganda taxminan 30 soniyada bir o'qish yangilanadi. `Yangilash` tugmasi mavjud. Javob 50 tadan oshsa, buzilgan ID/sana/holat bo'lsa yoki server xato qaytarsa, ro'yxat xavfsiz rad etiladi.
- Akkaunt almashganda yoki chiqilganda avvalgi so'rov `AbortController` va request generation orqali to'xtatiladi. Oldingi akkaunt ma'lumotlari yangi akkauntga aks ettirilmaydi. UI ko'rsatmalari uz/ru/en tillarida.
- Yangi bron yaratish, taklifni qabul qilish, statuslarni o'zgartirish, serverdagi biznes qoidalari va SQL sxemaga **tegilmadi**.

## 7 ta qarorning manba/test izlari

| # | Asl talab | Audit xulosasi |
|---|---|---|
|17|Sartarosh belgilagan bekor qilish qoidalari|Mavjud controller/terms va unit-test manbalari|
|18|Smart Booking eslatma va kechikish|**GAP:** Bron boshlanishidan oldingi avtomatik eslatmalar va kechikish E2E tasdiqlanmagan|
|19|Bo'shagan vaqt taklifi 5 daqiqa amal qiladi|Mavjud worker va UI muddat testlari|
|20|Takliflar ketma-ket mos mijozga yuboriladi|Mavjud FIFO tanlash va offer lifecycle manbalari|
|21|Takliflar bugungi jadvalda ko'rinadi|**Yangi Bronlar paneli** va backend/frontend unit-testlar|
|22|Xizmat tugagach vaqtni qayta taqsimlash|**GAP:** Hozirgi Smart Booking opening trigger `cancelled` bron holati uchun; xizmat erta tugagach qolgan vaqtni qayta taqsimlash hali yo'q|
|23|Keldi Boshladi Tugadi va kelmadi holatlari|Mavjud walk-in transition va tasdiqlash testlari|

**Indekslash:** 21 + 7 = **28/185** qarorning kod/test manbalari ko'rsatildi. Qolgan 157 ta qarorning manba indeksi qolgan. `REFERENCES_PRESENT_ONLY` ham `PARTIAL_SOURCE_GAP` ham *production feature completed* degani emas. `docs/v158-seven-smart-booking-source-evidence.json` auditoriya uchun.

## Tekshiruvlar (2026-11-20)

- **Frontend to'liq unit suite:** 1616/1616 PASS (0 fail/skip).
- **Backend maqsadli suite:** 125/125 PASS (0 fail/skip); ichida v158 yangi 9 test, eski Smart Booking, lifecycle va oldingi audit testlari bor.
- **Frontend yangi suite:** 6/6 PASS; xavfsiz parser, akkaunt almashish uchun UI source guard, locale, Tashkent vaqtini ko'rsatish va qabul qilingan taklif/bron farqi testlandi.
- **CI:** v158 manba auditi paketlar o'rnatilishidan oldingi tekshiruvlarga qo'shildi. `v156-unit-coverage.js --source-only` PASS.
- **49 immutable fayl:** CSV va SQL migratsiyalari v157 ZIPga nisbatan SHA-256 bir xil.

## Tekshirilmaganlar / cheklovlar

- Bu muhitda `frontend/node_modules/.bin/vite` yo'q, shuning uchun **Vite production build bajarilmadi**.
- Haqiqiy PostgreSQL migration, integratsiya, parallel transaction / race, Chrome mobil/desktop E2E va real Telegram delivery **bajarilmadi**.
- #18 va #22 funksional kamchiliklari ochiq. #21 panel o'qish ko'rinishi, to'liq timeline engine emas.
- Release-ready: **YO'Q**. 185 ta qaror bajarilgan deb hisoblanmaydi.

## O'zgargan fayllar

- `frontend/src/pages/barber/Bookings.jsx`, `frontend/src/pages/barber/barberInsightsLocaleV147.js`
- `frontend/src/pages/barber/components/TodaySmartBookingOffersV158.jsx`
- `frontend/src/pages/barber/data/todaySmartBookingOffersV158.js`
- `frontend/test/v158TodaySmartBookingOffers.test.js`
- `backend/test/v158TodaySmartBookingOffers.unit.test.js`
- `backend/scripts/v158-seven-smart-booking-decisions.mjs`
- `backend/test/v158SevenSmartBookingDecisions.unit.test.js`
- `.github/workflows/v55-verify.yml`
- Ushbu hujjat va `docs/v158-seven-smart-booking-source-evidence.json`

**Keyingi bosqich:** #24–#26 Smart Booking Admin sozlamalari, Telegram/sayt bir xil natijasi va walk-in tez qo'shish qarorlarini tekshirish. #18/#22 uchun alohida texnik implementatsiya ham kerak, faqat source indexga tayanmaslik lozim.
