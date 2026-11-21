# USTARA v39 — Telegram navbat chaqiruvi: noaniq delivery xavfsizligi

**Talab:** v38 kodi, PostgreSQL migratsiyalar 1–41 saqlangan. Bu v39 kodini ishga tushirishdan **oldin** 42-migratsiyani (`20261213_queue_delivery_uncertain.sql`) rejalashtirilgan deploymentda qo‘llash zarur. Uning bajarilishi ushbu faylda **tasdiqlanmaydi**.

## 5 ta yakunlangan kod ishi

1. **Status modeli:** oddiy chaqiruv outbox jadvaliga `uncertain` statusi qo‘shildi; oldingi xabarlar va buyurtmalar o‘chirilmaydi.
2. **Crash/lease:** `processing` lease muddati tugagan bo‘lsa `uncertain`; worker bunday yozuvni avtomatik qayta jo‘natmaydi. Natija nomaʼlum bo‘lishi mumkin.
3. **Telegram ACK:** `message_id>0` va Telegram javobidagi `chat.id` aynan rejalashtirilgan chat bo‘lishi talab qilinadi; noto‘g‘ri/nomaʼlum javob ACK emas.
4. **Aniq xato va noaniq xato ajratiladi:** 429 — known rejected, cheklangan qayta urinish; 400/401/403 — failed; 5xx/transport/timeout/invalid payload — uncertain. 6 martadan ortiq urinish yo‘q.
5. **Stale outbox:** navbat `called` emas, bugungi emas yoki foydalanuvchi roziligi yo‘q bo‘lsa hali yuborilmagan pending bekor qilinadi; charchagan pending failed bo‘ladi; jo‘natishdan oldin qayta tekshiriladi.

## Ishga tushirish tartibi

- Mavjud ishchi jarayonni to‘xtating, xavfsiz backup oling, v39 SQL migratsiyani malakali operator **test bazasida avval tekshirsin**.
- Migratsiya holatini real DB bilan tekshiring; shundan keyingina v39 kod/worker yangilang.
- `cd backend && npm ci` → `npm run test:queue-telegram:v39` → `npm run test:unit`; frontend `npm ci && npm run test:unit && npm run build && npm run lint`.
- Faqat operator uchun monitoring: `SELECT status,count(*) FROM walkin_queue_notification_outbox GROUP BY status ORDER BY status;`. `uncertain` holatlar avtomatik qayta jo‘natilmasin; Telegram va navbat real holatini tekshirib, qo‘lda hal qilinsin.
- **Alohida staging**da: ikki parallel worker, qayta ishga tushish/lease, 429, 403, transport/timeout, /stopqueue hamda chaqiruv bilan status almashishi, haqiqiy Telegram private-chat, mobil brauzer testlarini bajaring.

## Kafolat va cheklovlar

- Bir nechta worker uchun PostgreSQL `SKIP LOCKED` va UUID lease ACK fencing bor. Tarmoq yuborishidan keyin DB tasdiqlashidan oldin uzilish mumkin; Telegram exactly-once kafolatlamaydi.
- `uncertain` yuborilgan ham, yuborilmagan ham bo‘lishi mumkin. Uni avtomatik qayta jo‘natmaslik **dublikat xavfini kamaytiradi**, lekin xabarning yetib borishini kafolatlamaydi. Qo‘lda ko‘rib chiqish lozim.
- Xabarlar rozilik bilan, maxfiy ism/telefon/QR kiritmasdan yuboriladi. Mijoz Telegramdan `/stopqueue` orqali chiqishi mumkin.
- **Real DB, real Telegram, Vite production build va mobil E2E bu muhitda o‘tmadi. Production-ready emas.**
