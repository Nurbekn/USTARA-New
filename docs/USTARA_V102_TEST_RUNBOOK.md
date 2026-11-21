# USTARA v102 sinovlari

Talab: Node.js 22+.

```sh
cd USTARA-New/frontend
npm run test:v102:unit
npm run test:unit
```

Backend:
```sh
cd USTARA-New/backend
npm ci
npm run test:unit
```

**Izoh:** ushbu muhitte `npm ci` bajarilmadi; shuning uchun mavjud bo‘lmagan paketlarga bog‘liq 26 backend testi FAIL. Frontend 780 PASS va yangi 18 test PASS.

Offline integritet:
```sh
cd USTARA-New
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
```

Bular real PostgreSQL migratsiyasi yoki mobil brauzer E2E natijasining o‘rnini bosmaydi. Yangi bron avtomatik yaratilmaydi. Real brauzer sinovi uchun `frontend`da `npm ci && npm run build` bajarish zarur.
