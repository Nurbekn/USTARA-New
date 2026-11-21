# USTARA v52 — yakuniy yozuv chegaralarini himoyalash (2026-11-19)

**Asos:** v51 ZIP (711 ta fayl), loyiha yangidan ochilmadi. 4-bosqich: QR / navbat / Smart Booking.

## 5 ta ish

1. **QR so‘rovni INSERT qilishdagi muddat:** `INSERT ... SELECT ... FROM walkin_qr_tokens WHERE expires_at>clock_timestamp() AND used_at IS NULL`. Token muddatining oxirgi payti SQL yozuvida ham tekshiriladi. `RETURNING` 0 bo‘lsa `410` va `ROLLBACK`.
2. **QR token bir marta ishlatilishi:** `UPDATE walkin_qr_tokens ... WHERE used_at IS NULL RETURNING id`. 1 ta qator o‘zgarmasa so‘rov/audit yozuvlari commit bo‘lmaydi (`409`/`ROLLBACK`).
3. **Smart Booking qarorining oxirgi SQL chegarasi:** `pending` taklif `accept/reject/cancel` bo‘lishidan oldin expiry, 5 daqiqalik kelajakdagi slot, waiting status va bugungi queue sanasi `UPDATE ... RETURNING` ichida tekshiriladi. Tekshiruv o‘tmasa taklif `expired`, yuborilmagan Telegram xabarlari `cancelled` va keyingi taklif uchun opening qayta ko‘riladi.
4. **Haqiqiy bronni yakuniy INSERT chegarasi:** 2 daqiqalik tasdiqlash muddati, 5 daqiqalik slot, active accepted offer va bugungi waiting navbat `INSERT INTO bookings ... SELECT ... WHERE` ichida ham tekshiriladi. 0 qator bo‘lsa `410`, bron yaratilmaydi.
5. **Navbat statusini atomar tugatish:** bron yaratilgach `UPDATE walkin_queue ... WHERE status='waiting' RETURNING id` 1 ta qator o‘zgartirishi majburiy; aks holda butun bron, snapshot va confirmation tranzaksiyasi `ROLLBACK`.

**Yangi:** `backend/test/v52FinalWriteFences.unit.test.js` (6 ta mock-test, 6/6 PASS), `npm run test:v52:unit`, bu runbook. Eski v51 test fixturelari yangi SQL `RETURNING` natijalariga moslashtirildi; xavfsizlik tekshiruvlari yengillashtirilmadi. **Yangi SQL migratsiya yo‘q** (42 ta mavjud).

## Haqiqiy tekshiruv (bu sessiya)
- Backend `node --test test/*.unit.test.js`: **411 PASS / 26 FAIL**, jami 437 test. 26 tasi `express`, `pg`, `bcrypt`, `jsonwebtoken` yetishmasligidan. **To‘liq PASS emas**.
- Frontend `node --test test/*.test.js`: **178/178 PASS**.
- `v52FinalWriteFences.unit.test.js`: **6/6 PASS**; oldingi tegishli 61/61 test ham PASS.
- `v45-decision-integrity.js`: **185 qaror, SHA-256 bir xil, PASS**. `audit-phase1.js`: **42 forward migratsiya tartibi PASS**. `decision-coverage.js`: 130 tekshiruvda, 47 qisman, 7 bekor/keyinga, #175 aniqlanmagan.
- **Real PostgreSQL parallel/expiry testlari, Telegram API, mobil brauzer E2E va Vite build NOT_RUN** (pg server, `pg`, vite va boshqa deps yo‘q). Unit testlar haqiqiy DB tranzaksiyasini isbotlamaydi.

**Release status:** production-ready EMAS. Maxsus test bazasida cheklarni real muddat kesishida sinab, barcha dependency va build testlarini o‘tkazmasdan deploy qilmang. `185` ro‘yxatni to‘liq amalga oshirilgan deb talqin qilmang.
