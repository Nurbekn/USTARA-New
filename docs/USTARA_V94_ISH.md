# USTARA v94 — eskirgan navbat bilan chaqirish va yakunlashdan himoya

**Talablar:** #23 (Keldi/Boshladi/Tugadi/Kelmadi) va #31–33 (FIFO, qo‘lda navbat tartibi) bo‘yicha qisman yaxshilanish.

- Server eski UI'ning `expected_next_id` qiymati joriy FIFO birinchisiga mos kelishini transaction va barber-wide lock ostida tekshiradi.
- Boshqa qurilma bir mijozni allaqachon chaqirgan bo‘lsa, uning ID'si aynan mos kelganida replay mumkin; boshqacha bo‘lsa `409 queue_changed` va hech qanday event/outbox update yo‘q.
- `finish` xizmatni yakunlashdan oldin `expected_status` (waiting/called) bilan haqiqiy holatni solishtiradi. Ko‘rsatilgan holatdan boshqa holatga o‘tilgan bo‘lsa yangi yozuv yozilmaydi.
- Oldingi `served`/`missed`/`left` statusga xuddi shu amal takrorlansa idempotency saqlanadi; boshqacha terminal holatga o‘tkazilmaydi.
- Frontend faqat tekshirilgan snapshotdan optimistik intent yaratadi; server himoyasi majburiy asos bo‘lib qoladi.
- Eski API mijozlari orqaga mosligi saqlangan, lekin precondition yubormagan mijozlar yangi stale-protection'ni ololmaydi.
- **Mavjud emas:** xizmatni boshlash uchun alohida `in_service` DB statusi, real PostgreSQL/mobil E2E; shu sabab #23 hali to‘liq emas.
