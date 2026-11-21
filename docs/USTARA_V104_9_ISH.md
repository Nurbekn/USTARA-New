# USTARA v104 — 9 funksional himoya

Manba: v103 ZIP, 973 fayl. Maqsad: #106 bronni xavfsiz ko‘chirish uchun real GET va PATCH o‘rtasidagi ruxsat hamda ma’lumot tekshiruvini uyg‘unlashtirish.

1. Akkaunt identifikatori 1..2147483647 bo‘lishi, roli customer bo‘lishi shart.
2. READ ONLY quote ichida customer/user mosligi qayta tekshiriladi.
3. Boshqa odamning bronidagi vaqtlarni oshkor qilish bloklangan.
4. Tasdiqlanmagan yoki navbatni yopgan sartarosh uchun narx so‘ralmaydi.
5. `expected_booking_time` ham 5 daqiqalik qadamga mos bo‘lishi kerak.
6. Juda uzun (>1200 min) davomiyliklar rad etiladi.
7. Asia/Tashkent bo‘yicha o‘tgan kunlar ko‘rsatilmaydi.
8. DB NULL yoki noto‘g‘ri soat qaytarganda xato bilan to‘xtaydi.
9. Shaxsiy bo‘sh vaqtlar javobi success/error holatida `Cache-Control: no-store` bo‘ladi.

**Xavfsiz test ssenariysi:** mavjud opt-in PostgreSQL concurrency suite ichida, ikki customer va bron egasi cheklovi, jadvalni o‘zgartirmaydigan GET testi qo‘shildi. Faqat alohida ruxsat berilgan test DB’da bajarilishi mumkin.

**Natijalar:** 33 yangi test PASS, frontend 816/816 PASS, backend 1045 PASS / 26 dependency FAIL. Real PG ishlatilmadi; prod-ready EMAS.
