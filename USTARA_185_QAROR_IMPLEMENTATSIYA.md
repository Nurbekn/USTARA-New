# USTARA — kelishilgan qarorlar bo‘yicha implementatsiya nazorati

**Asos:** foydalanuvchi bilan o‘tkazilgan 1–185-savollar, keyinchalik tuzatilgan/bekor qilingan qarorlar ustun. Bu hujjat kod yozilganini tasdiqlamaydi; vazifalarni eski loyiha ustida izchil bajarishga xizmat qiladi.

## Kelishilgan majburiy qoidalar

- Onlayn to‘lov bo‘lmaydi. Daromad statistikasi real to‘lov deb ko‘rsatilmaydi.
- Mijoz va sartarosh — alohida akkauntlar. Bir telefon raqami faqat bitta akkaunt uchun; boshqa akkauntga oddiy chiqish/kirish orqali o‘tiladi.
- Telegram: ro‘yxatdan o‘tish kodi, bog‘lash, xavfsiz telefon raqamini almashtirish, bron eslatmalari, 5 daqiqalik bo‘shashgan vaqt takliflari va navbat chaqiruvlari. Har bir holatda server haqiqiy vakolatni qayta tekshiradi.
- Mehmonlar ommaviy profil, sartaroshlar, Ilhom, bo‘sh vaqtlarni ko‘ra oladi; bron va chat uchun ro‘yxatdan o‘tish zarur. Mehmon tanlovlari hisobga kirgach qayta tekshiriladi.
- 5 daqiqalik slotlar va xizmat davomiyligi; xizmat narxi hozirdan o‘zgarsa yangi bronlarga amal qiladi, tasdiqlangan bronning narx snapshoti saqlanadi.
- Mijoz faqat o‘zi uchun bron qiladi, lekin sartarosh qo‘ng‘iroq orqali mijoz nomidan qo‘lda bron qo‘shishi mumkin. Qo‘lda bron qilinganda telefon kelishuvi yetarli; avtomatik xabar shart emas.
- Mijoz turli kunlarga bir nechta bron qilishi mumkin, lekin bir vaqtda to‘qnashadigan faol bronlar taqiqlanadi; bronlar soniga global limit qo‘yilmaydi.
- Sartarosh slot ochmasa bron qilinmaydi; 7/14/30 kun cheklovi yo‘q. Slotlar barcha mijozlarga bir xil ochiq, faqat avvaldan band vaqt va boshqa cheklovlar tekshiriladi.
- Yangi bronlarni xavfsiz holatlarda server avtomatik tasdiqlaydi, qiyin vaziyatlar sartarosh tekshiruviga o‘tadi. Bo‘sh vaqt qayta taqsimlanganda do‘kondagi walk-in navbati birinchi; mijozga offer 5 daqiqa amal qiladi.
- “Xizmat tugadi” uchun odatiy Ha/Yo‘q tasdiqlash kifoya, alohida Undo engine kerak emas.
- Navbatlarda FIFO, qo‘lda o‘zgartirish sabab/iz bilan; navbatga kelgan odam Telegram chaqiruviga javob berishi majburiy emas.
- Sartarosh va sartaroshxona profili, jamoa egasi/menejer ruxsatlari, sartaroshxona verifikatsiyasi va egasi almashganda Admin nazorati.
- Sartarosh va mijoz telefon raqamlari kelishilgan vakolat chegarasida ko‘rinadi: sartaroshning telefoni profilida, mijozning telefoni faqat o‘z broni doirasida tegishli sartaroshga.
- Ta'til va tanaffuslar, Smart Booking, Ilhom postlari va sharhlar, privacy/shikoyat va Admin xavfsizlik tizimlari oldingi qarorlarga muvofiq ishlaydi.
- Sartaroshxona to‘liq yopilsa, ommaviy profili va tegishli ma’lumotlar o‘chiriladi, biroq majburiy saqlash huquqiy talablari va xodimlarning mustaqil akkauntlari hurmat qilinadi.
- UI: mobil-first, sodda, qoramtir-ko‘k palitra; Customer: Asosiy/Sartaroshlar/Ilhom/Bronlar/Profil; Barber: Asosiy/Bronlar/Navbat/Xizmatlar/Profil; Admin: desktop sidebar.

## Qayta muhokama qilinmaydigan / bekor qilingan fikrlar

- #154 Narxni kelajak sanaga rejalashtirish: kerak emas; narx hozirdan.
- #156 Sartaroshxona ko‘chishi uchun maxsus boshqaruv: bekor.
- #157 Ortiqcha Undo/Error Recovery: bekor; oddiy yakunlash tasdig‘i.
- #163 Xizmat boshlanganidan keyin sartaroshning alohida service-edit workflow'i: bekor.
- #167 Qo‘shimcha ish vaqtini maxsus modellashtirish: bekor; sartarosh slotlarni o‘zi boshqaradi.
- #170 Sartarosh tanlashni qayta muhokama qilish: #121 da hal qilingan.
- #172 Profilni qidiruvdan yashirish: kerak emas; bo‘sh slot ochmaydi.
- #181 Butun sartaroshxona uchun yangi bronlarni to‘xtatish tugmasi: hozircha kerak emas.
- #182 Profil preview’ni qayta tanlash: #93 da hal qilingan.
- #186 Noto‘g‘ri sartaroshga bron holatini qayta tanlash: #130 da hal qilingan, yangilik sifatida kiritilmasin.

## Ushbu ZIP ichida aniq bajarilgan ish

