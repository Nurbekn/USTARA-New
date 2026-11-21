# USTARA v43: Telegram retry va operator nazorati

- Telegram HTTP 429 - aniq rad javobi; `retry_after` muddatidan oldin yubormang. Ishonchli muddat 30 kundan katta bo'lsa `failed`/operator review; avtomatik retry yo'q.
- Network timeout, 5xx va xato javoblar: **uncertain**, hech qachon ko'r-ko'rona replay qilmang. Telegram exactly-once delivery bermaydi.
- Operator read-only health `overdue_pending` (>15 min), `stale_lease`, `failed` va `uncertain` ni agregat qiladi. Shaxsiy ID/tokenlarni chiqarmaydi.
- Bu qoidalar barcha real PostgreSQL va Telegram API testlaridan o'tgan deb hisoblanmasin.

Test: `npm run test:v43:unit`, `npm run v43:readiness`.
