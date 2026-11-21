# USTARA v101 — #105 bekor qilishdan keyingi muqobil vaqtlar

## Ishlar
1. `frontend/src/pages/user/bookings/cancellationAlternatives.js`: bekor qilingan bronning ayni sartaroshi va xizmatlari bo‘yicha sanalarni hisoblaydi. Faqat kelajakdagi, 5 daqiqalik qadamdagi va haqiqatan bo‘sh vaqtlar ekranga uzatiladi; eski bron vaqtining o‘zi taklif qilinmaydi.
2. `frontend/src/pages/user/bookings/model.js`: mijoz sessiyasi bilan mavjud `/api/bookings/available-slots` endpointini chaqiradi, sessiya almashsa natijani bekor qiladi. **Yangi bron yaratilmaydi.**
3. `frontend/src/pages/user/bookings/CancellationAlternatives.jsx` va `Bookings.jsx`: faqat server bekor qilishni tasdiqlagach muqobil vaqtlar panelini ochadi. Ma’lumot yuklanmasa aniq xatolik, qayta urinish va fallback ko‘rsatiladi.
4. `frontend/src/pages/user/Bookings.css`: moslashuvchan, klaviaturada boshqariladigan tavsiya paneli; mavjud stil saqlangan.
5. 29 yangi frontend unit/API tests; `test:v101:unit` skripti; navbatdagi checkpoint.

## Xavfsizlik/cheklovlar
- Muqobil vaqtlar **bron yoki vaqtni ushlab turish emas**. Yakuniy yangi bron uchun tanlash, server narxi va bo‘sh vaqt qayta tekshiriladi.
- Ko‘p xizmatli bronlar uchun asl xizmatlar ID/tartibi saqlanadi. Hozir faol bo‘lmasa, foydalanuvchi qayta tanlaydi.
- Uch kalendar kuni va oltita eng yaqin bo‘sh vaqt taklif qilinadi. Xato kunlar to‘liq muvaffaqiyat deb ko‘rsatilmaydi.
- Foydalanuvchi oldingi vaqtni bekor qilgach unga qayta avtomatik bron yozilmaydi.
- Haqiqiy PostgreSQL/Chrome/Telegram/CI testi **bajarilmadi**, #105 hozircha qisman. Production-ready EMAS.
