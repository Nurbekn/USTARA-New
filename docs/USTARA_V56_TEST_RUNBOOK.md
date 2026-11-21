# USTARA v56 — GitHub Actions va Pages deploy test yo'riqnomasi

## Lokal offline tekshiruv

```bash
cd USTARA-New/backend
npm run test:v56:unit
node --test test/*.unit.test.js
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js

cd ../frontend
node --test test/*.test.js
```

Bu muhitda backenddagi 26 xato `express`, `jsonwebtoken`, `bcrypt`, `pg` paketlari yo'qligi sabab; qayta tekshirish uchun avval ikkala paket lock faylidan `npm ci` ishlashi zarur. `npm ci --offline` bu yerda `ENOTCACHED`, build esa `vite: not found`. PostgreSQL real testlar **SKIP**.

## GH Actions uchun bir martalik ishga tushirish

1. ZIP'ni GitHub repository'ga `USTARA-New` loyiha ildizidagi `.github`, `backend`, `frontend`, `docs` bilan o'zgarish sifatida joylashtiring; GitHub repo tarkibi mos ekanini tekshiring.
2. GitHub → Actions → **USTARA v55 isolated verification** workflow. `main`'ga push qiling (yoki PR'da testni oldindan ko'ring). Pull request yoki qo'lda `Run workflow` bosilgan testlar **saytni deploy qilmaydi**; faqat muvaffaqiyatli `push main` run deployga ruxsat beradi.
3. CI `npm ci` va real PostgreSQL `postgres:18` test DB, **42 forward migratsiya**, backend/frontend unit, **9 PG suite**, Vite build hamda release evidence gate'ni o'tkazishi kerak. Barcha bosqich PASS bo'lmaguncha deploy bo'lmaydi.
4. CI job yakunida `ustara-v56-ci-summary-<run_id>` nomli **faqat redacted JSON** artifact chiqadi; u `PASS`/`NOT_VERIFIED`, test soni, build statusini ko'rsatadi. Loglarni GitHub UI orqali tekshiring, raw loglarni ochiq tarqatmang.
5. GitHub → Settings → Pages: **Source: GitHub Actions**. `VITE_API_BASE_URL` repository variable haqiqiy HTTPS API manziliga sozlangan bo'lishi kerak. Pages server emas: backend/DB alohida.
6. CI ning aynan o'sha `main` commit'i `success` bo'lgach **Deploy verified frontend to GitHub Pages** o'zi ishga tushadi. Agar yangi commit chiqsa, eski run SHA tekshiruvida rad etiladi.
7. Kengroq chiqarishdan oldin branch protection va `github-pages` environment uchun zarur tasdiqlash/ruxsat siyosatini ko'rib chiqing. Telegram va mobil E2E hali alohida o'tishi zarur.

## Muhim xavfsizlik chegaralari

- GitHub'ga production `DB_PASSWORD`, `.env`, Telegram token, real user data, test bazasining katta backup'ini yuklamang.
- CI ishlatayotgan DB `ustara_test_db` va test roli `ustara_account_test` — real baza emas. `workflow_dispatch` sinovi Pages deployment'i emas.
- `workflow_run` asosidagi Pages zanjiri yordamchi himoya, haqiqiy barcha audit natijalarining o'rnini bosmaydi.
- Real GitHub CI hali ushbu sessiyada ishlamagan; natijasini **NOT_RUN** deb hisoblang.
