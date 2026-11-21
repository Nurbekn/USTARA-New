# USTARA v89 — verification runbook

Loyiha ildizida Node.js 22+: 

```bash
node --test backend/test/v89PublicAvailabilityPrivacy.unit.test.js
node --test frontend/test/v89PublicSlotPrivacy.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
node backend/scripts/audit-phase1.js
```

Disposable test PostgreSQL va paketlar o‘rnatilgan maxsus muhitda, avval test data cleanup va JWT role xavfsizligini tekshiring; mavjud `backend/test/multiServiceSocial.postgres.integration.test.js` public `candidates` faqat free ekanini tekshiradi. Uning destructiv migratsiya bosqichlari sabab production DB’da **hech qachon ishlatmang**.

Hozir real PG, browser va Telegram integratsiyalari NOT_RUN; muhitda `pg`, `express`, `jsonwebtoken`, `bcrypt` paketlari o‘rnatilmagan.
