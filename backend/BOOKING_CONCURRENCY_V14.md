# v14 — Mijoz va sartarosh bronlari uchun baza darajasidagi himoya

## Maqsad

**169-qaror:** mijozning bir nechta broni mumkin, ammo ularning faol vaqt oralig‘i hatto turli sartaroshlarda ham ustma-ust tushmasligi kerak. Oldin API mijoz profilining `FOR UPDATE` blokirovkasi orqali bunga harakat qilardi; v14 `bookings_customer_time_excl` PostgreSQL `EXCLUDE USING gist` cheklovini ham qo‘shadi. U to‘g‘ridan-to‘g‘ri SQL, kelajakdagi ishchi jarayonlar va bir vaqtning o‘zida kelgan so‘rovlarga ham taalluqli.

- Faqat `pending` va `confirmed` bronlar hisobga olinadi; `completed` va `cancelled` tarixdagi yozuvlar o‘chirilmaydi.
- `[)` interval ishlatiladi: 10:00–10:30 va 10:30–11:00 bir-biriga to‘qnashmaydi.
- Existing `bookings_active_time_excl` (sartarosh bo‘yicha) saqlanadi.
- `23P01` kelganda API `customer_time_conflict` yoki `booking_conflict` qaytaradi, SQL tafsilotlarini mijozga ko‘rsatmaydi.
- Legacy bron yaratishda kutilgan `409` xato paytida ham `ROLLBACK` bilan connection tozalanadi.

## Migratsiya: faqat operator ruxsati bilan

`backend/database/migrations/20261130_customer_time_overlap.sql` **hech qanday bazada avtomatik bajarilmaydi**. Undan oldin `20261129_booking_idempotency` bo‘lishi, `btree_gist` extension `public`da o‘rnatilgan bo‘lishi kerak. Baza backup’i, migratsiya markerlari va eski faol bronlarning to‘qnashuvi alohida tekshiriladi. Ziddiyatli tarixiy ma’lumot bo‘lsa, migratsiya xato bilan to‘xtaydi, mavjud bronlar o‘chirilmaydi. `ACCESS EXCLUSIVE` DDL blokirovkasi tufayli faqat maxsus maintenance oynasida foydalanish kerak. Migration/fresh bootstrap’ni bu vazifada **ishga tushirmadik**.

## Reproduksiya qilinadigan real PostgreSQL testi

`backend/test/bookingConcurrency.postgres.integration.test.js` mustaqil local test bazasida allaqachon tasdiqlangan v14 migratsiya mavjudligini tekshiradi. Baza nomi **aniq `ustara_test_db`**, rol **`ustara_account_test`**, TCP manzili faqat mahalliy bo‘lishi va rol superuser bo‘lmasligi shart. Test faqat o‘zi yaratgan account/service/booking yozuvlarini tozalaydi. Hech qanday migration yoki DDL qo‘llamaydi. Qat’iy ruxsat bayrog‘isiz `SKIP`.

```bash
# Faqat alohida o‘rnatilgan va tekshirilgan local test bazasi uchun,
# haqiqiy production URL’ni bu yerga qo‘ymang.
cd backend
NODE_ENV=test \
USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:LOCAL_TEST_PASSWORD@127.0.0.1:5432/ustara_test_db' \
node --test test/bookingConcurrency.postgres.integration.test.js
```

Ssenariylar: mijozning ikki sartaroshga ustma-ust broni, yonma-yon vaqtlarga ruxsat, `cancelled`dan `confirmed`ga o‘tish, ikkita mustaqil connection parallel INSERT, bronni xizmat bilan ko‘chirish, band vaqt va yangi narxdagi rollback.

**Hozirgi holat:** PostgreSQL serveri ishlamayotgani va foydalanuvchining test database migratsiyasiga alohida ruxsati bo‘lmagani sababli ushbu real DB testi bajarilmadi. `node --test` unit testlari PostgreSQL concurrency kafolatini isbotlamaydi.
