# USTARA v57 — GitHub Actions, Pages va API provenance test yo‘riqnomasi

## Lokal unit va offline audit

```bash
cd USTARA-New/backend
npm run test:v57:unit
node --test test/*.unit.test.js
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
node --test test/*.test.js
```

**Oldingi muhit cheklovi:** offline `npm ci` → `ENOTCACHED`, frontend `npm run build` → `vite: not found`, real PostgreSQL mavjud emas. Bu muhitda 26 backend dependency xatosi bor; ularni **PASS** deb hisoblamang.

## GitHub-da haqiqiy sinash

1. ZIP ichidagi `USTARA-New/` loyihasini o‘z GitHub repository manbasiga joylashtiring. `.github/workflows/v55-verify.yml` va `deploy-pages.yml` fayllari aynan repository ildizidagi `.github/workflows/` da bo‘lishi kerak. **Hech qanday production `.env`, Telegram tokeni yoki DB parolini GitHub’ga joylamang.**
2. GitHub → **Settings → Secrets and variables → Actions → Variables**, `VITE_API_BASE_URL` kiriting. Qiymat faqat xavfsiz **HTTPS public API origin** bo‘lsin, masalan `https://api.sizning-domeningiz.uz`; qo‘shimcha `/api`, query, maxfiy token bo‘lmasin. Frontend CORS ruxsatlari backendda GitHub Pages domeniga mos bo‘lsin. API serveri haqiqatan HTTPS orqali ishlashi kerak.
3. GitHub → Settings → Pages → **Source: GitHub Actions**. `main` branch protection va `github-pages` environment protection’ni sozlang. Kodni `main` ga push qilganda `USTARA v55 isolated verification` ishga tushadi. PR yoki manual run Pages deployga yo‘l ochmaydi.
4. CI **npm ci**, 42 PostgreSQL migratsiya, backend/frontend unit, 9 ta PG suite, HTTPS config validator, Vite build, release gate’ni bajaradi. Hammasi muvaffaqiyatli o‘tsa `ustara-v56-ci-summary-<run_id>` nomli **redacted JSON** hisobot saqlanadi.
5. `Deploy verified frontend to GitHub Pages` faqat muvaffaqiyatli `push main` workflow_run dan keyin ishlaydi. U upstream `workflow_run.id` ga mos redacted artifactni yuklab, commit SHA, 9 test suite, release PASS, build va API konfiguratsiyasi SHA-256 ni qayta tekshiradi. Repository API variable **CI va deploy orasida o‘zgarsa**, deploy rad etiladi.
6. Turli commitlardagi deploylar yagona `ustara-pages-main` concurrency guruhida ketma-ket boradi. E’lon qilishdan oldin `main` SHA qayta tekshiriladi, lekin real zamondagi branch siljishida juda kichik race oynasi mavjud. Muhim deploymentlarda environment approval foydali.
7. GitHub loglarini ko‘ring; raw log, DB URL, tokenlarni ommaviy ulashmang. PostgreSQL 9/9, build, deploy hamda brauzer API/CORS sinovlari real natija bermaguncha release **production-ready emas**.

## Maxsus config tekshiruvi

```bash
cd USTARA-New
VITE_API_BASE_URL=https://api.sizning-domeningiz.uz node frontend/scripts/validate-production-api.mjs
# Repo va API URL o‘rnini o‘zingizning haqiqiy HTTPS manzilingizga moslang.
```

**Qayd:** GitHub integration hali tasdiqlanmagan; ushbu sessiyada GitHub Actions **NOT_RUN**. Real DB **SKIP**, Telegram test boti va mobil E2E **NOT_RUN**. v57 `main` SHA va config hashni tekshiradi, lekin production xizmatlarning ishlashini tasdiqlamaydi.
