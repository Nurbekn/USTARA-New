# USTARA v54 — QR ish vaqti, akkaunt va worker poygasi (2026-11-19)

**Asos:** v53 ZIP, 725 fayl. Bu v54 versiya USTARA 4-bosqichga qo‘shimcha xavfsizlik choralari; **production-ready EMAS**.

## Bajarilgan 5 ta ish

1. **QR akkaunt himoyasi:** QR bilan navbatga kirishda sartarosh profili va `users` yozuvi `FOR SHARE OF b,u` bilan tekshiriladi. Akkaunt o‘chirilayotgan paytda so‘rov uzilgan huquq bilan davom etmaydi. Qulf sartarosh advisory lock’idan oldin olinadi.
2. **QR oxirgi SQL vaqt chegarasi:** `UPDATE walkin_qr_tokens SET used_at` endi QR muddati bilan birga `ustara_effective_day_schedule` orqali **shu ondagi ish vaqtini** tekshiradi. Ish vaqti yopilgan bo‘lsa, `409 barber_closed` va `ROLLBACK`; QR eskirsa `410 qr_expired`.
3. **Smart Booking worker takroriy ishga tushishi:** worker dastlab muddati kelgan opening’ni o‘qigandan so‘ng advisory qulf kutib qolishi mumkin. Qulf olingach `AND clock_timestamp()>=next_check_at FOR UPDATE` qayta tekshiradi. Boshqa worker muddatni surgan bo‘lsa `raced`, muddatidan oldin taklif yo‘q.
4. **Haqiqiy PostgreSQL concurrency sinovi:** `v54QrShopWorker.postgres.integration.test.js` test uchun alohida schema yaratadi. Birinchi ssenariyda QR kiritilgandan keyin ish vaqti yopiladi va rollback tekshiriladi; ikkinchisida **ikki DB ulanishi**, advisory lock kutishi va `next_check_at` poygasi haqiqiy PostgreSQL’da tekshirilishi uchun yozilgan. Bu muhitda test `SKIP`.
5. **Qat’iy staging runner va regressiya:** `v54-staging.js` mavjud 8 suite ustiga 9-suite qo‘shadi; oldingi ruxsatlar ham kerak va har qanday `SKIP`/`FAIL` muvaffaqiyat deb olinmaydi. Yangi 8 ta unit test ham qo‘shildi; eski v50/v52 mock’lari haqiqiy SQL javoblariga moslashtirildi.

## QA — qayd qilingan natijalar

- Backend `npm run test:v54:unit`: **63 PASS / 0 FAIL**.
- Backend `node --test test/*.unit.test.js`: **429 PASS / 26 FAIL** (yetishmagan `express`, `pg`, `bcrypt`, `jsonwebtoken` va ularga bog‘liq kutubxonalar). **To‘liq backend PASS emas**.
- Frontend `node --test test/*.test.js`: **178 PASS / 0 FAIL**.
- Yangi haqiqiy PG suite: **0 PASS / 1 SKIP** (PostgreSQL server/driver yo‘q).
- Npm offline: `ENOTCACHED` (`xtend-4.0.2.tgz`); frontend build `vite: not found`.
- Staging ruxsatsiz ishga tushirish: **BLOCKED**, to‘g‘ri xavfsizlik natijasi.
- 185 qaror CSV SHA256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`, byte-for-byte o‘zgarmagan. **42 forward migratsiya** offline PASS, real DB migratsiya sinovi yo‘q.
- Real Telegram API, mobil E2E: **NOT_RUN**.

**Izoh:** testlar PostgreSQL’ning real ishlashini isbotlamaydi, toki 9 ta staging suite izolyatsiyalangan real baza bilan PASS bo‘lmaguncha.

# USTARA v54 — sinovlarni ishga tushirish yo‘riqnomasi

## Internetsiz bajariladigan sinovlar

`cd USTARA-New/backend && npm run test:v54:unit`

`cd USTARA-New/backend && node --test test/*.unit.test.js`

`cd USTARA-New/frontend && node --test test/*.test.js`

`cd USTARA-New/backend && node scripts/audit-phase1.js && node scripts/v45-decision-integrity.js`

## Haqiqiy PostgreSQL staging — faqat izolyatsiyalangan local test baza

`ustara_test_db` bazasi, superuser **bo‘lmagan** `ustara_account_test` session user va o‘rnatilgan `pg` talab qilinadi. Production/remote DB URL yoki `public` schema ishlatmang. `USTARA_TEST_DATABASE_URL` maxfiy qiymatni hech qachon commit, screenshot yoki chatga qo‘ymang.

Avval barcha eski va yangi staging ruxsatlarini alohida terminal muhitida o‘rnating:

- `NODE_ENV=test`
- `USTARA_TEST_DATABASE_URL` = lokal test URL (username `ustara_account_test`, DB `ustara_test_db`)
- `USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING`
- `USTARA_V46_STAGING=I_AUTHORIZE_LOCAL_STAGING`
- `USTARA_V49_STAGING=I_AUTHORIZE_LOCAL_STAGING`
- `USTARA_V53_STAGING=I_AUTHORIZE_LOCAL_STAGING`
- `USTARA_V54_STAGING=I_AUTHORIZE_LOCAL_STAGING`

`node backend/scripts/v54-staging.js` — oldingi 8 ta suite + yangi 9-suite, barcha PASS va **0 SKIP** talab qiladi. Avtomatik ravishda maxsus test-schema ruxsatlari (`USTARA_V54_DB_FENCE` va boshqalar) ajratiladi. Biron natija `SKIP`, `FAIL`, `ENOTCACHED` yoki test summary yetishmasa **release PASS emas**.

Alohida yangi PG ssenariyni o‘tkazish uchun yuqoridagi test muhitida `USTARA_V54_DB_FENCE=I_AUTHORIZE_EPHEMERAL_SCHEMA` bilan `node --test backend/test/v54QrShopWorker.postgres.integration.test.js` ishlatiladi. Test o‘zi yaratgan schema’ni himoyalangan cleanup bilan o‘chiradi. Baza ishlamasa `SKIP` PASS hisoblanmaydi.

## Hali qilingan emas

Backend npm paketlari to‘liq o‘rnatilmagan; frontend Vite build va mobil brauzer E2E o‘tmagan; Telegram real sandbox test o‘tmagan. **Production-ready NO.**
