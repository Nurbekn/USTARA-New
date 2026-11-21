# USTARA v82 — release manifest (2026-11-19)

- Manba: `USTARA-4-Bosqich-Booking-Network-Recovery-v81.zip` — 852 eski fayl.
- Mavzu: parallel submit tanlovi/akkauntini ajratish, noaniq request_id uchun owner nazorati, privacy-safe GET recovery, PG concurrency ssenariysi.
- Kod: `frontend/src/pages/user/barber/createBooking.js`, `InlineBooking.jsx`, `backend/controllers/bookingsController.js`, `backend/test/bookingConcurrency.postgres.integration.test.js`.
- Test: frontend `v82RecoveryBoundary.test.js` (13 yangi), backend `v82RecoveryContract.unit.test.js` (6 yangi), PG opt-in 1 ssenariy.
- Unit: frontend 303/303 PASS, backend focused 20/20 PASS, keng backend unit 710 PASS / 26 dependency FAIL.
- Haqiqiy PostgreSQL, Chrome, GitHub CI, Vite build va Telegram NOT_RUN. Production-ready EMAS.
- 185 qaror va 42 forward / 2 rollback SQL migratsiya oldingidek. SHA-256 va har bir ichki fayl xeshi ZIP yonidagi JSON faylda.
