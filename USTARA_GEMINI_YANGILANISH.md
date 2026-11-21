# USTARA — Gemini bilan yangilangan kod (v2)

## Asosiy qoida

AI provayder: **Google Gemini**. AI faqat ixtiyoriy kontent yozishda ishlatiladi; bron, to‘lov, telefon, Telegram OTP, navbat, ruxsatlar yoki Admin qarorlari AI'ga topshirilmaydi.

## Kiritilgan o‘zgarishlar

1. Backend: `POST /api/ai/post-caption` (faqat login qilingan sartarosh), so‘rov: `{ "description": "low fade", "style": "short" }` yoki `professional` / `friendly`. Javob: `{ "caption": "..." }`.
2. Gemini kaliti **faqat backendda** `GEMINI_API_KEY` orqali ishlatiladi. Frontendga, URL query parametriga va ZIP/Git ichiga kiritilmaydi. Model `GEMINI_MODEL` bilan sozlanadi.
3. Ulanish uzilishi, providerning xatoligi, 429 cheklovi, bo‘sh javob va noto‘g‘ri inputlar xavfsiz foydalanuvchi xabariga aylantiriladi. Providerning raw javobi, API kaliti yoki telefon ma’lumotlari loglarda qaytarilmaydi.
4. AI yordamchisi `Ilhom → post yaratish` va `Barber → Portfolio → Post qo‘shish` oynalariga ulangan. Tayyorlangan matn **qoralama**; sartaroshning o‘zi ko‘rib chiqib nashr qiladi. Rasm, bron, mijoz raqami AI'ga yuborilmaydi.
5. Har bir akkauntga bitta backend process doirasida 15 daqiqada 6 so‘rov limiti; productionda ko‘p serverli limiter ham kerak bo‘ladi.
6. Yangi bronlar (single va multi) odatiy xavfsiz holatda `confirmed` holatida yaratiladi. Telegramga "Yangi bron tasdiqlandi" xabari tugmasiz yuboriladi; eski alohida ko‘rib chiqiladigan `pending` bronlar workflow'i saqlanadi.
7. Ko‘p xizmatli DB migratsiyasi (`20261125_multi_service_bookings`) mavjud bo‘lsa, **bir xizmatli bron ham shu tranzaksion snapshot yo‘li**dan o‘tadi: xizmat nomi, tanlangan paytdagi narxi, davomiyligi alohida yozuvlarda saqlanadi. Eski DB migratsiyasiz ishlayotganda narx snapshoti to‘liq ishlamaydi; production oldidan migratsiya shart.
8. Fresh install bootstrap ro‘yxatiga mavjud, oldin tushib qolgan 4 migratsiya kiritildi va tekshiruv jadval inventari yangilandi. **Bu o‘zgartirishlar hech qanday haqiqiy DBga avtomatik qo‘llanmagan**.
9. OTP 5 xonali bo‘lishi haqidagi oldingi talabga mos ravishda Eskiz adapter unit testining eski 6 xonali test qiymati tuzatildi.
10. `.gitignore`ga `.env`, local dependency va build artifact exclusion qo‘shildi.

## O‘rnatish

`backend/.env` o‘zingizda yaratiladi. Faqat **yangi, hech kimga oshkor qilinmagan** Gemini kalitidan foydalaning:

```env
GEMINI_API_KEY=YOUR_NEW_PRIVATE_KEY
GEMINI_MODEL=gemini-3.8-flash
```

Qolgan backend env (JWT, PostgreSQL, Telegram bot tokeni, OTP sozlamalari) avvalgi loyiha konfiguratsiyasiga mos bo‘lishi shart. API kaliti **hech qachon** `VITE_` bilan boshlanadigan frontend env nomiga yozilmaydi.

```bash
cd backend
npm ci
npm start
# Boshqa terminal: npm run telegram:worker
cd ../frontend
npm ci
npm run dev
```

**Muhim:** mavjud ishchi PostgreSQL bazasida `bootstrap.sql`ni ishga tushirmang; u faqat bo‘sh yangi baza uchun. Eski bazada avval staging backup va mos migration ketma-ketligini tekshiring. Bu arxivda haqiqiy production migratsiyasi bajarilmagan.

## Shu arxivdagi sinovlar

- Backend: `node --test backend/test/*.unit.test.js` → **274/274 PASS**.
- Frontend: `node --test frontend/test/*.test.js` → **114/114 PASS**.
- Frontend `cd frontend && node node_modules/vite/bin/vite.js build` → **PASS**.
- Gemini real provider orqali sinov qilinmadi: haqiqiy kalit/servisga ulanmagan, faqat mock-fetched unit testlari bor.
- Real PostgreSQL parallel tranzaksiya, haqiqiy Telegram, browser E2E, cloud deployment va barcha 185 qaror sinovlari bajarilmadi.

## Katta qolgan qismlar

Bu ZIP — barcha 185 qaror amalga oshirilgan production mahsulot emas. To‘liq audit/checklist `USTARA_185_QAROR_IMPLEMENTATSIYA.md`da: walk-in QR va FIFO, Smart Booking offerlar, shop/team owner flows, Customer & Admin UI, ko‘p tildagi bot xabarlari, real-time xabarlar, ruxsatlar va E2E. Bularni shunchaki ishlaydi deb belgilamang.

**Xavfsizlik:** chatga bir marta yozilgan API kalitini oshkor bo‘lgan deb hisoblang. Google AI Studio/Cloud'da eski kalitni bekor qiling va **yangi** kalit yarating; yangi kalitni faqat o‘z serveringizdagi `.env`ga yozing, chatga qayta yubormang.
