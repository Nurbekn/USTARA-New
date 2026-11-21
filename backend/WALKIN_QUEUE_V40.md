# USTARA v40 — navbatdagi rozilik va staging tekshiruvlari

## Nimasi o‘zgardi

- Telegram ulanishi uchun bir martalik invite `consumed_at IS NULL`, `expires_at>clock_timestamp()`, `q.status='waiting'` va Toshkentdagi bugungi navbat shartlarini **SQL ichida** tekshiradi; ilova tomondagi fail-closed qo‘shimcha tekshiruv ham saqlandi.
- 60 soniyalik qayta invite limiti PostgreSQL soati bo‘yicha chiqariladi (`AS rate_limited`).
- `/stopqueue` tegishli queue qatorini `FOR UPDATE OF q` bilan bog‘lashdagi lock tartibiga mos qulflaydi, so‘ng obunani o‘chiradi. Allaqachon Telegram tomoniga ketayotgan xabarni qaytarib bo‘lmaydi.
- ManualQueue amallari aynan boshlangan sessiya tokeni bilan yuboriladi; boshqa foydalanuvchi kirsa oldingi async natija yangi sahifaga taʼsir qilmaydi.

## Oddiy offline sinov

```bash
cd backend
npm run test:v40:unit
npm run audit:phase1
cd ../frontend
npm run test:unit
```

## Real staging — faqat maxsus lokal test baza, odam nazorati ostida

1. `backend` papkada `npm ci` to‘liq o‘rnatilgan bo‘lishi kerak. Alohida **ustara_test_db** bazasini va superuser bo‘lmagan **ustara_account_test** foydalanuvchisini yarating. Hech qanday production data bu yerda bo‘lmasin.
2. Staging bazaga oldingi 42 migratsiya rasmiy bootstrap tartibida qo‘llanganini tasdiqlang. Script **migratsiya bajarmaydi**, faqat jadvallar va `uncertain` check constraint borligini tekshiradi.
3. Quyi buyruq faqat test DB uchun; `.env`, token va parollarni chat/ZIPga kiritmang:

```bash
NODE_ENV=test USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING \
 USTARA_TEST_DATABASE_URL='<local test PostgreSQL connection URL>' \
 npm run test:v40:staging
```

Bu preflight database `ustara_test_db`, user `ustara_account_test`, local host, non-superuserligini tekshiradi. Keyin mavjud 5 ta PostgreSQL integratsiya faylini cheklangan test ishlarida chaqiradi. Har qanday xato — FAIL; productionga xavfsiz deb hisoblamang.

## Ochiq ishlar

- Real PG bilan v39 migratsiya, parallel accept/revoke, worker/outbox sinovlari
- Telegram API haqiqiy sandbox + webhook/callback E2E
- Frontend production `vite build`, `eslint` va mobil brauzer E2E
- npm paketlarini o‘rnatish, ishga tushmagan 26 backend suite'ni to‘liq tekshirish
- 185 qarorning to‘liq ishlab chiqarish dalillari (hozir statuslar dalil emas)

**Holat: production-ready emas.**
