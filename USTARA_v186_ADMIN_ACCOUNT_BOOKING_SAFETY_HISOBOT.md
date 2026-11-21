# USTARA v186 — Admin account booking impact & safe deletion

## Maqsad va amalda yopilgan xavf
#177 bo‘yicha Admin tomonidan akkauntga chora qo‘llanganda ochiq bronlar tasodifan yo‘qolmasligi kerak. v185 dagi `DELETE /api/admin/users/:role/:id` mavjud bronlarni ham o‘chirishi mumkin edi. v186 bu oqimga oldindan bronlar ta’siri tekshiruvini va tranzaksiya ichidagi majburiy blokni qo‘shadi.

## Yangiliklar
- **GET** `/api/admin/users/:role/:id/booking-impact` — faqat authdan o‘tgan Admin, read-only, `Cache-Control: no-store`.
- Faqat `customer` yoki `barber` va haqiqiy musbat 32-bit profil ID qabul qilinadi. Natijada: `activeCount`, `earliestBookingTime`, `hasUnfinishedBookings`, `readOnly`; ism, telefon, parol yoki boshqa mijozning shaxsiy tafsilotlari qaytarilmaydi.
- Faol ko‘rilgan bronlar: `pending` yoki `confirmed` holatdagi, xizmatning **tugash vaqti** server `clock_timestamp()` vaqtiga nisbatan kelajakda bo‘lgan bronlar. Tugagan va bekor qilingan bronlar hisoblanmaydi.
- Admin **Foydalanuvchilar** sahifasida o‘chirishni bosganda avval shu previewni oladi. Ma’lumot noto‘g‘ri / yo‘q bo‘lsa, xato ko‘rsatiladi va o‘chirish to‘xtaydi. Bronlar bo‘lsa o‘chirish tugmasi amalda ishlamaydi, muammoni hal qilish kerakligi aytiladi.
- **Asosiy server kafolati**: `accountDeletionService.deleteAccount()` oldingi profil va user row locklari saqlangan tranzaksiyada faol bronni **qayta** tekshiradi. Bu previewdan keyin paydo bo‘lgan bronni ham hisobga olishi uchun zarur. `409 active_bookings` holatida `ROLLBACK`, hech qanday `DELETE FROM bookings` bajarilmaydi.
- Eski profil va servis egaligi nazorati, telefon limitlari lock tartibi, tarixiy yozuvlarni tozalash jarayoni va Admin autentifikatsiyasi saqlangan.
- O‘zbek, rus, ingliz tillarida foydalanuvchiga ta’sir ogohlantirishlari mavjud.

## Muhim cheklovlar
- Bu **Admin suspend** funksiyasini to‘liq yaratmaydi: akkauntga vaqtincha ban va reverse-unban, mavjud bronlarni qayta taqsimlash, Telegram xabar tarqatish hali YO‘Q.
- Preview yozishni bloklamaydi; yakuniy DELETE tranzaksiyasi har safar mustaqil tekshiradi.
- Server tekshiruvi xuddi mavjud Account Pause qoidasi kabi `pending/confirmed` va xizmat tugash vaqtiga asoslanadi. Vaqti o‘tgan, hal qilinmagan holatlarni alohida siyosat bilan ko‘rib chiqish kerak.
- Oldingi soft deactivation va hard delete alohida oqimlar bo‘lib qoladi. Hech qanday production ma’lumot o‘chirilmagan yoki o‘zgartirilmagan.
- Ko‘p parallel so‘rovli haqiqiy PostgreSQL E2E sinovi va brauzer E2E hali NOT_RUN. `admin-account-deletion.integration.test.js` yangi blok siyosatiga moslashtirildi, ammo real DBda ishga tushirilmadi.
- Yangi migratsiya kerak emas; 58 forward migratsiya va oldingi tarixiy SQL fayllari o‘zgarmadi.

## Testlar va audit
- `backend/test/v186AdminBookingSafety.unit.test.js`: role/ID, fail-closed, SQL parametrlar, qayta tekshiruv, transaction rollback, customer/barber bilan bog‘liq unit testlar.
- `frontend/test/v186AdminBookingSafety.test.js`: URL, server javobi validatsiyasi va delete oldidan preview talabi.
- Barcha frontend, backend unit va source graph testlari natijalari arxiv chiqarilishidan oldin tekshirilib hisobotga qo‘shiladi.
- Asl 185 qaror manba auditi: 185/185. Bu production yakunlandi degani emas.

**Holat: v186 yangi xavfsizlik qatlami unit sinovlaridan o‘tgan, haqiqiy DB/staging tasdig‘i hali kerak. LOYIHA TUGADI emas.**
