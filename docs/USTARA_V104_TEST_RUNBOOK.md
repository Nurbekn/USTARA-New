# USTARA v104 — test qo‘llanma

## Offline sinov (server kerak emas)
```bash
cd USTARA-New/backend
npm run test:v104:unit
npm run audit:phase1
npm run v45:decisions
node --test test/*.unit.test.js
cd ../frontend
npm run test:unit
```

## Faqat alohida va ruxsatli PostgreSQL test bazasi

O‘rnatilmagan kutubxonalar bo‘lsa, internet ochiq va paketlar o‘rnatilishi ruxsat etilgan muhitda `npm ci` ni `backend/` va `frontend/`da bajaring. Real PostgreSQL bu arxiv yaratilgan muhitda mavjud emas edi.

`npm run test:v104:db` faqat quyidagilar bilan ishlaydi:
- `NODE_ENV=test`
- `USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA`
- `USTARA_TEST_DATABASE_URL` — faqat mahalliy, alohida, atay yaratilgan `ustara_test_db` va maxsus `ustara_account_test` foydalanuvchisi

Test mavjud 44 migratsiya va ruxsatlarni talab qiladi; faqat test o‘zi yaratgan fixture yozuvlarini olib tashlaydi. **Production URL, real mijozlar bazasi va production credentials’ni bermang.** Reja real DB sinovidan keyin yana baholanadi. PG test fixture mavjud bo‘lmasa NOT_RUN/SKIP, hech qachon PASS emas.

### Kutiladigan qamrov
- Ikki customer ID bilan o‘zgartirish quote so‘rovini rad etish.
- O‘z broniga ruxsatli GET, boshqa broniga `404` va boshqa account/profile pairing uchun `401`.
- Read-only GET operatsiyasi eski booking, narx yoki statusni o‘zgartirmasligi.
- App HTTP GET javobida `Cache-Control: no-store`.

## Keyingi integratsiya
- Frontend `npm run build` (Vite), test browser E2E, haqiqiy ko‘chirish PATCH/rollback va parallel user transactions. Bular **bu muhitda tekshirilmagan**.
