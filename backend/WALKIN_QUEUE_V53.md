# USTARA v53 — QR va taklifning so‘nggi yozuv chegaralari (2026-11-19)

**Asos:** v52 ZIP (717 ta fayl); loyiha qayta qurilmadi. 4-bosqich; **production-ready EMAS**.

## Bajarilgan 5 ta ish

1. **QR tokenni yakuniy iste’mol qilish:** so‘rov `INSERT`idan keyingi `UPDATE walkin_qr_tokens` ham `expires_at>clock_timestamp()` shartini tekshiradi. Chegara vaqtida tugasa butun tranzaksiya `ROLLBACK`, javob `410 qr_expired`; boshqa token nizosi `409 qr_used`.
2. **QR tasdiqlashning oxirgi chegarasi:** sartarosh tasdiqlashi (`approve`) paytida ish vaqti yopilsa, `UPDATE walkin_qr_requests ... RETURNING` yana jadvalni SQL ichida tekshiradi. Oldingi `walkin_queue` yozuvi ham rollback; rad etish (`reject`) ish vaqtiga bog‘lanmaydi.
3. **Smart Booking taklif yaratish:** worker nomzodni qidirayotganda slotning 5 daqiqalik chegarasi tugab qolsa, oxirgi `INSERT ... SELECT` `0 row` bo‘ladi, yangi taklif/Telegram outbox yaratilmaydi va opening yopiladi. SQL bugungi navbatni va `waiting` holatini ham tekshiradi.
4. **2 daqiqalik muddatni rejalashtirish:** taklif qabul qilingan vaqtdagi `smart_booking_offers.decided_at` asosida PostgreSQL `next_check_at=decided_at+interval '2 minutes'` hisoblaydi; oldinroq o‘qilgan JS vaqtiga tayanmaydi. Rad etish/cancel uchun DB `clock_timestamp()` ishlatiladi.
5. **Haqiqiy PG xavfsiz test tayyorgarligi:** `v53QrFinalBoundaries.postgres.integration.test.js` QR tokenning oxirgi yozuvda eskirishi hamda QR tasdiqlash davomida ish vaqti yopilishi va `ROLLBACK` uchun maxsus ephemerаl schema yaratadi; `v53-staging.js` eski 7 qat’iy SQL suite va yangi 8-suite’ni faqat aniq test opt-in bilan yuritadi. **Real PostgreSQL bu muhitda yo‘q: test `SKIP`, PASS emas.**

## Tekshiruv natijasi

- `npm run test:v53:unit`: **77/77 PASS** (v53 yangi 10 ta unit test, oldingi muhim testlar bilan).
- `node --test test/*.unit.test.js`: **421 PASS / 26 FAIL**; yiqilganlari oldingi `express`, `pg`, `bcrypt`, `jsonwebtoken` va ularga bog‘liq npm modullari mavjud emasligi bilan bog‘liq. Full PASS emas.
- `frontend: node --test test/*.test.js`: **178/178 PASS**.
- `node --test test/v53QrFinalBoundaries.postgres.integration.test.js`: **0 PASS / 1 SKIP** (real database mavjud emas).
- `npm run test:v53:staging`: opt-in yo‘qligi sabab to‘g‘ri **BLOCKED**; PostgreSQL, Telegram, mobil E2E **NOT_RUN**; Vite build **FAIL: vite not found**.
- 185 qaror CSV **SHA256 o‘zgarmagan**; 42 forward migratsiya offline audit **PASS**; yangi migratsiya yo‘q.

**Cheklov:** unit-test SQL ifodasi va rollback mock’ini tekshiradi, real PostgreSQL atomarligini isbotlamaydi. 185 qarorning barcha funksiyalari tayyor degani emas.

# USTARA v53 — QA / PostgreSQL xavfsiz runbook

## Mavjud muhitda ishlaydigan testlar

```bash
cd backend
npm run test:v53:unit
node --test test/*.unit.test.js
node scripts/v45-decision-integrity.js
node scripts/audit-phase1.js
node scripts/decision-coverage.js
# Real PostgreSQL yo'q bo'lsa test 1 SKIP (PASS emas):
node --test test/v53QrFinalBoundaries.postgres.integration.test.js
cd ../frontend
node --test test/*.test.js
npm run build
```

Backenddagi 26 dependency fail va `vite: not found` to'siqlari hal qilinmaguncha FULL PASS deb hisoblamang. Internet mavjud muhitda backend va frontend uchun `npm ci` bilan lockfile paketlarini o'rnating; ZIP ichiga `node_modules`, `.env` yoki token qo'shmang.

## Izolyatsiyalangan PostgreSQL (faqat maxsus test DB)

- Faqat `ustara_test_db`, localhost/loopback va `ustara_account_test` cheklangan session user'i; production ma'lumotlarini ishlatmang.
- `NODE_ENV=test`, `USTARA_TEST_DATABASE_URL` va zarur aniq opt-in'lar: `USTARA_V40_STAGING=I_AUTHORIZE_LOCAL_STAGING`, `USTARA_V46_STAGING=I_AUTHORIZE_LOCAL_STAGING`, `USTARA_V49_STAGING=I_AUTHORIZE_LOCAL_STAGING`, `USTARA_V53_STAGING=I_AUTHORIZE_LOCAL_STAGING`.
- Ishga tushirish: `cd backend && npm run test:v53:staging`. Test boshqa schema yaratish huquqini faqat shu maxsus DBda olsin. `SKIP`, timeout yoki xato bo'lsa runner muvaffaqiyatli deb hisoblamaydi.
- Yangi v53 integratsiya testi ikki holatni tekshiradi: QR token `INSERT`dan keyin, so'nggi `used_at` yozuvidan oldin tugashi (request/used_at rollback); QR `approve` paytida jadval yopilishi (yaratilgan navbat/audit ham rollback).
- Bu test ephemerаl schema yaratadi, test oxirida o'ziga tegishli schema'ni tashlaydi; boshqa app jadvallariga tegmaydi.

## Release oldidan qolganlar

Real parallel bronlar/QR expirаtion integratsiyasi; Telegram test bot E2E; mobil brauzer E2E; Vite production build va lint; barcha dependencies bilan to'liq backend suite. **Production deploy uchun hali ruxsat yo'q.**
