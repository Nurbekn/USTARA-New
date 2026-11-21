# v78 test qo‘llanmasi

## Paket talab qilmaydigan unit sinovlar
`cd USTARA-New/backend && npm run test:v78:unit`
`cd USTARA-New/frontend && node --test test/*.test.js`

## Izolatsiyalangan PostgreSQL — FAQAT RUXSAT BILAN
Faqat test maqsadidagi `ustara_test_db` va `ustara_account_test` oddiy rolini ishlating. Real foydalanuvchi maʼlumotlari yoki production ulanishini **ishlatmang**. Oldindan 42 migratsiya o‘rnatilgani va test rolining minimal ruxsatlari borligini tekshiring. Test faqat o‘zi yaratgan yozuvlarni tozalaydi; xatolikda qo‘lda audit zarur.

```
cd USTARA-New/backend
npm ci
NODE_ENV=test \
USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_TEST_DATABASE_URL='postgres://ustara_account_test:<TEST_ONLY_PASSWORD>@127.0.0.1:5432/ustara_test_db' \
npm run test:v78:db
```

PostgreSQL yoki npm dependency bo‘lmasa, **testlar PASS deb belgilanmaydi**. Mavjud testdagi `t.after` faqat shu test yaratgan account/booking/service ID’larini tozalaydi. Tanilgan test bazasi/rola mos bo‘lmasa test to‘xtashi kerak.
