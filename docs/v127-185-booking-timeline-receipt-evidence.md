# v127 — bron tarixi, cancel chegarasi va receipt tekshiruvi

**Talab manbasi:** `docs/USTARA_185_NAZORAT.csv` (#17, #37, #52, #87). Asl qaror reyestri o‘zgarmagan.

## Implementatsiya

- `frontend/src/pages/user/bookings/model.js`: vaqt kesimlari, statusni saqlash, bekor qilish chegarasi, server `booking_end` mosligi, 31-fevral kabi sanalar rad etilishi.
- `frontend/src/pages/user/Bookings.jsx`: filtered-only nearest, kelgusi/tarix sonlari va muddati o‘tgan bronlar uchun server status xabari, 60 soniyalik qayta hisoblash, qayta bron URL himoyasi.
- `frontend/src/pages/user/bookings/BookingCard.jsx`: overdue statusni tekshirish eslatmasi, yakunlandi degan yolg‘on xabar yo‘q.
- `frontend/test/customerBookings.test.js`: cancellation cutoff testi real boshlanish vaqti bilan yangilandi.
- `frontend/test/v127BookingTimelineReceipt.test.js`: 15 ta yangi regressiya testi, HTTP integratsiya mock, real production model funksiyalari.

## Amaldagi verifikatsiya

Frontend `1068/1068 PASS`, yangi testlar `15/15 PASS`. Backend `1350 PASS / 26 oldingi dependency FAIL`. `npm ci --offline` ENOTCACHED, `vite` o‘rnatilmagan, DB/browser/Telegram E2E bajarilmagan. Source audit va har bir fayl SHA-256 ZIP manifestda. Bu testlar production va haqiqiy PG bilan integratsiyaga teng emas.
