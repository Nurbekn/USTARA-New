# USTARA v98 — test yo‘riqnomasi

## Offline

Loyiha ildizidan:

```bash
npm --prefix backend run test:v98:unit
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
```

Frontend build bu muhitda `vite: not found` bilan bloklandi. Keng backendda paketlar o‘rnatilmagan bo‘lsa 26 ta MODULE_NOT_FOUND test FAIL hisoblanadi. Paketlar `npm ci` orqali o‘rnatilgach qayta sinov zarur.

## Izolyatsiyalangan test DB — faqat mutaxassis tomonidan ruxsat bilan

- **Hech qachon haqiqiy foydalanuvchi yoki production DB’da bajarmang.** `ustara_test_db` uchun maxsus `ustara_account_test` rolini yarating. 44 migratsiyani avval disposable bazada alohida ko‘rib chiqing.
- DB sinovlari `NODE_ENV=test`, `USTARA_TEST_DATABASE_URL` va `USTARA_V96_QUEUE_DB_TESTS=I_AUTHORIZE_TEST_DATA` bo‘lgandagina ishlaydi.
- Parollarni hujjatga yoki commitga kiritmang.

```bash
export NODE_ENV=test
export USTARA_TEST_DATABASE_URL='<LOCAL_DISPOSABLE_TEST_DB_URL>'
export USTARA_V96_QUEUE_DB_TESTS='I_AUTHORIZE_TEST_DATA'
npm --prefix backend run test:v98:db
```

Sinov eski kunni yaratish uchun faqat o‘zining yangi test barber/ticket yozuvlarini o‘zgartiradi va cleanup qiladi. v98 ish muhitida **1 SKIP / 0 PASS**, real DB natijasi yo‘q.

## E2E

`npm ci` frontendda va backendda bajarilgach Vite build, mobil Chrome, server/API va QR navbat oqimini qo‘lda/avtomatlashtirib tekshiring. Production-ready xulosasi uchun real holat natijalari majburiy.
