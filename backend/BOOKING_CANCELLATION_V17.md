# v17 — Sartarosh belgilaydigan bekor qilish shartlari

## Xulosa
- Oldingi v16 `PUT`/`DELETE` cancellation tranzaksiyasi, takroriy so‘rovda replay va bir martalik Telegram bildirishnomasi saqlangan.
- Sartarosh **Jadval → Bronni bekor qilish qoidalari** orqali `cutoff_minutes`ni **null** (muddatsiz), 0 (bron boshlanishigacha), 30, 60, 120, 360, 1440 yoki 2880 daqiqa qilib belgilaydi. Backend qat'iy **0–10080 integer yoki null** ni qabul qiladi. `text` 280 belgigacha, ixtiyoriy.
- `GET/PUT /api/barbers/cancellation-policy` faqat barber JWT; `GET /api/barbers/:id/cancellation-policy` faqat faol va tasdiqlangan barber uchun public read-only.
- `POST /api/bookings` `expected_cancellation_policy` obyektini yuborishi mumkin. Server uni barber `FOR SHARE` row lock ostida tekshiradi; eski preview bo‘lsa `409 cancellation_policy_changed`, bron yaratmaydi. Eski clientlar uchun maydon ixtiyoriy (backwards-compatible).
- Migratsiya `20261201_cancellation_policy.sql` barber sozlamalarini va booking snapshot ustunlarini yaratadi. `BEFORE INSERT` trigger **har bir create yo‘li**, jumladan legacy/multi/manual INSERT uchun barber qoidalarini ko‘chiradi. Oldindan mavjud bronlar NULL va eski deadline cheklovisiz qoladi. Oldingi bronning cutoff/text snapshotlari keyin o‘zgarmaydi. Ish vaqtini o‘zgartirish/move bilan bron vaqti yangilansa ham cutoff interval o‘sha bronnikidir.
- Customer cancellation service bron egasini, barber lock va booking `FOR UPDATE`ni tekshiradi; `clock_timestamp()` bilan `booking_time - cutoff_minutes` chegarasini belgilaydi. **Chegara va undan keyin** `409 cancellation_deadline_passed`, DB `ROLLBACK`. Barber actor bundan mustasno; takroriy cancelled replay muddat o‘tgan bo‘lsa ham 200 no-op.
- Customer `Bronlarim` ro‘yxat va tafsilotlarda snapshot deadline/izohni ko‘radi. Frontend deadline bo‘yicha tugmani berkitadi, ammo authoritative server tekshiruvi saqlangan.
- **Onlayn to‘lov yo‘q**, jarima avtomatik hisoblanmaydi/undirilmaydi (`fee:0`).

## Migratsiya va test holati
1. Migratsiya ishlab chiqildi, `bootstrap.sql` va `bootstrap/verify.sql`da 30-chi forward migratsiya sifatida ro‘yxatga kiritildi. Operator tasdig‘i va backupdan oldin production DB’ga yo‘naltirmang.
2. Backend `npm test`: **351/351 PASS**; frontend `npm test`: **137/137 PASS**; `node node_modules/vite/bin/vite.js build`: **PASS**; `node scripts/audit-phase1.js`: 185 qaror va 30 migratsiya strukturasi PASS.
3. **QOLGAN:** real disposable PostgreSQL’da forward migration + trigger snapshot testlari, HTTP route integration va parallel create/policy-update concurrency E2E, browser demo/smartphone, backup/deploy. PostgreSQL serveri bu ish muhitida mavjud emas; qoida **production-ready** deb baholanmaydi.

## v18 ga ochiq
- #8 va #90: sartarosh ish jadvaliga tanaffuslar, ta'til va maxsus kunlar, mavjud bronlarni himoyalash.
- #105: cancellationdan keyingi muqobil slot takliflari.
- 2-bosqichdan qolgan account recovery real identity/DB E2E, 3-bosqich real concurrency testlari.
