# USTARA v9 — Bron so‘rovining idempotency himoyasi

Bu ZIP **v8 ustiga** qurilgan; 185 qaror bajarildi degani emas.

- #144: takroriy POST bir xil UUID bilan kelsa, server eski bronni qaytaradi.
- `backend/database/migrations/20261129_booking_idempotency.sql` test bazasida sinov qilinishi kerak; production bazaga avtomatik qo‘llanmadi.
- Frontend noaniq internet xatosida request IDni saqlaydi va eskisini qayta ishlatadi; JWT hech qayerga yozilmaydi.
- Yangi bron va idempotency yozuvi tranzaksiyada saqlanadi; muvaffaqiyatli replay yangi Telegram xabarini yubormaydi.
- Testlar: frontend 117 PASS; mustaqil backend suite 23 PASS; audit 185 qaror, 28 migratsiya PASS.
- Real PostgreSQL E2E va to‘liq backend/frontend build bu muhitda bajarilmadi. v9 production-ready emas.

Batafsil yozuv: `docs/USTARA_PROGRESS.md`. Keyingi ishlar uchun shu hujjat va `docs/USTARA_185_NAZORAT.csv` ni o‘qing.
