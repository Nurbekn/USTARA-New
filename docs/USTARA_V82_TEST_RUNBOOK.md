# USTARA v82 — sinov ko‘rsatmasi

## Unit (Node 22+)
```bash
cd USTARA-New/frontend
npm run test:v82:unit
npm run test:unit
cd ../backend
npm run test:v82:unit
# To‘liq backend unit uchun ushbu muhitda o‘rnatilmagan paketlar avval npm ci orqali o‘rnatilishi kerak.
```

## PostgreSQL faqat tasdiqlangan test bazasida
Ushbu integratsiya testlari vaqtinchalik **test foydalanuvchilarini yaratadi va tozalaydi**. Production yoki umumiy bazaga ulash mumkin emas. Migratsiyalar avval maxsus test bazasida review va apply qilingan bo‘lishi kerak.
```bash
cd USTARA-New/backend
npm ci
export NODE_ENV=test
export USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA
export USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:...@127.0.0.1:5432/ustara_test_db'
npm run test:v82:db
```
Ssenariy: `booking_request_keys` uncommitted bo‘lgan paytda boshqa ulanish GET recovery orqali `{found:false,uncertain:true}` oladi; commitdan keyin GET bookingni topadi; ayni UUID bilan POST replay ikkinchi bron yaratmaydi. Buni **real PostgreSQL’dagi tekshiruvdan o‘tgan** deb belgilamang, toki run PASS bo‘lmaguncha.

## Brauzer E2E (hali bajarilmadi)
- Ikki marta tez submit (bir xil tanlov) faqat bitta POST.
- POST davomida tanlov o‘zgarsa eski Promise natijasi boshqa tanlovga qaytmaydi.
- Network loss → refresh → xuddi shu account+UUID bilan tiklash.
- JWT/akkaunt almashsa eski GET natijasi yangi account bronidek ko‘rsatilmaydi.
- `found:false,uncertain:true` javobidan keyin yangi slot avtomatik yuborilmaydi.
- Xato/401/503 GET natijalari brauzerda saqlanmasligi va eski booking so‘rovi bekor bo‘lmasligi.
