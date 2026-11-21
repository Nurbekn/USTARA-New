# USTARA v47 — test va deploy tayyorgarligi

## Haqiqatan ishga tushirilgan

```bash
cd USTARA-New/backend
npm run test:v47:unit       # 39 PASS
npm run test:unit           # 378 PASS / 26 MODULE_NOT_FOUND FAIL
npm run v45:decisions       # 185 qaror SHA-256 verified
npm run audit:phase1        # 42 forward migrations offline PASS
node --test test/v46QueueLifecycle.postgres.integration.test.js  # 1 SKIP; PASS emas
npm run test:v46:staging    # explicit opt-in yo‘q -> bloklanadi
cd ../frontend
npm run test:unit           # 175 PASS
npm run build               # vite not found
```

## Haqiqiy test muhitida keyingi ishlar

Backend va frontend dependencies’ni **ishonchli npm registry mavjud bo‘lgan CI/staging**da `npm ci` bilan o‘rnating. Internet bo‘lmasa testlarni PASS demang. PostgreSQL uchun **faqat loopback**, `ustara_test_db`, alohida `ustara_account_test` roli va ruxsat etilgan 42 migratsiya bilan v46 staging runnerni ishlating. U real PostgreSQL’da 6 ta DB integration testni talab qiladi. **Production DBdan foydalanmang** va maxfiy DB URL/parolni loglarda qoldirmang.

Telegram API bilan E2E: faqat maxsus test bot va ixtiyoriy test chat. `429` (aniq/missing/malformed cooldown), `/stopqueue`, offer accept/reject va bot worker restart ssenariylarini tekshiring. Haqiqiy mijoz ma’lumotlarini ishlatmang.

Mobil E2E: ikki akkauntni almashtirish, QR orqali leave, oddiy navbat leave, kechikkan javob, 1:00 OTP va admin QR TTL holatlarini tekshiring.

**Bloklovchilar:** bu muhitda `registry.npmjs.org` DNS ochilmaydi; PostgreSQL serveri va Vite binari mavjud emas. Mock testlar DB/Telegram integratsiyasi o‘rnini bosmaydi. Production-ready emas.
