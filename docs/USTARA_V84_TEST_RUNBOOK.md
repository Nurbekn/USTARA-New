# v84 — test qo‘llanmasi

## Offline (Node 22)
```bash
cd USTARA-New/frontend
npm run test:v84:unit
node --test test/*.test.js
node --check src/pages/user/barber/availableSlots.js
cd ../
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/audit-phase1.js
node backend/scripts/v45-decision-integrity.js
```

## Real muhitda hali tekshirish kerak
1. `cd frontend && npm ci && npm run build` (vite o‘rnatilgan muhit).
2. Chrome/Android: 1 va 2 xizmatli bronlarda bo‘sh/band 5 daqiqalik slot; 24:00 yakun.
3. API orqali qaytgan narx xizmat narxi bilan farq qilsa, qayta tasdiqlash ishlashi.
4. Tanaffus, ta’til, maxsus kun, sartarosh bookings paused va 14 kunlik sana chegaralari.
5. Real PostgreSQL: parallel bron, slot race, service archive, price/duration mismatch, idempotent retry.
6. Network offline/online, guest/login draft, Telegram OTP va mobil brauzer.

**Izoh:** Offline unit testlar real DB yoki production E2E o‘rnini bosmaydi.
