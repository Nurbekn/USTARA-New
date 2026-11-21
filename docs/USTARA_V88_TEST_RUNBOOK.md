# v88 test runbook

Loyiha ildizida Node.js 22+:

```bash
node --test backend/test/v88CustomerPhonePrivacy.unit.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
node backend/scripts/audit-phase1.js
```

Backend barcha unit testlarni bajarish uchun `backend`da `npm ci`, frontend build uchun `frontend`da `npm ci && npm run build` zarur. Hozirgi mahalliy muhitda bu dependencylar yo‘q. Networkdan paketlarni yuklash bajarilmadi.

Haqiqiy PostgreSQL bilan JWT customer/barber/admin GET /api/customers, GET /api/customers/:id, GET /api/bookings, GET /api/bookings/:id sinovlari qilinishi kerak: barber directory/detail telefon bermasligi, o‘z bronida berishi, begona booking 404, admin va customer own profile huquqlari. **Ushbu integratsiyalar hozir NOT_RUN**.
