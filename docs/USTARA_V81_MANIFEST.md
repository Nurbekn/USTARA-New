# USTARA v81 release manifest (2026-11-19)

Manba: `USTARA-4-Bosqich-Booking-Commit-Integrity-v80.zip`, 845 eski fayl.
Maqsad: #144 booking recovery GET + frontend noaniq natijani xavfsiz ko‘rish.

Yangi kod va hujjatlar: `backend/services/bookingRecovery.js`, `backend/test/v81BookingRecovery.unit.test.js`,
`frontend/test/v81BookingRecovery.test.js`, `docs/USTARA_V81_5_ISH.md`,
`docs/USTARA_V81_TEST_RUNBOOK.md`, `docs/USTARA_185_AUDIT_V81.md`, ushbu manifest.

Eski `USTARA_185_NAZORAT.csv` (185 qaror) va SQL migratsiyalar mutlaqo o‘zgarmagan.
Lokal: frontend 290/290, backend focused 123/123 PASS; umumiy backend 704 PASS / 26 MODULE_NOT_FOUND.
Haqiqiy PostgreSQL va browser E2E tasdiqlanmagan. PRODUCTION-READY EMAS.

SHA-256 va har bir fayl ro‘yxatining JSON manifesti ZIP yonida alohida saqlangan.
