# USTARA v94 — test qo‘llanmasi

Node 22+ bilan loyiha ildizidan:

```bash
node --test frontend/test/v94QueueMutationIntent.test.js
node --test backend/test/v94QueueOptimisticTransitions.unit.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
node backend/scripts/audit-phase1.js
```

`backend/test/*.unit.test.js` uchun avval `backend/` ichida **npm ci** bilan paketlar o‘rnatilishi lozim. Bu muhitda 26 ta dependency FAIL qoldi. `frontend/` uchun Vite build ham paketlar bilan alohida tekshiriladi.

## Haqiqiy PostgreSQL (faqat alohida test baza)

⚠️ Quyidagi test `users`, `barbers`, `walkin_queue`, `walkin_queue_events`ga **test yozuvlari qo‘shadi va keyin tozalaydi**. Faqat maxsus staging/test bazada, barcha migratsiyalardan keyin, test roli bilan, aniq ruxsat berilganda ishlating. Productionda ishlatmang.

```bash
cd backend
npm ci
NODE_ENV=test \
USTARA_V94_QUEUE_DB_TESTS=I_AUTHORIZE_TEST_DATA \
USTARA_TEST_DATABASE_URL='postgres://ustara_account_test:<test-password>@localhost:5432/ustara_test_db' \
node --test test/v94QueueOptimisticTransitions.postgres.integration.test.js
```

Qo‘lda ikki brauzer/qurilmada: A va B navbatga qo‘shish; birida qayta tartiblash, ikkinchisida eski birinchi mijozni chaqirish (`409 queue_changed`); ikkisi bir vaqtda bir xil birinchini chaqirganda bittasi replay; eski status bilan navbatni yakunlash rad qilinishi; noto‘g‘ri IDlar; internet uzilishi; sessiya almashishi; QR approval poygasi.

**Bu chat muhitida live PostgreSQL, Vite build, mobil Chrome/Telegram E2E va GitHub CI bajarilmadi.**
