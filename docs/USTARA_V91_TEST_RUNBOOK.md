# USTARA v91 — test qo‘llanmasi

Node.js 22+; loyiha ildizida:

```bash
node --test backend/test/v91QueueSelfExitHardening.unit.test.js
node --test frontend/test/v91ManualQueueReadSafety.test.js
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
node backend/scripts/audit-phase1.js
```

To‘liq backend sinovlari uchun avval `backend` ichida `npm ci` va test DB kerak bo‘lishi mumkin; **haqiqiy production bazasida integratsiya testlarini ishga tushirmang**.

Disposable PostgreSQL + mobil browser E2E (bajarilmadi):
1. O‘ziga tegishli manual/QR navbatdan chiqish va bir so‘rovning takrorlanishi (replayed=true), tasdiqlangan bron saqlanishi.
2. DB COMMIT javobi uzilgandagi uncertain natija va connection pool discardni izolatsiyalangan muhitda sinash.
3. Navbat status GET offline, network slow, account switch, recovery, QR token expiry va terminal ticket holatlarini tekshirish.
4. API no-store va unauthorized response ma’lumotlar oqmasligini tekshirish.

Bu v91 testlari real server ishlashini tasdiqlamaydi, **#128 qisman**.
