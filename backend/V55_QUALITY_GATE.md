# USTARA v55 — izolyatsiyalangan PostgreSQL CI va ishonchli release evidensiyasi

**Manba:** v54 ZIP (732 ta fayl). **Natija:** v55, 4-bosqich. **Production-ready EMAS.**

## Bajarilgan 5 ta ish

1. **Izolyatsiyalangan PostgreSQL sinov muhiti:** `.github/workflows/v55-verify.yml` faqat GitHub Actions'da bir martalik `postgres:18` service yaratadi, `ustara_test_db` va superuser bo‘lmagan `ustara_account_test` foydalanuvchisini tayyorlaydi. `btree_gist` sharti va 42 forward migratsiyali `bootstrap.sql` alohida konteynerdagi Unix socket orqali bajariladi. **Bu yerda ishga tushirilmagan — CI sozlangan, uning real natijasi hali yo‘q.**
2. **Backend+frontend haqiqiy npm muhitida QA:** CI lock fayllardan ikkala tomonda `npm ci`, to‘liq Node unit-testlar, `v54-staging.js` dagi **9 ta real PostgreSQL suite**, frontend unit-testlar va Vite production build'ni ketma-ket bajaradi. Biror buyruq muvaffaqiyatsiz bo‘lsa (`set -euo pipefail`), job to‘xtaydi; testlar `SKIP` bo‘lsa staging yashil emas.
3. **Haqiqiy TAP protokol tekshiruvi:** `backend/scripts/v40-staging.js` raqamlardan tashqari yagona TAP header, `1..N` reja va tartibli `ok` qatorlarini talab qiladi. Faqat yasama `# pass N` qatorlarini haqiqiy test deb qabul qilmaydi. v41/v43/v44/v45 oldingi mocklar moslashtirildi.
4. **Deterministik QR vaqt sinovi:** `v53QrFinalBoundaries.postgres.integration.test.js` vaqtdan qat’i nazar qayta ishlashi uchun `pg_sleep` o‘rniga testning o‘z izolyatsiyalangan tranzaksiyasi ichida QR muddati nazoratli eskirtiriladi. Dastlab token 10 daqiqaga yaroqli, keyin so‘nggi `UPDATE` oldidan bekor qilinadi. Tasodifiy kechikishga bog‘liqlik kamayadi; **haqiqiy PG bilan bu test hali ishlatilmagan**.
5. **Qat’iy release dalil tekshiruvi:** `v55-release-gate.js` haqiqiy backend/frontend TAP loglarini, **9 ta alohida PostgreSQL suite** natijasini, dist'dagi real JS assetini, **185 qaror** hashini va **42 migratsiyani** birgalikda talab qiladi. Ma’lumot yo‘q, xato yoki `SKIP` bo‘lsa `NOT PASS`. Hatto CI PASS bo‘lsa ham alohida Telegram live va mobil E2E bajarilmaguncha **productionReady=false**.

## Muhitdagi haqiqiy QA

- `npm run test:v55:unit`: **29 PASS / 0 FAIL**.
- `node --test test/*.unit.test.js` backend: **434 PASS / 26 FAIL**. 26 tasi `jsonwebtoken` (9), `express` (8), `bcrypt` (6), `pg` (3) paketlari yo‘qligi bilan bog‘liq.
- `node --test test/*.test.js` frontend: **178/178 PASS**.
- `node --test test/v54QrShopWorker.postgres.integration.test.js`: **1 SKIP**, real PG yo‘q; `v54-staging.js` opt-in bo‘lmaganda to‘g‘ri rad etiladi.
- `npm ci --offline`: **ENOTCACHED** (`xtend`); `npm run build`: **FAIL (`vite: not found`)**.
- 185 qaror CSV hash o‘zgarmagan; 42 forward migratsiya offline PASS; **CI hali bu suhbatda ishga tushirilmagan**.
- Telegram real sandbox va mobil brauzer E2E: **NOT_RUN**.

**Muhim:** GitHub Actions'ga kod joylashtirib, workflow ishga tushirib, PASS natijasini ko‘rmaguncha v55 izolyatsiyalangan PG testlari tasdiqlangan hisoblanmaydi.


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
