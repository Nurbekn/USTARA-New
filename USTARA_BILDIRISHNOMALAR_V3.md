# USTARA — to‘lovsiz yangilanish (v3)

## Ushbu arxivda haqiqatdan kiritilgan o‘zgarishlar

- Mijoz navigatsiyasidagi qo‘ng‘iroqcha avvalgi «tez orada qo‘shiladi» o‘rniga haqiqiy `/api/bookings` API dan bronlarni olib, holatini ko‘rsatadi. Faqat autentifikatsiyadan o‘tgan mijozning bronlari chiqariladi. Statuslar: kutilmoqda, tasdiqlandi, yakunlandi, bekor qilindi, rad etildi.
- Qo‘ng‘iroqcha ochilganda ma’lumot yangilanadi. Har bir qatordan bron tafsilotiga o‘tiladi. Mobil uchun skroll va bosish joylari yaxshilandi. Oyna tashqarisiga bosilganda yopilishi saqlangan.
- Yangi `bookingNotifications.test.js` unit testlari qo‘shildi va `npm run test:unit` skriptiga ulandi.
- Oldingi arxivdagi profil rasmi/manzil, soch stillari, sartaroshlar xaritasi, Social, admin reklama (to‘lovsiz), to‘rtta lokal demo barber va Telegram kodlari saqlandi.
- **Onlayn to‘lov qo‘shilmadi**. Reklama faqat admin qo‘lda boshqaradigan ko‘rinishda qoldi.

## Cheklovlar — tayyor deb hisoblamang

- Bu **bron holatlari ro‘yxati**, push-xabarlarni saqlaydigan doimiy notification event-jadvali emas. Yangi bron holati faqat panel qayta ochilganda olinadi. Push/SSE/WebSocket va o‘qilgan-o‘qilmagan holati qo‘shilmagan.
- Telefon raqamini Telegram orqali eski hamda yangi telefon egaligini alohida tasdiqlab o‘zgartirish funksiyasi **hali tayyor emas**. Mavjud ekran bu cheklovni yashirmaydi. Bu amal uchun ikki bosqichli, sessiyaga bog‘langan OTP, alohida migratsiya, audit, rate limiting va haqiqiy bot integratsion sinovi kerak.
- Haqiqiy foydalanuvchi database va Telegram tokeniga ulanilmadi; production E2E tekshirilmadi. Avvalgi admin reklama migratsiyasi lokal bazada bajarilgan deb hisoblanmasin.
- Foydalanuvchilarning mavjud ma’lumotlariga tegilmadi. `.env` arxivga kiritilmagan.

## Tekshiruvlar

- `frontend/npm run lint` — o'tdi.
- `frontend/npm run build` — o'tdi.
- `frontend/npm run test:unit` — 5/5 o'tdi (shu jumladan yangi booking status testlari).

## Ishga tushirish

```bash
cd USTARA-New/backend
npm install
npm run dev
# boshqa terminalda
cd USTARA-New/frontend
npm install
npm run dev
```

Telegram botni ishga tushirish uchun mos `.env` va PostgreSQL migratsiyalari talab qilinadi. Haqiqiy bot integratsiyasi sinovdan o'tkazilmasdan productionga chiqarmang.
