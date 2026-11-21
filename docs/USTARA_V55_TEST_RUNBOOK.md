# USTARA v55 — testlar va avtomatik CI yo‘riqnomasi

## 1. Lokal unit-test (internet talab qilmaydigan qismi)

```
cd USTARA-New/backend
npm run test:v55:unit
node --test test/*.unit.test.js
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js

cd ../frontend
node --test test/*.test.js
```

Bu muhitda backend full suite uchun `express`, `jsonwebtoken`, `bcrypt`, `pg` o‘rnatilmagan; 26 ta fail mavjud. Bu testlarni `PASS` deb talqin qilmang.

## 2. GitHub Actions'ga yangi v55 kodini joylang

`.github/workflows/v55-verify.yml` repoga push yoki PR ochilganda va `workflow_dispatch` bilan ishga tushadi. GitHub Actions -> **USTARA v55 isolated verification** -> **Run workflow**. Ehtimoliy CI xatosida loglarni ko‘ring; muvaffaqiyatsizlikni yashirish yoki `SKIP`ga o‘zgartirish mumkin emas.

Job quyidagicha ishlaydi:
- GitHub'ning bir martalik Ubuntu runneri va `postgres:18` service.
- `npm ci` backend + frontend, `audit:phase1` va 185 qaror yaxlitligi.
- Faqat konteyner ichida bir martalik `ustara_test_db`, `ustara_account_test` va 42 migratsiyali `bootstrap.sql`; masofadagi yoki production DB ishlatilmaydi.
- Backend unit, frontend unit, `v54-staging` dagi barcha **9 real suite**, Vite build.
- `v55-release-gate.js` natijalarni jamlab, talab qilingan dalillarning barchasini tekshiradi.

GitHub xizmatining lokal test paroli **faqat shu job uchun ochiq sozlangan**; u real database paroli emas va takroran foydalanilmasligi kerak. Real maxfiy token, haqiqiy DB URL, Telegram bot tokenini gitga qo‘shmang. `git`/GitHub ishlatilmasa, foydalanuvchi o‘z kompyuterida PostgreSQL va npm tayyorlab testlarni qo‘lda ishga tushirishi mumkin.

## 3. Release gate

```
node backend/scripts/v55-release-gate.js <CI-log-katalogi>
```

`backend.tap`, `frontend.tap`, `staging.log`, `frontend/dist/index.html` va JS asseti kerak. Shu yo‘qligida gate `NOT PASS` bo‘ladi. Real PostgreSQL sinovi o‘tganligi faqat GitHub workflow logidagi tasdiqlangan 9-suitening natijasi bilan aniqlanadi.

## 4. Hali bajarilmaganlar

Haqiqiy PG sinovi: **SKIP** (bu muhitda), GitHub CI: **NOT_RUN**, frontend Vite build: **BLOCKED**, Telegram live: **NOT_RUN**, mobil E2E: **NOT_RUN**. **PRODUCTION-READY YO‘Q.**
