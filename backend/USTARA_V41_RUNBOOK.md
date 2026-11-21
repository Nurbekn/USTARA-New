# USTARA v41 — staging, dependencies va xabar yetkazish operatsiyalari

## Oldindan tayyorgarlik

Testlarni real production bazada bajarmang. Avval alohida **127.0.0.1** test PostgreSQL serveri, `ustara_test_db`, superuser bo‘lmagan `ustara_account_test`, migratsiya 1–42 qo‘llangan bazani tayyorlang. Parollarni terminal loglariga va ZIPga yozmang.

```bash
cd backend
npm ci --no-audit --no-fund
npm run v41:readiness
npm run test:v41:unit
npm test
cd ../frontend
npm ci --no-audit --no-fund
npm run test:unit
npm run build
npm run lint
```

**Muhim:** muhitda npm install to‘liq tugamagan; `v41:readiness` exit=1 bilan BLOCKED ko‘rsatishi xato yashirilmagani demak. Bajarilmagan buildni PASS deb belgilamang.

## Faqat alohida test DB uchun staging

Staging test uchun quyidagi sozlamalar faqat ruxsatli lokal test muhitida o‘rnatiladi (maxfiy parollarni terminal tarixida oshkor qilmang):

- `NODE_ENV=test`
- `USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING` (v40 flag v41da backward compatible)
- `USTARA_TEST_DATABASE_URL`: 127.0.0.1 dagi `ustara_test_db`, login `ustara_account_test`

`cd backend && npm run test:v41:staging`. Runner read-only preflight, migratsiya/constraint tekshiruvi va 5 test faylini ishga tushiradi. Test `SKIP` bo‘lsa yoki test bo‘lmasa **FAIL**. Oldingi v40 runner nomi bilan bir xil ruxsat nazorati saqlangan. Real DB testlari shunchaki script mavjudligi bilan o‘tdi deb aytilmaydi.

## Telegram delivery holatini o‘qish

`cd backend && npm run v41:telegram:health` bilan `queue` va `smart_booking` outbox uchun faqat umumiy `pending/failed/uncertain/lease` sonlari ko‘rsatiladi. Workerga qo‘ng‘iroq qilinmaydi; bu buyruq **hech qanday xabar yubormaydi yoki qayta urinish yaratmaydi**. `uncertain` bo‘lsa operator qo‘lda ko‘rib chiqadi — aynan bir marta yetkazishni Telegram API kafolatlamaydi.

Haqiqiy brauzer, xabar, PG concurrency va release smoke sinovlarini alohida o‘tkazing. SQL migratsiya v41 uchun qo‘shilmagan; `42` ta holat saqlangan. 185 qarorlar reyestri o‘zgarishsiz. **Production-ready emas**.
