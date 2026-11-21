# USTARA v107 — test va migratsiya runbook

**Xavfsizlik:** Haqiqiy ishlab chiqarish DB'da yoki mavjud ma’lumot ustida bootstrap ishlatmang. Migratsiyani avval izolyatsiyalangan test DB'ga qo‘llang; eski 44 migratsiya qo‘llanganligiga ishonch hosil qiling.

Offline testlar (loyiha ildizidan):

```sh
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node --test backend/test/v107SafeDayClose.unit.test.js backend/test/v107PublicDayClosed.unit.test.js
node backend/scripts/audit-phase1.js
node backend/scripts/v45-decision-integrity.js
node scripts/v67-migration-audit.cjs
```

PostgreSQL sinov muhitida qo‘lda bajarilishi kerak (ushbu versiyada NOT_RUN):

- Yangi `20261216_safe_day_close.sql` ni avval 44 migratsiya o‘rnatilgan, boshqariladigan alohida test DB'ga qo‘llash va ledgerni tekshirish.
- 0 ta blocker holatida yopish, `barber_day_close_events` da bir dona audit, idempotent qayta so‘rov.
- `waiting/called/arrived/in_service`, pending QR, active bookings, Smart Booking va kechagi queue bilan yopish 409 va hech qanday yozuvsiz qaytishi.
- Bir vaqtning o‘zida bron yaratish / QR tasdiqlash / kunni yopish so‘rovlarida sartarosh advisory-lock tartibini tekshirish.
- Yopiq kun uchun `ustara_effective_day_schedule` bo‘sh qaytishi, keyingi kun odatiy jadval qolishi va qayta ochishdan keyin jadval tiklanishi.
- Kunning 23:59→00:00 almashishida eski tasdiq bilan boshqa kunni yopib bo‘lmasligi.
- Reopen va qayta close orasida eski revision bilan replay rad etilishi; commit timeoutdan keyin GET status bilan tekshirish.
- Public sahifa yopiq xabarini chiqarishi; QR token yaratish 409; Vite va mobil brauzer sinovlari.

Natijalar **runtime isboti emas**: offline SQL/Node unit testlar faqat kod va statik kontraktni tekshiradi.
