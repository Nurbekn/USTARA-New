# USTARA — Mobile, sartaroshlar va profil yangilanishlari

## Ishlagan o‘zgarishlar

- **Mijoz bosh sahifasi**: mavjud haqiqiy bronlardan eng yaqin bo‘lajak bron chiqariladi; bron bo‘lmasa karta chiqmaydi. Mijoz kuzatayotgan sartaroshlar katalog boshiga chiqadi. Hech qanday soxta barber/bron avtomatik qo‘shilmaydi.
- **Soch stillari**: avvalgi `/images/haircut-views.webp` faylidan uch uslubning old, yon, orqa ko‘rinishlari bilan interaktiv galereya qaytarildi.
- **Xarita**: `Qidiruv → Xaritada ko‘rish`, shuningdek bosh sahifadagi xarita yorlig‘i. Haqiqiy barber koordinatalari asosida marker, marker ichidan profilga o‘tish; manzili bo‘lmagan barber xaritaga qo‘shilmaydi. Xarita uchun internet va OpenStreetMap tile serveri zarur.
- **Profil rasmi**: oldindan mavjud server API (`avatar_url`) va `ProfilePhotoSheet` ulab ochildi. Mijoz suratni almashtirishi yoki olib tashlashi mumkin.
- **Manzil**: avval noto‘g‘ri ko‘rsatilgan 'serverda saqlash mavjud emas' ogohlantirishi olib tashlandi, mavjud `PUT /api/customers/:id` manzil va koordinata saqlash API’si bilan ishlaydi.
- **Bildirishnomalar**: qo‘ng‘iroqcha oynasi tashqarisiga bosilganda yopiladi. Ammo haqiqiy notification backend/ro‘yxat hali qurilmagan.
- **Terminlar**: mijozning ko‘rinarli matnlarida “Ustalar” → “Sartaroshlar”, “Lenta” → “Ilhom”. Backenddagi API URL/ma’lumotlar strukturalari o‘zgarmadi.
- **Qidiruv**: salonlar hozircha navigatsiya variantlaridan olib tashlandi; API data modeli buzilmadi.
- **OTP**: `00:00` qayta yuborish imkoniyati paydo bo‘lganda ortiqcha ko‘rsatilmaydi; qayta yuborish cooldowni avvalgi server `resendAt` bo‘yicha hisoblanadi.
- **Reklama**: admin uchun `Reklama` bo‘limi, muddatli reklama qo‘shish/to‘xtatish API, muddati kelganda faollashish/tugaganda chiqmaslik. Home karta faqat haqiqiy aktiv reklama topilganda chiqadi va `Reklama` deb belgilanadi. Payment gateway yo‘q: joylashtirishni admin qo‘lda tasdiqlaydi.
- **Demo sartaroshlar**: faqat lokal development DB uchun 4 ta tasdiqlangan demo barber + xizmat + koordinata yaratish skripti. Kodda doimiy/parol umumiy qiymat yo‘q; parollar terminalda bir marta generatsiya qilinadi.

## Yangi database migration

`backend/database/migrations/20261123_admin_promotions.sql` — reklama jadvali. Frontend build uchun migration kerak emas, ammo admin orqali reklama ishlashi uchun kerak. Migratsiya eski bronlarni, mijozlarni yoki sartaroshlarni o‘chirmaydi.

Migratsiya oldidan DB backup oling, backend va worker’ni vaqtincha to‘xtating. Backend papkasida, *to‘g‘ri database tanlanganini tekshirib*:

```bash
sudo -u postgres pg_dump -Fc -d ustara_db -f /tmp/ustara_before_promotions.dump
sudo -u postgres psql -d ustara_db -v ON_ERROR_STOP=1 -f database/migrations/20261123_admin_promotions.sql
```

DB boshqa schema bo‘lsa yoki database nomi boshqacha bo‘lsa, yuqoridagi komandalarni ko‘r-ko‘rona ishlatmang.

## 4 ta demo barberni lokal DB’da tayyorlash

Bu **haqiqiy signup emas**, balki bir dona Telegram hisob bilan Barber/Customer rollarini tekshirish uchun development-only sinov akkauntlari. Haqiqiy foydalanuvchilar uchun OTP majburiyligiga hech qanday o‘zgartirish kiritilmagan. Demo skript quyidagi guardlarni tekshiradi: `NODE_ENV=development`, `DB_HOST=127.0.0.1|localhost|::1`, aniq `USTARA_ENABLE_DEMO_SEED` qiymati. Aks holda ishga tushmaydi. 4 ta test telefon `+998000000001` ... `+998000000004` faqat lokal testda ishlatiladi.

Backend `.env` to‘g‘ri sozlangan bo‘lsa, komanda:

```bash
cd backend
NODE_ENV=development USTARA_ENABLE_DEMO_SEED=YES_I_UNDERSTAND npm run demo:barbers
```

Bunda ma’lumotlar bazasiga 4 test hisob yoziladi, terminalda **har biri uchun alohida parol** chiqariladi. Parollarni hech kimga yubormang. Skript takror ishga tushirilsa, mavjud test raqamlari to‘qnashuvi sabab tranzaksiya bekor bo‘ladi. Ishlayotgan umumiy/production serverda ishlatmang. Demo hisoblar keyin admin orqali olib tashlanishi mumkin.

## Testlar (shu artefakt yaratilgan muhit)

- Frontend ESLint: o‘tdi.
- Frontend Vite production build: o‘tdi.
- Frontend profil/names unit: 3/3 o‘tdi.
- Backend Telegram OTP + login protection unit: 24/24 o‘tdi (Telegram botning eski 'Kod olish' matniga bog‘langan unit assertion yangi tekstga moslashtirildi).
- Backend reklama vaqt cheklovi unit: 2/2 o‘tdi.
- Yangi API `node --check` sintaksis tekshiruvlari: o‘tdi.

**Sinovdan o‘tmagan:** haqiqiy telefon/Telegram tokeni bilan jonli yuborish, mahalliy PostgreSQL integratsiyasi, foydalanuvchi va barberning real sahifalarda to‘liq E2E sinovi, production migration. Bu muhitda foydalanuvchining Postgres bazasiga ulanilmadi; tayyor production deb bo‘lmaydi.

## Hali bajarilmagan katta imkoniyatlar

1. **Telefon raqamini almashtirish**: hozirgi va yangi raqam Telegram kontakti bilan mustaqil tasdiqlanadigan to‘liq xavfsiz backend oqimi bu versiyada yozilmagan. Profil telefon sahifasi uni tayyor deb ko‘rsatmaydi.
2. **Haqiqiy bildirishnoma ro‘yxati**: qo‘ng‘iroqcha paneli yopilishi tuzatildi, lekin server bildirishnomalari API’si yo‘q.
3. **Reklama to‘lovi va billing**: admin boshqaradigan vaqtli reklama ishlashi uchun asos bor; onlayn to‘lov yo‘q.
4. **Demo uchun haqiqiy Telegram signup**: development-only seed mavjud; demo hisoblar OTP orqali ro‘yxatdan o‘tmagan.
5. **Production ishlash tekshiruvi**: server/baza/Telegram bilan alohida sinov zarur.

**Eslatma:** `.env`, `node_modules`, `.git` va qurilgan `dist` ZIP arxiviga kiritilmagan. `npm install` frontend va backend uchun alohida bajariladi. Oldingi ishchi loyihangizni zaxirada saqlang.
