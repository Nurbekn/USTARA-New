# USTARA v98 — bajarilgan ishlar

1. **Faol navbat sanasi:** barber `GET /queue/walk-ins` javobidagi active qatori faqat bugungi Tashkent sanasiga filtrlandi; o'tgan kunning terminal tarixi saqlanadi.
2. **Idempotency / eski so‘rov:** kechagi `request_id` qayta yuborilganda `410 queue_request_expired`; bugungi ayni request `replayed:true`.
3. **Status o‘tish to‘sig‘i:** `finish` `UPDATE ... RETURNING` `queue_date=today` precondition bilan, natija bo‘lmasa `409 queue_changed`; terminal replay o'zgarishsiz.
4. **Unit regressiya:** 12 ta yangi test va eski test mockini yangilash; `test:v98:unit` 43 PASS, frontend 696 PASS.
5. **Real DB ssenariysi:** `v96QueueArrival.postgres.integration.test.js` v98 boundary case qo‘shildi, lekin lokal PostgreSQL yo‘qligi sababli 1 SKIP; 44 migratsiya va 185 asl qaror o‘zgarmadi.

## Cheklovlar

- PostgreSQL test bazasini bu muhitda ishga tushirmadik; cron, real ikki qurilmali race, browser/Telegram E2E NOT_RUN.
- Keng backendda 26 dependency FAIL; ularni PASS deb bo‘lmaydi.
- Oldingi API idempotency va status nomlari o‘zgarmadi. Yangi SQL migratsiya yo‘q.
