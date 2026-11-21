# USTARA v112 — kalendar o‘qish maxfiyligi va izchil snapshot

**Manba:** v111 (1014 fayl). **Qaror #153:** hali qisman. **Production-ready: YO‘Q**.

## Tekshirilgan o‘zgarishlar

1. `GET` kalendar istisnolari faol `users.id` va tasdiqlangan `barbers.id` juftligi bilan tekshiriladi; eski `req.user.profileId`ga to‘liq ishonilmaydi.
2. `GET` tanaffus qoidalari xuddi shu server-side owner/active tekshiruviga o‘tdi.
3. Har ikkala o‘qish `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` bilan amalga oshadi.
4. Haftalik va sanaga oid tanaffuslar **bitta Pg client va bitta snapshot** ichida ketma-ket o‘qiladi; `Promise.all(database.query)` ishlatilmaydi.
5. Sana filtrlari o‘qishda `transaction_timestamp()` (Asia/Tashkent) ishlatadi: bir so‘rovdagi natijalar kun almashishida bir xil sana asosida qoladi.
6. O‘qishlar barber advisory mutex'ini olmaydi — navbat, QR va ish kunini yopish yozuvlarini keraksiz kutdirmaydi.
7. Rol, profil ID va user ID noto‘g‘ri bo‘lsa DB ulanmasdan rad etiladi; o‘chirilgan yoki boshqa hisobga tegishli profilga ruxsat yo‘q.
8. O‘qish xatolari maxfiy SQL ni oshkor qilmaydi, xatolar va natijalarda `Cache-Control: no-store` saqlanadi.
9. `ROLLBACK` yoki `COMMIT` muammosi yoki transport SQLSTATE 08 kelganda ishonchsiz Pg client pool'dan chiqariladi.
10. Mahalliy read-only PostgreSQL tekshiruvi uchun **operator roziligi talab qilinadigan** skript va unit sinovlar qo‘shildi.

## Testlar (mavjud muhit)

```sh
cd backend
npm run test:v112:unit
# 71 PASS / 0 FAIL (yangi 23 ta va oldingi tegishli testlar)

npm run test:unit
# 1254 PASS / 26 FAIL (oldingi 26 ta dependency xatosi aynan saqlangan)
```

Frontend 902/902 PASS. 185 qaror va 45 forward + 2 rollback migratsiya offline audit PASS. PostgreSQL real, Chrome, Vite va Telegram E2E **NOT_RUN**.

## Ixtiyoriy real PostgreSQL read-only tekshiruv

Faqat **mahalliy** `127.0.0.1:5432/ustara_test_db`, `ustara_account_test` nomli **superuser bo‘lmagan** foydalanuvchi, barcha 45 migratsiya qo‘llangan test bazasi va operatorning aniq roziligi talab etiladi. Ishlab turgan production bazaga ulangmang.

```sh
cd backend
npm ci
export NODE_ENV=test
export USTARA_TEST_DATABASE_URL='postgres://ustara_account_test:<PASSWORD>@127.0.0.1:5432/ustara_test_db'
export USTARA_V112_SCHEDULE_DB_READINESS=I_AUTHORIZE_READ_ONLY_TEST
npm run test:v112:db:readiness
```

Skript hech narsani yozmaydi: test bazasi roli/sxemasini, 45 migratsiya ledger'ini, uchta jadvalni `LIMIT 0` bilan o‘qish huquqini, tranzaksiya rejimini va ikki tranzaksiyadagi advisory lock ketma-ketligini tekshiradi. Yozuvchi bron/QR/day-close tranzaksiyalarining haqiqiy race sinovi **alohida kerak**; bu skriptni bunday E2E test deb hisoblamang.

**V113 uchun:** npm paketlarini ruxsatli internetli CI/muhitda `npm ci` bilan o‘rnating, mavjud 26 testni qayta bajaring, real PostgreSQL yozuvchi tranzaksiyalari va brauzer build/E2E ni tekshiring.
