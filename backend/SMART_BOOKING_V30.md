# USTARA v30 — Smart Booking: bitta navbatga bitta faol taklif

**Status:** development, production-ready EMAS. Asos: v29 ZIP. Oldingi 1:00 OTP, Admin QR TTL 1–120min, 5min offer, 2min confirmation, multi-service va Telegram opt-in saqlanadi.

## Muammo va tuzatish

- v29 worker nomzod tanlashda `status='pending'` bo‘lgan taklifni chetlab o‘tar, lekin `accepted` taklifning 2 daqiqalik bron tasdiqlash oynasida **boshqa opening** uchun ayni navbatni yana taklifga olishi mumkin edi.
- **v30**: `smartBookingOffers.tick` endi `pending` **yoki** `accepted` taklifi bor `entry_id` ni yangi taklifga olmaydi.
- 40-chi forward migration `20261211_smart_booking_active_entry.sql` `smart_booking_offers(entry_id)` uchun status `IN ('pending','accepted')` bo‘lgan qatorlarda **UNIQUE partial index** yaratadi. PostgreSQL o‘zi nomuvofiq parallel yozuvni rad etadi.
- Migration avvalgi bir navbat uchun ikki faol taklif aniqlasa **atomic rollback** bilan to‘xtaydi. Qatorlarni o‘chirmaydi yoki tanlab bekor qilmaydi. Operatorda manual review talab qilinadi; production DBga bevosita qo‘llamang.
- Indeksdan oldin `SHARE ROW EXCLUSIVE` lock olinadi. Muvofiq ilova yozuvlarini to‘xtatish, backup va staging mavjudligi muhim. Migration qayta bajarilmaydi.

## Staging tekshiruv (ixtiyoriy, real PG kerak)

Avval alohida **lokal** `ustara_test_db` (ishlab chiqarish bazasi emas), superuser bo‘lmagan `ustara_account_test` roli va ko‘rib chiqilgan **40 ta migratsiya** kerak. `npm ci` talab qilinadi. Havola/parollarni faylga yoki ZIPga yozmang.

1. Migratsiyadan oldin stagingda ziddiyatlar bor-yo‘qligini **faqat o‘qib** tekshiring:

```sql
SELECT entry_id, count(*) AS active_offers
FROM smart_booking_offers
WHERE status IN ('pending','accepted')
GROUP BY entry_id
HAVING count(*) > 1;
```

2. Toza sinov bazasida migratsiyani operator oldindan ko‘rib chiqsin. Avvalgi markerlar bilan ishlaydigan upgrading jarayoniga alohida kiritiladi; `bootstrap.sql` faqat butunlay bo‘sh test schema uchun, mavjud bazaga emas.
3. Ma’lumotlarni **o‘zgartirmaydigan** 2-connection testni quyidagicha ishga tushiring:

```bash
cd backend
NODE_ENV=test \
USTARA_SMART_V30_DB_AUDIT=I_AUTHORIZE_READ_ONLY_TEST \
USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:TEST_PASSWORD@127.0.0.1:5432/ustara_test_db' \
npm run test:smart-booking:v30:db
```

Test: session user, superuser emasligi, `transaction_read_only=on`, `public` schema, migration marker, haqiqiy partial UNIQUE index (`pending`+`accepted`), 2 sessiya `pg_try_advisory_xact_lock` qachon o'tishi va rollbackda release. DBga INSERT/UPDATE/DDL qilmaydi; maxsus **manfiy** advisory key ishlatadi. Env bo‘lmasa `SKIP`.

**Bu haqiqiy claim/revoke/accept/confirm va double booking E2E emas**. Hali ikki sessiyali, izolyatsiyalangan fixture bilan biznes oqimlari, 5min/2min expiry, Telegram callback/polling, mobil E2E va to‘liq backend deps bilan test kerak.

## Offline test natijalari (2026-11-18)

- Tanlangan backend/audit + v30 read-only staging test: **66 PASS / 1 SKIP / 0 FAIL** (nested node subtests hisobga olingan).
- Backend barcha unit: **248 PASS / 26 FAIL** (`jsonwebtoken` 9, `express` 8, `bcrypt` 6, `pg` 3 - o‘rnatilmagan npm kutubxonalari). `npm ci --offline` ENOTCACHED bo‘ldi. FAIL koddagi biznes regressionni isbotlamaydi, lekin production QA o‘rnini bosmaydi.
- Frontend `node --test test/*.test.js`: **155/155 PASS**.
- Offline `node backend/scripts/audit-phase1.js`: **185 qaror / 40 migration PASS**; `node --check` v30 JS fayllari PASS.
- **Real PostgreSQL integration, haqiqiy Telegram API, mobil E2E, Vite build/lint: BAJARILMADI.**

**Qoidalar:** `.env`, credentials, `node_modules`, `dist`, JWT/API token ZIPga kiritilmaydi. Migratsiya faqat tekshirilgan staging va ongli operator tasdiqi bilan amalga oshiriladi.
