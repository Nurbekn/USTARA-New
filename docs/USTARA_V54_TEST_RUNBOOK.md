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
