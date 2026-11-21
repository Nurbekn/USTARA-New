# USTARA v87 — tekshiruv buyruqlari

Node 22, arxiv ildizi `USTARA-New`:

```bash
node --test frontend/test/v87BookingMutationSafety.test.js frontend/test/customerBookings.test.js frontend/test/rescheduleBooking.test.js
node --test frontend/test/*.test.js
node --test backend/test/v87BookingStatusCommit.unit.test.js backend/test/cancellationPolicy.unit.test.js
node --test backend/test/*.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
```

Real integratsiya (hali bajarilmadi):
1. `cd backend && npm ci` bilan deps o‘rnatish, alohida PostgreSQL test bazasini sozlash va barcha PG testlarni xavfsiz muhitda bajarish.
2. Mijoz bronini bekor qilganda COMMIT response yo‘qolsa, statusni qayta o‘qish va bir marta cancel notice yuborilishini tekshirish.
3. Bir bronni ikki qurilmadan ko‘chirishda optimistic previous timestamp + service snapshot o‘zgarmasligini tekshirish.
4. Logout/login paytida kelgan eski PUT/PATCH javoblari success deb ko‘rinmasligini UI/E2E sinash.
5. Service-edit response `snapshot_refresh_required` bo‘lsa ro‘yxat qayta yuklansin; ikkinchi PATCH avtomatik ketmasin.
6. `cd frontend && npm ci && npm run build`; haqiqiy mobile browser bilan recheck.

Unit testlar PASS bo‘lishi real DB va UI E2E dalili emas.
