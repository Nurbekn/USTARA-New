# USTARA v93 — test qo‘llanmasi

Loyiha ildizida Node 22+ bilan:

```bash
node --test frontend/test/v93BarberQueueReadSafety.test.js
node --test backend/test/v93BarberQueueIdValidation.unit.test.js backend/test/v92BarberQueueCommitSafety.unit.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
node backend/scripts/audit-phase1.js
```

**Haqiqiy browser E2E uchun tekshirish kerak:** 15s polling, bir vaqtda ikki refreshning teskari tartibda tugashi, server 500/offline, qayta online, shu tabda/logout bilan boshqa tabga kirish, bir vaqtda call-next + finish, QR/pending, secret maydonlar, `pg` BIGINT ID'lar.

**DB testlari:** faqat alohida test/staging PostgreSQL; production bazasiga sinov mutatsiyalarini yubormang. npm dependencies va real DB bu muhitda mavjud emas, shuning uchun E2E NOT_RUN.
