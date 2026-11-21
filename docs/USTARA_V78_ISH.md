# USTARA — so‘nggi checkpoint v78 (2026-11-19)

**Manba:** `USTARA-4-Bosqich-Price-Duration-Quote-Fence-v77.zip` (832 fayl).
**Bosqich:** 4; production-ready **EMAS**. Asl 185 qaror va 42 forward migratsiya saqlandi.

## Kod o‘zgarishlari
1. PostgreSQL deadlock (`40P01`) va serialization (`40001`) endi mavjud `booking_busy` (HTTP 409) xavfsiz qayta urinish javobiga aylanadi; `55P03` va `57014` ham saqlandi.
2. Xizmat holatini yashirish/qayta faollashtirish tranzaksiyasi vaqtinchalik PG xatolarini maxfiy DB tafsilotlarisiz qaytaradi.
3. Xizmat narxi/nomi/davomiyligini yangilashda shu retry boshqaruvi ishlaydi.
4. Xizmat tranzaksiyasida ROLLBACK muvaffaqiyatsiz tugasa, shubhali PostgreSQL ulanishi pool'dan chiqariladi (`release(true)`).
5. Bron yaratish va bronni ko‘chirish uchun bo‘sh slot so‘rovlari ham PG vaqtinchalik xatolarini to‘g‘ri xaritalaydi.
6. `v78RetryableTransactions.unit.test.js`: 25 ta yangi unit test, shu jumladan timeout, deadlock, serialization, rollback va maxfiy diagnostikani yashirish.
7. PostgreSQL’ga faqat **aniq ruxsat bilan** ishlaydigan mavjud concurrency integratsiya testiga 2 yangi ssenariy qo‘shildi: narx/davomiylik/arxiv snapshotlari hamda ikkita ulanishda xizmat qatorining bloklanishi. Testlar real PostgreSQL’siz *tasdiqlanmagan*.
8. `npm run test:v78:unit` va `npm run test:v78:db` skriptlari qo‘shildi; DB testi uchun `NODE_ENV=test`, `USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA`, `USTARA_TEST_DATABASE_URL` va paketlar kerak.

## Lokal natijalar
- Frontend: **278 PASS / 0 FAIL**.
- Yangi + tegishli backend unit: **69 PASS / 0 FAIL**, shundan **25 yangi**.
- To‘liq backend unit: **653 PASS / 26 FAIL**; 26 ta FAIL avvalgi `MODULE_NOT_FOUND` (npm paketlari o‘rnatilmagan) guruhidir.
- Real PostgreSQL, ikkita ulanishli sinovlar, frontend production build, Chrome, Telegram: **NOT RUN**.
- CSV `USTARA_185_NAZORAT.csv` SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- 42 forward + 2 rollback SQL: **byte-for-byte v77 bilan bir xil**.

## Keyingi bosqich v79
1. Izolatsiyalangan PostgreSQL test bazasida migratsiyalarni va ikkita real PG connection ssenariysini sinash.
2. Paketlarni o‘rnatib to‘liq backend testini ishlatish.
3. Keyin 185 talab ro‘yxatidagi boshqa funksional kamchiliklarga qaytish.
