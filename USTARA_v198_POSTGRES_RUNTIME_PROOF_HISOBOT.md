# USTARA v198 — PostgreSQL runtime permission proof

## Maqsad
v197 dagi read-only bootstrap / CI evidence nazoratiga qo‘shimcha ravishda, haqiqiy concurrency integratsiya testi yozuvlar bajarishidan **oldin**, disposable PostgreSQL xizmatining identifikatori va rol huquqlarini mustaqil tekshirish.

## Kiritilgan o‘zgarishlar
- `backend/scripts/v198-postgres-runtime-proof.cjs`: v193 isolated test URL gate dan keyin `BEGIN READ ONLY` ichida katalog va server sozlamalarini tekshiradi.
- To‘g‘ri baza (`ustara_test_db`), foydalanuvchi va baza egasi (`ustara_account_test`), PostgreSQL 18, non-superuser/no-createdb/no-createrole/no-replication/no-bypassrls, TCP loopback server, `btree_gist` public schema va read-only holati talab qilinadi.
- Har qanday muvaffaqiyat/yoki xatoda tranzaksiya `ROLLBACK` qilinadi; maxfiy URL / parol logga chiqarilmaydi.
- `.github/workflows/v193-isolated-postgres-booking.yml`: yangi preflight bosqichi migratsiya tekshiruvlaridan keyin va yozuvchi concurrency testidan oldin ishlaydi; workflow hali ham **faqat manual** (`workflow_dispatch`).
- `backend/test/v198PostgresRuntimeProof.unit.test.js`: 6 ta yangi unit-test; jami 36 ta v198 unit-test muvaffaqiyatli.

## Tekshirish
```sh
cd backend
npm run test:v198:unit
```
Natija lokal muhitda: 36 passed, 0 failed.

## Cheklov
Ushbu lokal sinovda haqiqiy PostgreSQL serveriga ulanish qilinmagan. GitHub Actions disposable PostgreSQL ishini manual ishga tushirib, yakuniy integratsiya dalil faylini olish kerak. `LOYIHA TUGADI` hali tasdiqlanmagan.
