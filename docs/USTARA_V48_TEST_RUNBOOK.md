# USTARA v48 — test va integratsiya yo‘riqnomasi

1. Node va paketlar tekshiruvi: `cd backend && npm ci`; `cd ../frontend && npm ci` (tarmoq va ruxsat talab qilinadi). Token va `.env` faylini ZIP ichiga qo‘shmang.
2. Unit: `cd backend && npm run test:v48:unit` (bu muhitda 47 PASS); `npm run test:unit` (bu muhitda 387 PASS + 26 dependency FAIL).
3. UI: `cd frontend && npm run test:unit` (175/175 PASS); `npm run build`; `npm run lint` (kutubxonalar o‘rnatilgandan keyin).
4. PostgreSQL: faqat mahalliy, alohida va hech qanday haqiqiy mijoz maʼlumoti bo‘lmagan test bazasi; `backend/scripts/v46-staging.js` talab qiladigan aniq opt-in va DB nomlari bilan ishga tushiring. `SKIP` natijasini PASS sifatida qabul qilmang. Barcha 42 migratsiya amalda qo‘llanganini oldin tekshiring.
5. Real sinovlar: worker va cancel bir vaqtda, bitta taklifning expiry/reject/cancel/replay holatlari, Telegram `sending/sent/uncertain` ACK poygasi, frontend mobil browser E2E. **Exactly-once kafolati mavjud emas.**

**Diqqat:** ushbu versiyadagi unit testlar SQL buyruq tartibini mock bilan tekshiradi; real PostgreSQL tranzaksiya izolyatsiyasi hali sinovdan o‘tmagan. Real botga test chatdan boshqa chat bilan ishlamang.
