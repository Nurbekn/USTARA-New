# USTARA v26 — 5 daqiqalik bo‘shagan vaqt takliflari

**Scope:** V25 dagi QR orqali barber tasdiqlagan va `waiting` holatidagi tashrifchi uchun bo‘shagan bugungi vaqtni taklif qilish. Bu **oldindan bronni yaratish/tasdiqlash yoki band qilish emas**: QR mehmonda mijoz akkaunti, xizmat ID va narx tasdig‘i yo‘q. Sartarosh xizmatni, narxni va haqiqiy bo‘sh vaqtni alohida tekshirishi kerak. Shuning uchun UXda "taklif qabul qilindi" deyiladi, "bron tasdiqlandi" deyilmaydi.

## Deploy xavfsizligi

- **Hech qanday DB migratsiya avtomatik bajarilmaydi.** Stage DBda `20261208_smart_booking_offers.sql`ni tekshirib, barcha oldingi 36 migratsiya mavjudligidan so‘ng operator ruxsati bilan bir marta qo‘llash kerak. Bu eski migratsiyalarni tahrirlamaydi.
- Fresh install `backend/database/bootstrap.sql`da 37-migratsiya kiritilgan, `bootstrap/verify.sql` jadval va versiyalarni tekshiradi.
- Trigger faqat active bron statusi `cancelled`ga o‘tganda, **bugungi**, boshlanishiga 5 daqiqadan ko‘p qolgan, bir kunda tugaydigan va davomiyligi 1–1440 daqiqali vaqtdan bitta opening yaratadi. DB transactionda bu yozuv ham cancel bilan birga COMMIT/ROLLBACK bo‘ladi.
- Yangi jadvallarga backend/worker uchun kerakli SQL privilege grantlarini DBA tekshirsin. Migration yetmay turib yangi kodni deploy qilmang: booking cancel triggeri migratsiyada qo‘shiladi, QR status so‘rovi ham yangi jadvalni kutadi.
- Stagingda PostgreSQL va Telegram real tizimlari bilan testlanmagan. Production-ready **emas**.

## Ketma-ket tanlash va holatlar

- `npm run smart-booking:worker` mustaqil supervised process bo‘lib, har 5 soniyada bitta imkoniyatni ko‘radi. `pg_advisory_xact_lock(barberId)` orqali barber booking/queue yozuvlariga mos keladi. Opening `open` bo‘lsa, aynan o‘sha barberning bugungi QR-tasdiqlangan FIFO `waiting` tashrifchisiga **5 daqiqalik bitta taklif** yozadi.
- DBda `UNIQUE(opening_id,entry_id)`, `one_pending_opening`, `one_pending_entry` parallel takliflarni cheklaydi. Taklif muddati o‘tsa `expired`, `reject` bosilsa `rejected`, mijoz `accept` bosilsa `accepted`, keyin `cancel` bo‘lsa `cancelled` holatiga o‘tadi. Yaroqsiz yoki band bo‘lgan vaqt `closed` bo‘ladi. Takroriy bir xil javob `replayed` orqali idempotent qaytariladi; qarama-qarshi javob `409`.
- `POST /api/queue/offers/:id/decision` (body: `token`, `request_id`, `action: accept|reject|cancel`) QR token va browser session receipt orqali faqat o‘z taklifiga javob beradi. Raw token bazaga yozilmaydi; SQLga faqat domain-hash yuboriladi. Boshqa mijoz takliflari ko‘rsatilmaydi. `GET /api/queue/qr-status` shaxsiy `smart_offer`ni qaytaradi. Brauzerda countdown ko‘rinadi, **server** expiryni hal qiladi.
- Authenticated barber: `GET /api/queue/offers/mine` va `PATCH /api/queue/offers/:id/cancel`. Barberning bugungi QR takliflari interfeysda ko‘rinadi; mijozning telefon raqami ko‘rsatilmaydi.
- Agar barber/mijoz QR ticket `called`ga o‘tsa, pending offerni qabul qilib bo‘lmaydi. Bitta bo‘shagan vaqt uchun keyingi nomzod worker orqali tanlanadi. Worker ishlamasa yangi taklif ketmaydi; xatolar foydalanuvchidan yashirilmaydi.

## Muhim chegaralar va keyingi ish

- V26'dagi qabul **booking jadvaliga yozmaydi** va mavjud bronlardan ustun bo‘lmaydi. Haqiqiy booking yaratish uchun login/akkaunt, xizmat/davomiylik/narx, vaqtni band qilish va DB exclusion-check integratsiyasi alohida bo‘lishi kerak. Faqat QR mehmonlari bu oqimni oladi; telefon bilan qo‘shilgan manual walk-in bu versiyada taklif olmaydi.
- `Telegram`ga *Smart Booking* taklif tugmalari/xabar yuborish hali yo‘q; avvalgi v25 **navbatga chaqirish Telegram outbox** o‘zgarishsiz. v27da taklif notification outbox, Telegram callback, source slot booking guarantee va ajratilgan service matching qo‘shiladi.
- Bu worker PostgreSQL Transaction + advisory lock bilan atomar javobni kodlaydi, lekin **real DB concurrency, trigger sintaksisi, session isolation va mobil E2E haqiqiy muhitda sinovdan o‘tmagan**. No-prod checklist: ikki parallel accept, accept/expiry race, close/slot booked, no-show/opt-out, timeout/retry, QR token leak, cancellation rollback, operator reschedule.
- OTP ekranining alohida 1:00 countdown'i va Admin QR TTL 1–120 daqiqa bo‘yicha v23/v25 qoidalar o‘zgartirilmagan.
