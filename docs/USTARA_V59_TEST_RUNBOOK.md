# USTARA v59 — GitHub Chrome E2E va PostgreSQL tekshiruvlari

## 1. Lokal unit va audit
```bash
cd USTARA-New/backend
npm run test:v59:unit
npm test
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
npm test
```

`npm test` backendda bu offline muhitda 26 ta yetishmayotgan dependency sabab fail. Frontend Vite build `vite: not found`, local PostgreSQL yo‘q. Browser E2E testi default **SKIP** — atayin skip, PASS emas.

## 2. GitHub’da haqiqiy test (faqat alohida ephemeral DB)
1. GitHub repository `main` tarmog‘iga barcha v59 kod va workflow fayllarini yuboring. `.env`, JWT, Telegram bot tokeni, shaxsiy telefon/foydalanuvchi ma'lumotlari va production DB URLni commit qilmang.
2. Repo `Settings → Secrets and variables → Actions → Variables` da `VITE_API_BASE_URL` qiymatini **haqiqiy production HTTPS API origin** sifatida belgilang (misol sifatida `https://api.yourdomain.uz`); bunda username/parol/path bo‘lmasin. Bu faqat Vite build sozlamasi, real endpoint ishlashini tasdiqlamaydi.
3. GitHub Actions `USTARA v55 isolated verification` push/main uchun ishlaydi. Avval disposable `postgres:18` xizmatida 42 migratsiyani yaratadi va 9 real PG suite’ni ishga tushiradi. Keyin **alohida `ustara_login_test` non-superuser** bilan Chrome browser login E2E testini bajaradi (customer 390px, barber 1440px, admin).
4. `browser.tap` da 0 FAIL, 0 SKIP va uchta nested browser ssenariysi bo‘lishi shart. Release gate `release.json` ga `browserTests` sonini kiritadi. Browser testi bajarilmasa `releaseGate: NOT_VERIFIED` bo‘ladi.
5. `ci-summary.json` faylida faqat `browser:{status:'PASS',tests:N}`, backend/frontend test sonlari, PostgreSQL suite soni, commit/run attempt va hash bo‘ladi. Raw login/browser/test database loglari upload qilinmaydi.
6. Pages deploy faqat aniq `main` push/commit/run attempt uchun upstream CI `SUCCESS`, browser PASS va boshqa release shartlaridan keyin ishga tushadi. GitHub Actions real loglarini ko‘rib, **hamma** test green bo‘lmaguncha production deploy qilmang.

## 3. Brauzer testini lokal ishga tushirish (faqat ajratilgan test DB)
PostgreSQL’da bootstrap va barcha migratsiyalar alohida `ustara_test_db` ga tushgan, `ustara_login_test` non-superuser hisobda jadval testga yetarli vakolat borligi va Node.js/Vite/Chrome o‘rnatilgani tasdiqlangach:
```bash
cd USTARA-New/backend
NODE_ENV=test USTARA_LOGIN_E2E=1 \
 USTARA_LOGIN_WRITE_TESTS=I_AUTHORIZE_TEST_DATA \
 USTARA_TEST_DATABASE_URL='postgresql://ustara_login_test:LOCAL_TEST_ONLY@127.0.0.1:5432/ustara_test_db' \
 node --test test/login.browser.e2e.test.js
```
**Hech qachon production DB ma'lumotini USTARA_TEST_DATABASE_URL ga joylamang.** Test qat'iy `ustara_test_db`, `ustara_login_test` hamda loopback host shartlarini tekshiradi. Bu test faqat kirish/limit ssenariylarini qamraydi; Smart Booking, Telegram va umumiy mobil funksiyalarning barcha E2E sinovlari o‘rnini bosmaydi.

## 4. Status
- GitHub Actions **NOT_RUN**, PostgreSQL 9-suite **NOT_RUN**, browser login local **1 SKIP**, Vite build **BLOCKED**, real Telegram E2E **NOT_RUN**, haqiqiy mobil foydalanuvchi oqimlari **NOT_RUN**.
- Production-ready **YO‘Q**. Keyingi bosqich — repo ulanishi va real CI run loglarni tekshirish.
