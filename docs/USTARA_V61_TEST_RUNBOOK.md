# USTARA v61 — test va CI ishga tushirish yo‘riqnomasi

## 1. Mahalliy statik/unit sinovlari

```bash
cd USTARA-New/backend
npm ci
npm run test:v61:unit
npm test
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
npm ci
npm test
npm run build
```

Mahalliy test jarayonida npm paketlarining bir qismi mavjud emas. `npm ci` uchun internetli muhit talab qilinadi. Bu containerda PostgreSQL serveri yo‘qligi uchun **real DB integratsiya testlari bajarilmagan**.

## 2. GitHub Actions’da haqiqiy sinov

- GitHub repository’ning `main` tarmog‘ida v61 kodini, `.github/workflows/v55-verify.yml` va `deploy-pages.yml`ni yuklang. `.env`, haqiqiy DB URL, bot tokeni, JWT maxfiy kalitini yuklamang.
- `Settings → Secrets and variables → Actions → Variables` bo‘limida `VITE_API_BASE_URL`ni haqiqiy HTTPS API origin sifatida o‘rnating (masalan nomi sifatida, lekin `localhost` emas). Siz belgilagan real domen ishlashi kerak.
- GitHub Actions → **USTARA v55 isolated verification** natijasini tekshiring: `npm ci`, alohida PostgreSQL service va 42 migratsiya, backend/frontend unit, 9 DB suite, Chrome login E2E, Vite build va release evidence gate.
- Chrome buyrug‘i `google-chrome`, `chromium` yoki `chromium-browser`ni aniqlaydi. Chrome faqat local CDP’dan foydalanadi. Mobil 390px, desktop 1440px va admin login holatlari real HTTP/PostgreSQL bilan sinovdan o‘tishi shart.
- `releaseGate=PASS`, `browser.tests=4`, `postgres.suites=9` va sha/run-attempt mos kelmasa, Pages deploy e’lon qilinmasin.
- CI yoki E2E **NOT_RUN/SKIP** bo‘lsa, `PASS` deb hisobot bermang. Test faqat `ustara_test_db` uchun, production bazasi bilan sinov o‘tkazmang.

## 3. Qolganlar

Real PostgreSQL/Telegram API, mobil E2E va brauzer UX sinovlari, xavfsizlik tekshiruvi, deployment va funksional audit. Offline 185 qaror tekshiruvi 185 funksiya tayyorligini anglatmaydi. **Production-ready EMAS.**
