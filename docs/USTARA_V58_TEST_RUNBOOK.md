# USTARA v58 — sinov va GitHub re-run yo‘riqnomasi

## Lokal (internet talab qilmaydigan unit/audit)
```bash
cd USTARA-New/backend
npm run test:v58:unit
node --test test/*.unit.test.js
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
node --test test/*.test.js
```

Backend to‘liq unit suite bu muhitda 26 ta o‘rnatilmagan kutubxona sabab fail. `npm ci` ishlaydigan va internetga ulana oladigan muhitda ularni tekshiring. PostgreSQL staging ssenariylarini faqat **ajratilgan, bo‘sh va maxsus test bazasida** ishlating; production database bilan aslo ulanmang.

## GitHub Actions’da real tekshirish
1. GitHub repository’da v58 ning **barcha fayllarini** commit qiling. Hech qanday `.env`, production DB URL, Telegram token, foydalanuvchi ma'lumotini push qilmang. Repo variables’da `VITE_API_BASE_URL` — haqiqiy public HTTPS API origin bo‘lsin.
2. GitHub → Actions → **USTARA v55 isolated verification** ni `main` dagi push bilan ishga tushiring. Bu PostgreSQL 18 disposable service, 42 migratsiya, backend/frontend, 9 PG integration suite va Vite build’ni tekshirishi kerak.
3. Workflow natijasi **SUCCESS** bo‘lsagina dalil `ustara-v58-ci-summary-<run ID>-<attempt>` ko‘rinishida kelishi kerak. Shunchaki summary mavjudligi SUCCESS degani emas; `releaseGate` tekshiriladi.
4. CI workflow’ni `Re-run jobs` qilsangiz artifact nomi yangi attempt bilan o‘zgarishi kerak. Pages yangi urinishning `workflow_run.run_attempt` qiymatini o‘zidagi evidence bilan solishtiradi, eski JSON qabul qilinmaydi.
5. Pages `deploy-pages.yml` faqat muvaffaqiyatli `main` push CI run’idan keyin aniq sha va API hash ni tekshiradi; Vite rebuild qiladi; **o‘zi yuklaydigan `frontend/dist`ni qayta audit qiladi**; undan keyingina GitHub Pages artifact upload bo‘ladi.
6. Pages’da e'lon bo‘lgandan keyin real brauzerda HTTPS API, CORS, QR navigatsiya, OTPlar va Smart Booking mobil oqimlari bo‘yicha alohida E2E bajarish zarur. Bu testlar ushbu v58 offline sessiyada **NOT_RUN**.

## Lokal Pages artifact validator
```bash
# dist oldindan haqiqiy Vite build natijasi bo‘lishi shart:
node USTARA-New/frontend/scripts/verify-pages-build.mjs USTARA-New/frontend/dist
```

Bu validator source map, `.env`, symbolic link, noto‘g‘ri 404, yo‘q JS asset kabilarni rad etadi. Biroq bu ham real API/brauzer E2E o‘rnini bosa olmaydi.

**Amaldagi cheklov:** real GitHub Actions NOT_RUN, PostgreSQL 1 SKIP, Vite build BLOCKED, Telegram/mobil E2E NOT_RUN; production-ready yo‘q.
