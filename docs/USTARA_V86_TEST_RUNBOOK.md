# USTARA v86 — sinov qo‘llanmasi

## Offline Node 22
```bash
cd USTARA-New/frontend
npm run test:v86:unit
node --test test/*.test.js
cd ..
node --test backend/test/v81BookingRecovery.unit.test.js backend/test/bookingIdempotency.unit.test.js backend/test/v77BookingQuoteFence.unit.test.js
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
```

## Integratsiya / real muhit (hali bajarilmadi)
1. `cd frontend && npm ci && npm run build`; real React/Vite sahifani ochib success, cancelled replay va tafsilotlar linkini tekshiring.
2. Real PostgreSQL: bitta bron yarating, backend response `total_price`, `duration_minutes`, `services` va `customer_id` qiymatlarini tekshiring; test bazadan foydalaning.
3. POST serverda commit bo‘lgan, lekin javob tarmoqqa kelmagan holatda `request_id` bilan GET recovery va takroriy POST (idempotency) sinovlari; ikkita bron yuzaga kelmasin.
4. Joriy mijozdan boshqa `customer_id` berilgan yoki noto‘g‘ri price/status bilan 2xx javobni UI muvaffaqiyat deb ko‘rsatmasligini browser testda tekshiring.
5. Oldingi cancelled/rejected/completed bron recovered bo‘lsa, holati to‘g‘ri ko‘rinsin; yangi bron sifatida ko‘rsatilmasin.
6. Logout/login o‘zgarishi va turli qurilmalarda session/profil owner izolyatsiyasi; Telegram real sandbox sharoitida alohida sinov.

**Unit PASS va statik syntax check real PG/Vite/Chrome/Telegram sinovi o‘rnini bosmaydi.**
