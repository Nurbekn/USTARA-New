# USTARA v11 — Bron narxini himoyalash

Manba: v10 ZIP. Bu yangi boshlanadigan loyiha emas; v10 ustidan 3-bosqich patch.

- Frontend serverda ko‘rsatilgan narxni `expected_total_price` sifatida uzatadi.
- Server real xizmat narxlari bilan taqqoslaydi; narx o‘zgarib qolsa `409 price_changed` va bron yaratilmaydi.
- Bronlar ro‘yxatida eski xizmat nomi `booking_services` snapshotidan olinadi.
- Idempotency request_id tarmoq retry paytida bir xil qoladi.
- Backend `bookingPriceSnapshot.unit.test.js`, frontend `createBooking.test.js` regressiya testlari.
- Test: 120 frontend / 31 tanlangan backend PASS, 185 audit PASS. Real DB va browser E2E bajarilmadi.

Qolganlar uchun `docs/USTARA_PROGRESS.md` va `docs/USTARA_185_NAZORAT.csv`ga qarang.
