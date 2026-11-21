# USTARA v85 — testlar va real tekshiruvlar

## Offline — Node 22
```bash
cd USTARA-New/frontend
npm run test:v85:unit
node --test test/*.test.js
cd ../
node scripts/v67-decision-audit.cjs
node scripts/v67-migration-audit.cjs
node backend/scripts/v45-decision-integrity.js
```

## Real muhitda qolgan
1. `cd frontend && npm ci && npm run build`; React/Vite bilan tasdiqlash UI’ni brauzerda ochish.
2. Tasdiqlash oynasini ochib, xizmat va sana/vakansiya almashtirish; eski snapshotni tasdiqlab bo‘lmasligi.
3. Snapshot 120 s’dan eski bo‘lsa yoki slotlar qayta yuklansa, qayta tasdiqlash chiqishi.
4. PostgreSQL bilan: parallel bron, server narxi/duration/policy o‘zgarishi 409 javobi, idempotent recovery va test isolation.
5. Logout/login boshqa akkauntga POST davomida; yangi akkauntga oldingi akkaunt bronining tafsiloti ko‘rinmasligi.
6. iOS/Android, internet uzilishlari va Telegram OTP; server auth/role bilan real integratsiya.

**Izoh:** Unit PASS, JSX sintaksis parsing va offline migration audit deployment yoki E2E PASS emas.
