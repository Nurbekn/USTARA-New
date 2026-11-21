# USTARA — ishga tushirish va nosozlikni ajratish

Bu arxiv maxfiy `.env`, git tarixi, `node_modules` va test bazasini **o‘z ichiga olmaydi**. Mavjud maxfiy sozlamalarni saqlang; hech qachon chat yoki repozitoriyga yubormang.

## Local ishga tushirish

Birinchi terminal:

```bash
cd backend
npm ci
npm start
```

Ikkinchi terminal:

```bash
cd backend
npm run telegram:worker
```

Uchinchi terminal:

```bash
cd frontend
npm ci
npm run dev
```

Mavjud `backend/.env` sozlamalari saqlanishi kerak. Telegramni ishga tushirish uchun `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `OTP_HMAC_KEY`, `OTP_DELIVERY_ADAPTER=telegram` va PostgreSQLga ulanish kerak. Worker `getUpdates` (polling) ishlatadi: ayni botga webhook o‘rnatilgan bo‘lsa worker ishni davom ettirmaydi. Boshqa polling nusxasi ham to‘qnashuvga sabab bo‘lishi mumkin. Buni tokenni chatga ko‘chirmasdan tekshiring.

## Xatoni aniqlash tartibi

1. `http://localhost:5000/api/health` — backend va PostgreSQL ishlayotganini ko‘rsatadi.
2. `http://localhost:5000/api/auth/telegram` — botga havola va kanal sozlanganini tekshiradi (foydalanuvchi ma’lumotlarini qaytarmaydi).
3. Worker ikkinchi terminalda **doimiy ishlayotgan** bo‘lishi shart. Process to‘xtagan bo‘lsa self-contact va OTP jarayoni ishlamaydi.
4. Avval saytda ro‘yxatdan o‘tish yoki tasdiqlash so‘rovini boshlang; so‘ng botdagi “Tasdiqlash kodi” tugmasi orqali Telegramning rasmiy kontakt tugmasidan foydalaning.
5. Kod hali kelmasa, backend HTTP statusi va umumiy xato kodini ko‘ring; OTP, telefon raqam, JWT va bot tokenini logga yoki chatga yozmang.

GitHub Pages faqat frontendni joylaydi. Ishlaydigan sayt uchun backend va bot worker alohida hostda doimiy ishlashi, frontend uchun `VITE_API_BASE_URL` esa haqiqiy HTTPS backend manziliga pointing qilishi kerak. Vite'da bu qiymat **build vaqtida** olinadi. API serverda CORS faqat kerakli domenlarga ruxsat berishi maqsadga muvofiq.

## Hozirgi daromad cheklovi

Bron yozuvi bron vaqtida kelishilgan **narx snapshoti**ni saqlamaydi. Shuning uchun jami daromadni mavjud servis narxlari bilan hisoblash noto‘g‘ri bo‘lishi mumkin. `Daromad va faoliyat` sahifasida hozircha bajarilgan, tasdiqlangan va bekor qilingan bronlar ko‘rinadi. Aniq pul hisobotiga o'tish uchun alohida database migration, mavjud bronlarga ishlov berish qoidasi va haqiqiy to‘lov modelini tasdiqlash lozim.

## Tekshiruv darajasi

Frontend `build` va `eslint`, Telegramning mock unit testlari bilan tekshirildi. Ushbu arxiv bilan real PostgreSQL, Telegram Bot API, SMS, browser bosishlari va production hosting sinovlari **bajarilmadi**. DB migration yoki haqiqiy foydalanuvchi ma’lumoti o‘zgartirilmadi.


## Gemini AI (ixtiyoriy)

Sartaroshning Ilhom va Portfolio postlari uchun Gemini tavsif yordamchisi qo‘shildi. `backend/.env`ga faqat yangi `GEMINI_API_KEY`ni kiriting va kerak bo‘lsa `GEMINI_MODEL`ni tanlang. Frontendga API kaliti yozilmaydi. Batafsil: `USTARA_GEMINI_YANGILANISH.md`.
