# USTARA v25 — Telegram orqali navbatga chaqirish (aniq rozilik bilan)

**Bosqich 4, qisman.** Asos: `USTARA-4-Bosqich-Live-Queue-v24.zip`. Barcha oldingi QR TTL (Admin 1–120 daqiqa), OTP 1:00, manual FIFO va ETA kodlari saqlandi.

## Foydalanuvchi oqimi

1. QR sahifasi: QR token + maxfiy request receipt egasi sartarosh tomonidan tasdiqlangach, faqat `waiting` holatida **"Telegram xabarini yoqish"** tugmasini bosadi. Boshqa tashrif buyuruvchining Telegram manzili taxmin qilinmaydi.
2. `POST /api/queue/telegram/opt-in` faqat shu guest ticket uchun Telegram bot deep-link qaytaradi. Bot username server konfiguratsiyasidan olinadi. 192 bitli random `qnotify_` secret SQL'da **faqat hash** ko‘rinishida, **5 daqiqaga** beriladi, bir martalik; qayta olishda oldingi token bekor bo‘ladi; maksimal bir daqiqada bitta link.
3. Mijoz o‘zining private Telegram chatida havolani tasdiqlagach, bot `consented_at` bilan aynan shu navbat va `chat_id`ni bog‘laydi. Telefon raqami, boshqa foydalanuvchilarning nomi yoki queue ID Telegram chatga yuborilmaydi.
4. Sartarosh `call-next` qilganda **xuddi shu PostgreSQL transaction** ichida mavjud subscription bo‘lsa `walkin_queue_notification_outbox`ga bitta event qo‘shadi. `UNIQUE(entry_id,event)` DB darajasida takrorlangan yozuvni to‘xtatadi. Takroriy `call-next` outboxni qayta yaratmaydi.
5. Alohida `npm run queue:notifications` worker `FOR UPDATE SKIP LOCKED` orqali pending xabarlarni claim qiladi; lease UUID bilan himoyalanadi, muvaffaqiyatda Telegram `message_id` saqlanadi, transport xatosida 6 martagacha exponential backoff; 400/401/403 doimiy xatolarda `failed`; 429 `retry_after`ga rioya qiladi. Noto‘g‘ri navbat holati yoki bekor qilingan ulanish `cancelled` bo‘ladi.
6. QR egasi `POST /api/queue/telegram/opt-out` orqali yoki Telegram botda `/stopqueue` yozib xabarlarni o‘chiradi. `/stopqueue` shu chatdagi hamma queue ulanishlarini bekor qiladi; allaqachon yuborilgan xabarni qaytarib bo‘lmaydi.

**Muhim:** Telegram Bot API client-side idempotency key taqdim etmaydi. Shuning uchun DB event **bir marta yaratiladi**, lekin xabar yuborilgach worker ACK yozishdan oldin uzilib qolsa, qayta yuborish **ikki marta yetkazilishi mumkin** (at-least-once, exactly-once emas). Opt-out va yuborishning juda qisqa poygasida bitta in-flight xabar ham kelishi mumkin. Worker chiqishlari token/chat IDni log qilmaydi.

## Ma’lumotlar bazasi

Yangi `backend/database/migrations/20261207_queue_telegram_notifications.sql`: 36-chi forward migration; `walkin_queue_telegram_invites`, `walkin_queue_telegram_subscriptions`, `walkin_queue_notification_outbox`. Boshqa booking, QR TTL yoki eski navbatlarni backfill qilmaydi. Migratsiya **o‘z-o‘zidan qo‘llanmaydi**: ishlaydigan database'da migratsiya oldidan backup va rejali deployment zarur.

## Ishga tushirish

- API serverda allaqachon mavjud `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, DB konfiguratsiyasi bo‘lishi kerak. **Faqat bitta** update usuli: webhook **yoki** `npm run telegram:worker`. Har ikkisi v25 deep-linkni qabul qiladi.
- **Alohida jarayon**: `cd backend && npm run queue:notifications`; update botining o‘zi outbox yetkazmaydi. Supervisor bilan restart, health-check va worker monitoring talab etiladi.
- Server migratsiyasi v25 (`20261207`) qo‘llanmagan bo‘lsa yangi route'lar SQL xatosi bilan 503 qaytaradi; code va migration birga joylashtiriladi. Productionda CDN / WAF bo‘yicha umumiy IP limiter, public QR rate limiting va foydalanuvchi xabarlariga belgilangan Telegram xatolari kuzatilishi kerak.
- Ruxsatli, **alohida test PostgreSQL** muhitda migration, webhook/polling, ikki parallel queue call, ikki worker, user opt-out/sending race, bot block/unblock va real mobil browser E2E testlarini alohida bajarish kerak.

## Sinov natijasi (2026-11-18)

- `backend/test/queueTelegramNotifications.unit.test.js`: 8/8 PASS — invite/receipt proof, hash-only, one-use, unlink, fencing, ACK, retry, inventory.
- `backend/test/queueTelegramBot.unit.test.js`: 3/3 PASS — private sender, `/start qnotify_`, `/stopqueue` va expired link.
- Audit/bootstrap/Telegram menu bilan tanlangan suite: **30/30 PASS** (nested subtestlar bilan), **185 qaror / 36 migration** offline PASS.
- To‘liq backend suite, frontend Vite production build va barcha JSX lint testlari: **BU MUHITDA BAJARILMADI** (`node_modules` ZIP tarkibida yo‘q, `npm ci` registryga ulana olmadi). Eski v24 natija: backend 409/409, frontend 152/152 — **bu v25 uchun qayta sinov natijasi emas**.
- Real DB migration, Telegram API delivery, browser/mobile E2E: **BAJARILMADI**. **Production-ready EMAS.**

## Keyingi v26

5 daqiqalik Smart Booking takliflari: mavjud tasdiqlangan bronlarni buzmasdan, bo‘sh slotni **server-side atomar band qilish**, qisqa amal muddati, ixtiyoriy Telegram taklifini qabul/rad etish, idempotent callback va izchil rollback. Bundan oldin v25 uchun alohida real PostgreSQL + Telegram staging sinovlari zarur.
