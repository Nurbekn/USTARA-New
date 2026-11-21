# USTARA v51 — 5 ta ish hisoboti

**Boshlanish:** v50 ZIP, 705 fayl. 4-bosqich — QR / navbat / Telegram. 2026-11-19.

| № | Aniq o'zgarish | Dalil / kutilgan xatti-harakat |
|---|---|---|
| 1 | Token expiry advisory-lockdan keyin DB soatida qayta tekshiriladi | Qulf kutishida muddati tugagan token 410; QR join INSERT yo'q. `v51/1` PASS |
| 2 | QR approve/reject oxirgi yozuvda 30m shartini tekshiradi | `UPDATE ... RETURNING` 0 bo'lsa 410 va yaratilgan queue/eventlar ROLLBACK. `v51/2` PASS |
| 3 | Kechagi waiting/called QR statusi jonli bo'lib chiqmaydi | `queue_status:null`, position/ETA va Telegram flaglari yashiriladi. `v51/3` PASS |
| 4 | Telegram offer consent idempotent vaqt | Qayta `true` timestampni o'zgartirmaydi, `false` keyin `true` yangi davr. `v51/4` PASS |
| 5 | Allowlist staging muhitida ham ishlatiladi | `CORS_ALLOWED_ORIGINS` sozlansa begona HTTPS QR origin 403, production allowlist bo'lmasa 403. `v51/5` PASS |

**Regressiya:** selected backend 26/26; frontend 178/178; full backend 405 PASS / 26 dependency FAIL. Real DB, Telegram va mobil E2E bajarilmadi. 42 migratsiya, 185 asl qaror o'zgarmadi. Bu release hujjati emas.
