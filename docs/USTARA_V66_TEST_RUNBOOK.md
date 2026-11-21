# USTARA v66 — testni bosqichma-bosqich ishga tushirish

## 1. Npm talab qilmaydigan lokal testlar
```bash
cd USTARA-New/backend
node --test test/v66IntegrationReadiness.unit.test.js
npm run test:v66:unit
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
cd ../frontend
node --test test/*.test.js
```
`PASS` faqat shu unit testlarni tasdiqlaydi, haqiqiy PostgreSQL/Chrome integratsiyasini emas.

## 2. GitHub Actions (ulanish va haqiqiy workflow run zarur)
`main` tarmog‘iga v66 kodini push qiling. Repository Actions variable **`VITE_API_BASE_URL`** uchun o‘zingizning haqiqiy public HTTPS API origin manzilingizni belgilang; test yoki lokal URL bo‘lmasin. `.github/workflows/v55-verify.yml` keyin:

1. `v66-ci-preflight.js` xavfsiz config nazorati (`npm ci`dan oldin).
2. `npm ci` (backend va frontend) va 185 qaror offline audit.
3. Disposable PostgreSQL 18 servisida `ustara_test_db`, maxsus owner va login test role hamda 42 migratsiya.
4. `v66-db-readiness.js`: read-only identifikatsiya, migratsiya ledger va login roli huquqlari.
5. Barcha backend/frontend unit suite’lar, 9 haqiqiy PG suite, Chrome login E2E, Vite build va production Chrome smoke.
6. Release proof va aynan CI yaratgan artifact, so‘ng Pages tekshiruvi.

Haqiqiy CI loglari bilan `9/9 PG PASS`, Chrome E2E PASS, `vite build PASS` bo‘lmaguncha deploy/production-ready deb belgilamang. GitHub integratsiyasi ulanmaganda workflow’ni bu suhbatdan ishga tushirib bo‘lmaydi.

## 3. Real DB haqida ogohlantirish
Faqat loyiha workflow’idagi **ephemeral lokal test bazasi**ga ulaning. Skriptlar production URLni rad etadi va DDL bajarmaydi; migratsiya bootstrap esa faqat disposable CI bazada, aniq ruxsat bilan ishlashi kerak. PostgreSQL yo‘q muhitda DB testi `SKIP` — `PASS` emas.

## 4. Mahalliy holat
`psql` va Docker mavjud emas; frontend `npm run build` natijasi `vite: not found`; mavjud npm cache to‘liq emas. Haqiqiy E2E hali tasdiqlanmagan.
