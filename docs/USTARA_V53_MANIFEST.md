# USTARA v53 — fayllar yaxlitligi

- **v52:** 717 fayl; v53 manifest qo‘shilishidan oldin **724 fayl**.
- Yo‘qolgan fayl: **0**; yangilangan: **5**; yangi: **7**; o‘zgarmagan: **712**.
- 185 qaror CSV SHA256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — **o‘zgarmagan**.
- Forward SQL migratsiyalar: **42**, papkada jami **44 SQL**, 2 rollback yordamchi. Migratsiya fayllari o‘zgarmagan.
- Yangi v53 unit 10 PASS, tanlangan 77 PASS, frontend 178 PASS; full backend 421 PASS/26 dependency FAIL; real PG 1 SKIP, Vite FAIL.
- ZIP ichiga `.env`, `node_modules`, `dist`, `.git` kiritilmaydi.

### O‘zgargan fayllar
- `USTARA-New/backend/controllers/walkinQrController.js`
- `USTARA-New/backend/package.json`
- `USTARA-New/backend/services/smartBookingOffers.js`
- `USTARA-New/docs/USTARA_LATEST_CHECKPOINT.md`
- `USTARA-New/docs/USTARA_PROGRESS.md`

### Yangi fayllar
- `USTARA-New/backend/WALKIN_QUEUE_V53.md`
- `USTARA-New/backend/scripts/v53-staging.js`
- `USTARA-New/backend/test/v53FinalBoundary.unit.test.js`
- `USTARA-New/backend/test/v53QrFinalBoundaries.postgres.integration.test.js`
- `USTARA-New/docs/USTARA_185_AUDIT_v53.md`
- `USTARA-New/docs/USTARA_V53_5_ISH.md`
- `USTARA-New/docs/USTARA_V53_TEST_RUNBOOK.md`
