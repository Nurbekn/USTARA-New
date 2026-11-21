# USTARA v92 — tekshirish buyruqlari

Node.js 22+ bilan loyiha ildizida:

```bash
node --test frontend/test/v92QrQueueStatusSafety.test.js
node --test backend/test/v92BarberQueueCommitSafety.unit.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
node backend/scripts/audit-phase1.js
```

`backend/test/*.unit.test.js` uchun izolatsiyalangan muhitda `backend/npm ci` o‘rnatish kerak; bu muhitda 26 test dependency sababli FAIL. Hech qachon production bazasida disposable PostgreSQL integratsiya testlarini ishlatmang.

**Keyingi real sinovlar:** barber join/callNext/finish COMMIT failures with dropped connection, replay/recheck; QR action unavailable / account switch; mobile refresh; revoked proof, expiry, no-store. Bu ssenariylar yozilgan, real integratsiya bu yerda bajarilmagan.
