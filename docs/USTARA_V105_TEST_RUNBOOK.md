# USTARA v105 — test runbook

## Offline unit

```sh
cd USTARA-New/frontend
npm run test:v105:unit
npm run test:unit
cd ../backend
npm run test:v105:unit
node --test test/*.unit.test.js
cd ..
node backend/scripts/audit-phase1.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
cd backend && node scripts/v45-decision-integrity.js
```

## Ishlagan natijalar
- Frontend 853/853; yangi v105 37/37 PASS.
- Backend nomlangan suite 86/86; yangi v105 16/16 PASS. Keng backend 1061 PASS / 26 FAIL (`MODULE_NOT_FOUND` npm dependency).
- JSX parser: 0 syntax diagnostics.

## Hali bajarilmagan
- Toza o‘rnatilgan dependencylar bilan `npm ci` + `npm run build`.
- Izolyatsiyalangan test PostgreSQL’da ID/owner/state/concurrency E2E; production bazada ishlatmang.
- Chrome, mobil brauzer, Telegram va live UI acceptance.

`No-show` tasdiq UI qoidasidir. Ruxsat va navbat holatining so‘nggi qarorini server tranzaksiyasida tekshirish shart.
