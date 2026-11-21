# Walk-in queue v47 — barqarorlik va takroriy amallar

- `GET /api/queue/mine`: PostgreSQL repeatable-read tranzaksiyada bir xil snapshot; barber/user shared identity lock COMMITgacha ushlanadi. Faolsiz/nomuvofiq sartaroshga 403, SQL xatoda ROLLBACK va 503.
- `finish` uchun bir xil holat takroriy kelganda status/audit o‘zgarmaydi; terminal cleanup eski outbox va takliflarni qayta muvofiqlashtiradi.
- QR/manual `leave` takroriy `left` uchun ham shu cleanup ishlaydi, ammo yangi audit eventi yoki bron yaratmaydi.
- `cleanupTerminalQueue()` faqat confirmed booking’ga bog‘lanmagan `pending/accepted` takliflarni bekor qiladi, openinglarni qayta ochadi va yuborilmagan notificationlarni bekor qiladi. U transaction ichida chaqiriladi.
- Telegram polling’da `429` muddati noma’lum/nomuvofiq yoki 30 kundan katta bo‘lsa ishchi operator tekshiruvi uchun to‘xtaydi. `429` without `retry_after` qisqa defaultga aylantirilmaydi.

**Chegaralar:** Telegram at-least/uncertain xabarlarda exactly-once kafolati yo‘q; ishlab chiqarishga chiqishdan oldin real PostgreSQL race, Telegram API va mobil E2E shart. v47 yangi SQL migratsiya qo‘shmadi.
