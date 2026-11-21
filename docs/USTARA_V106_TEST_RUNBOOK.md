# USTARA v106 — test runbook

```sh
cd USTARA-New
node --test frontend/test/v106DayCloseReadiness.test.js backend/test/v106DayCloseReadiness.unit.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node backend/scripts/audit-phase1.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
```

**Bajarilgan:** yangi 43/43 PASS, frontend 877/877 PASS, backend 1080 PASS/26 oldingi dependency FAIL; offline audit PASS; JSX parser PASS.

**NOT_RUN:** `npm ci` va Vite build, real PostgreSQL staging integration, Chrome/mobile, Telegram. Real baza, production DB yoki tashqi foydalanuvchiga avtomatik yozish tavsiya etilmaydi.

`/api/queue/day-close/preview` faqat `GET`: shaxsiy ma’lumotlar o‘rniga queue/QR/bron/taklif hisoblari qaytariladi. Shu endpointni unit test PASS chiqdi deb biznes kun haqiqatan yopilgan deyish mumkin emas.
