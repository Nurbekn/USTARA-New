# USTARA v20 — bo‘sh slot maxfiyligi va parallel bron/kalendar sinovlari

## Kod o‘zgarishi
- `controllers/bookingsController.js`: public `GET /api/bookings/available-slots` endi **customer va guestga** faqat bo‘sh slotlarni beradi; `busy` oralig‘i faqat `req.user.role=barber` va `req.user.profileId=barber_id` bo‘lgandagina yuboriladi. Boshqa barber yoki Admin ushbu ommaviy so‘rovdan band bron intervallarini ko‘ra olmaydi. Bron yaratish/ochilgan slot logikasi o‘zgarmadi.
- `test/bookings.unit.test.js`: customer/guest/other barber/admin maxfiyligini, egasi ko‘rishini va band slotni baribir taklif qilmaslikni test qiladi.
- `test/bookingConcurrency.postgres.integration.test.js`: test **real, alohida va lokal** PostgreSQL bazasida v19 migration/function borligini tekshiradi; mavjud bronga zid weekly/dated tanaffusni ROLLBACK qiladi, safe break slotga tatbiq etilishini tekshiradi; parallel weekly-break update va booking-move natijasida ikkalasi bir paytda noto‘g‘ri COMMIT bo‘lmasligini tekshiradi.

## Real DB testi (faqat ruxsat berilgan test muhitida)
Test **avtomatik ishlamaydi**. Operator alohida `ustara_test_db` bazasi va tegishli non-superuser `ustara_account_test` rolini yaratishi, migrationlarni o‘sha **test bazada** qayta tekshirishi kerak. Production bazasida ishga tushirmang. Test foydalanuvchi/booking fixturelarini faqat o‘zi yaratgan IDlar bo‘yicha o‘chiradi; DB migratsiyasini yoki schema DROP ni ishga tushirmaydi.

```bash
cd backend
NODE_ENV=test \
USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:TEST_PASSWORD@127.0.0.1:5432/ustara_test_db' \
npm run test:booking:db
```

`TEST_PASSWORD` bu hujjatdagi **placeholder**, haqiqiy kalit emas. Muhim talablar: loopback host, `ustara_test_db` nomi, non-superuser, avvaldan qo‘llangan v19 migratsiyalari, `public` jadvaliga test rolining faqat zarur ruxsatlari. Real testdan oldin alohida snapshot/backup oling.

## Natijalar (2026-11-18)
- Backend: **368/368 unit PASS**. Frontend: **143/143 unit PASS**, production frontend build **PASS**.
- Integratsiya testi shu muhitda `SKIP`: PostgreSQL server yo‘q; DB o‘rnatish uchun paket manbai javob bermadi. **Real PostgreSQL, parallel tranzaksiyalar va 32-migratsiya amalda tasdiqlanmadi.**
- v20 yangi migratsiya talab qilmaydi; reyestr **185 qaror/32 migration** saqlangan.
- Browser E2E/Telegram real API hali o‘tkazilmadi. Production-ready emas.
