# USTARA v90 — test va release qo‘llanmasi

Node.js 22+ bilan loyiha ildizidan:

```bash
node --test frontend/test/v90PublicQueueFreshness.test.js
node --test backend/test/v90PublicQueueEstimate.unit.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
node backend/scripts/audit-phase1.js
```

Qolgan real E2E (bajarilmagan): alohida disposable PostgreSQL’ni backupdan tiklash, 42 migratsiyani stagingda qo‘llash; Express/JWT endpoint, ikki queue o‘zgarishi, midnight Asia/Tashkent, max 24h ETA, sekin/uzilgan internet va Chrome/mobile browser pollingni testlash. Mavjud production DBda destruktiv integration testlarini ishlatmang.

Local muhitda `express`, `pg`, `bcrypt`, `jsonwebtoken` paketlari yo‘q. `npm ci`, Vite build va real DB testlari shu ishda bajarilmadi.
