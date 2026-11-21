# USTARA: admin va Telegram — tekshirish qo‘llanmasi

## 1. Admin panel

Frontendni ishga tushirgach `/admin` ga o‘ting. Admin login uchun mavjud backend `.env` faylida `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `JWT_SECRET` kerak. Baza migratsiyalarida `admin_accounts` jadvali va faol `id=1` admin yozuvi bo‘lishi kerak. Oddiy mijoz/usta logini bu sahifada ishlamaydi.

Panel: umumiy statistika, ustalarni ko‘rish va tasdiqlash/rad etish, bronlarni kuzatish, Social shikoyatlari va shikoyat qilingan postni o‘chirish, Telegram holatini tashxislash. Kirish tokeni `sessionStorage`da saqlanadi, sahifani yopish bilan tugaydi. Server tokenni har bir admin so‘rovida mustaqil tekshiradi. Admin uchun 2 soatlik sessiya muddati backend tomonidan belgilangan.

## 2. Telegram nega javob bermasligi mumkin?

`.env` fayliga haqiqiy `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `OTP_HMAC_KEY`, `OTP_DELIVERY_ADAPTER=telegram` va PostgreSQL sozlamalarini kiriting. TOKENNI BOSHQA ODAMGA YUBORMANG.

```
cd backend
npm ci
npm run telegram:check
npm run telegram:worker
```

`telegram:check` tokenning botga mosligini, Telegram API aloqasini va webhook/polling to‘qnashuvini tekshiradi, lekin foydalanuvchi xabarini yetkazib berishni tekshirmaydi. Polling uchun `TELEGRAM_UPDATE_MODE=webhook` ishlatilmasin; webhook o‘rnatilgan bo‘lsa, uni oldin to‘g‘ri olib tashlash yoki webhook hosting rejimini sozlash kerak. Bir token bilan ikki worker ishlatmang. Server va worker **ikkalasi ham** doimiy ishlashi shart. Worker ketganda sayt ishlashi mumkin, bot esa jim qoladi.

`npm start` boshqa terminalda kerak. Migratsiyalarning ketma-ket qo‘llanganini va botda `/start`ga javob kelishini tekshiring. Admin `/admin` → Telegram bo‘limi sozlama va API aloqasi muammolarini ko‘rsatadi, worker tirikligini bevosita aniqlamaydi.

## 3. Xavfsizlik va hosting

Oldingi `.env`ni ZIPga qo‘shmang. Admin hisobini umumiy foydalanuvchilarga bermang. Saytni internetga joylashtirishdan oldin HTTPS, serverga doimiy worker, cheklangan CORS, xavfsiz admin paroli, ma’lumotlar bazasi backupi va real bron/Telegram end-to-end sinovlarini bajaring. Migratsiyalarni zaxira nusxadan keyin qo‘llang. JWT maxfiy kalitini o‘zgartirish barcha sessiyalarni bekor qiladi.

## 4. Tekshiruv natijalari

Frontend build va lint lokal muvaffaqiyatli. Tanlangan Telegram/admin testlari o‘tdi. Haqiqiy Telegram tokeni, doimiy worker, foydalanuvchi botga yozishi, haqiqiy PostgreSQL, real admin login va production server bilan E2E sinov bu muhitda bajarilmadi. Shuning uchun tizimni hali production-ready deb hisoblamang.
