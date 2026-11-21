# v79 tekshiruv qo‘llanmasi

## Hozir offline ishga tushadigan sinovlar
```
cd USTARA-New/backend
npm run test:v79:unit
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
node --test test/*.test.js
```

## Faqat izolatsiyalangan lokal PostgreSQL va aniq ruxsat bilan
Birinchi navbatda alohida **ustara_test_db** test bazasini, `ustara_account_test` oddiy (superuser bo‘lmagan) roli bilan tayyorlang; barcha 42 migratsiyani test bazasiga qo‘llang. Testni real yoki mavjud foydalanuvchi ma'lumotlari bo‘lgan baza bilan **ISHGA TUSHIRMANG**. 

```
cd USTARA-New/backend
npm ci
NODE_ENV=test \
USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_TEST_DATABASE_URL='postgres://ustara_account_test:TEST_ONLY_PASSWORD@127.0.0.1:5432/ustara_test_db' \
npm run test:v79:db
```

`TEST_ONLY_PASSWORD` ni faqat yangi test bazasining maxfiy credentiali bilan almashtiring, uni gitga kiritmang. Testlar bazaning nomi, login roli va lokal ulanishini tekshiradi, test fixture yozuvlarini keyin o‘chirishga harakat qiladi; xato holatida manual audit zarur. PostgreSQL o‘rnatilmagan bo‘lsa yoki ruxsat yo‘q bo‘lsa `SKIP/NOT_RUN`, PASS emas. Avvalgi v78 DB testdagi 2 ssenariy va v79 dagi 2 yangi ssenariy shu buyruq bilan yuradi.

## Hali tasdiqlanmagan
Haqiqiy PG integratsiya, production Vite build, Chrome, GitHub Actions, Telegram va mobil qurilmalar: NOT_RUN. To‘liq backend test uchun barcha npm paketlari talab qilinadi.