- Telegram worker/webhook uchun oddiy `/menu`, `/help` boshqaruvi va `/start`da bosh menyu; 5 ta tegishli tugma.
- **v2:** Gemini AI uchun himoyalangan backend endpoint va Ilhom/Portfolio post tavsif yordamchisi (kalitsiz kod). AI bron yoki OTP boshqarmaydi. Asosiy bron create yo‘llari auto-confirm, Telegram botga tugmasiz xabar. Fresh-install bootstrapga tushib qolgan migratsiyalar qo‘shildi; unit testlar o‘tdi.
- #169: bir mijozning turli sartaroshlarda ham vaqt to‘qnashadigan faol bron yaratishi bloklandi (single va multi-service create oqimlarida). Buni real PostgreSQL parallel tranzaksiyalari bilan qo‘shimcha tekshirish kerak.
- #159: sartaroshning faqat o‘z broni ichidagi mijoz telefon raqamini ko‘rishi va telefon tugmasi ulanmoqda.
- #157: “Xizmat tugadi” tugmasi oldidan oddiy Ha/Yo‘q tasdiqlash oynasi qo‘shildi.
- `Tasdiqlash kodi` — mavjud website-first kontakt/OTP jarayoniga kirish; bot o‘zicha ro‘yxatdan o‘tkazmaydi.
- `Raqamni almashtirish` — mavjud sayt orqali xavfsiz telefon o‘zgartirish jarayoniga yo‘riqnoma; botdan mustaqil tarzda telefonni egallab olishga yo‘l yo‘q.
- `Bronlar` — Telegramga bog‘langan sartarosh uchun server orqali tekshirilgan eng yaqin 5 ta faol bron; mijoz yoki bog‘lanmagan chat uchun saytdagi bronlar bo‘limiga yo‘riqnoma.
- `Bog‘lanish holati` — serverdagi amaldagi Telegram bog‘lanish tekshiruvi.
- Mavjud `/start pc_...`, `/start reg_...`, `/start <link-token>` va OTP xabar ishlovi saqlangan.
- Menu uchun mustaqil testlar yozilgan va mavjud OTP testlari bilan birgalikda ishlatilgan.

## Hali bajarilgan deb hisoblamang — asosiy implementatsiya navbati

1. **Bron yadrosi** — oddiy auto-confirm va basic snapshot v2 da kodga qo‘shildi; 5 daqiqalik xizmat konfiguratsiyasi, real DB parallel race test, booking idempotency, safe edits va guest draft hali yakunlanmagan.
2. **Navbat va Smart Booking** — fizik FIFO, QR walk-in va barber tasdig‘i, qo‘lda reorder audit, kelgan/kelmagan holatlari, bo‘shagan vaqt offerlari, Telegram callback va timeout.
3. **Telegram to‘liq integratsiya** — sayt bronlari va status o‘zgarishlari uchun doimiy bildirishnomalar (delivery outbox/retry), mijozga eslatmalar, navbat chaqiruvi, vaqt taklifi, til tanlovi, OTP va telefon almashish E2E.
4. **Customer UI** — mehmon rejimi, qidiruv/map, adapтив kartalar, Ilhom, bitta sahifalik bron, bron tarixi, chat va Privacy Center.
5. **Barber UI** — 5 tab, Smart Inbox va Adaptive Timeline, xizmatlar, tasdiqlash oqimlari, break/slot, walk-in queue, shaxsiy notalar, telefonda bron.
6. **Sartaroshxona va jamoa** — verified shop, owner/manager permissions, takliflar, joy va xizmatlar, egasi transferi, public gallery va shop review.
7. **Admin desktop** — approvals, content moderation, shikoyatlar, bron/queue control, Telegram delivery, feature flags, audit va xavfsiz deploy.
8. **Haqiqiy sinovlar** — PostgreSQL migratsiya, parallel bron/slot race, browser mobil E2E, real Telegram bilan ruxsatli test, load va accessibility.

## Muvofiqlashtirish kerak bo‘lgan eski kod

- **v2 yangilanish:** odatiy yangi bronlar (single va multi) `confirmed` yaratiladi, Telegram bildirishnomasi qayta tasdiqlash tugmalarisiz boradi. Eskidan qolgan `pending` holatlar uchun review callback saqlangan. Narx snapshoti yangi `booking_services` migratsiyasi mavjud bo‘lgandagina single/multi yo‘llarda to‘liq saqlanadi; prod DB migration va real transaction test hali shart.
- Avvalgi readme daromad uchun narx snapshotini hali saqlamaslik ehtimolini qayd etgan: productionga chiqishdan oldin migratsiyalar va haqiqiy schema bilan tekshirish shart.
- Telegram bot tokeni, DB paroli va `.env` fayli ZIP ichida qoldirilmagan. Serverda mavjud konfiguratsiyani foydalanuvchi o‘zida saqlasin.

## Bot menyusi

`/start` yoki `/menu` → bosh menyu; `/help` → yo‘riqnoma; `/status` → bog‘lanish holati; `/phone` → saytdagi xavfsiz telefon o‘zgartirishga ko‘rsatma, `/bookings` → bog‘langan sartaroshning eng yaqin 5 ta broni. `Tasdiqlash kodi` tugmasi sayt orqali boshlangan OTP jarayoni uchun o‘z kontaktini ulashish tugmasini ochadi. Boshqa odamning kontaktini yuborib hisob egallash mumkin emas.

**Ishga tushirish:** `cd backend && npm ci && npm start`; alohida terminalda `cd backend && npm run telegram:worker`; frontend uchun `cd frontend && npm ci && npm run dev`. PostgreSQL, env va Telegram deployment alohida sozlanadi. Hozirgi ZIP — to‘liq 185 qarorli tayyor production tizim emas, balki mavjud kod ustidagi tekshirilgan Telegram menu yangilanishi va implementatsiya nazorati.
