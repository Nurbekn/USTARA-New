# USTARA v108 — xavfsiz sinash qo‘llanmasi

**Qoida:** hech qachon ishlab chiqarish bazasiga script ulanmang. Readiness foydalanuvchi maʼlumotlarini o‘zgartirmaydi, migratsiya o‘rnatmaydi. `USTARA_TEST_DATABASE_URL` faqat **127.0.0.1:5432/ustara_test_db**, `ustara_account_test` non-superuser bilan. 45 migratsiya avval alohida izolyatsiyalangan test muhitida qo‘llangan bo‘lishi shart.

## Offline unit test

```sh
cd backend
npm run test:v108:unit
cd ..
node --test frontend/test/*.test.js
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
```

## Haqiqiy PostgreSQL read-only preflight (faqat lokal test bazasida)

Quyidagi tekshiruv ixtiyoriy. `pg` npm paketi va izolyatsiyalangan lokal PostgreSQL bo‘lmaganda bu **NOT_RUN** deb qayd etiladi, PASS emas. `postgres` parolini shell historyga kiritmaslik uchun test ulanish maʼlumotini xavfsiz muhitdan oling.

```sh
cd backend
NODE_ENV=test USTARA_V108_DAY_CLOSE_READINESS=I_AUTHORIZE_READ_ONLY_TEST \
 USTARA_TEST_DATABASE_URL="$USTARA_TEST_DATABASE_URL" npm run test:v108:db:readiness
```

Read-only query tekshiruvlari: migration ledger 45, `barber_day_closures`, `barber_day_close_events`, PK, CHECK, unique audit, `ustara_effective_day_schedule` day closure fence. Ikki READ ONLY tranzaksiyada `pg_try_advisory_xact_lock` bir xil ID bo‘yicha 2-chi yozuvchining bloklanishi va rollbackdan keyin ochilishi tekshiriladi. Har qanday muammo `NOT_PASS` bilan tugaydi.

## Hali bajarilmagan release-gate

Alohida test DB’da haqiqiy yozuvchi tranzaksiyalar: bron yaratish/QR tasdiqlash/close same barber, 23:59→00:00 holati, idempotency/revision, rollback/audit atomikligi. Mobil brauzer, Vite build va Telegram integratsiyasi ham tekshirilmaguncha production deploy qilmang.
