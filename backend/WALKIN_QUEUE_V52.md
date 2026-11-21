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

# USTARA v52 — test yo‘riqnomasi

## Hozir o‘tgan offline tekshiruvlar

```bash
cd backend
npm run test:v52:unit
node --test test/*.unit.test.js
node scripts/v45-decision-integrity.js
node scripts/audit-phase1.js
node scripts/decision-coverage.js
cd ../frontend
node --test test/*.test.js
```

`node --test`ning 26 ta dependency xatosi hal qilinmasdan uni FULL PASS deb hisoblamang.

## Maxsus staging muhiti (faqat izolyatsiyalangan test bazasi)

1. Backend va frontend papkalarida internet mavjud xavfsiz muhitda `npm ci` bajaring; **kalitlar, tokenlar yoki `.env`ni ZIPga qo‘shmang**.
2. Ishlab turgan muhit yoki production bazasidan foydalanmang. Mavjud `backend/test/helpers/testDatabaseTarget.js` talablariga mos, alohida `ustara_test_db` bazasi va cheklangan test foydalanuvchisi yarating.
3. `backend/scripts/v49-staging.js` hujjatidagi aniq ruxsat o‘zgaruvchilarini tekshiring. So‘ng izolyatsiyalangan bazada `node scripts/v49-staging.js` orqali oldingi parallel consent testlarini bajaring. `SKIP`/`NOT_RUN` = PASS emas.
4. v52 uchun ayniqsa quyidagilarni real PostgreSQL bilan qo‘lda E2E sinang: QR token muddati `INSERT` paytida tugashi; QR bir marta iste’mol qilinishi; taklifni qabul qilish SQL `UPDATE` paytida expiry; 2-minut tasdiqlash oxirgi `INSERT` paytida expiry; navbat `left` yozuvi o‘zgarmasa bron `ROLLBACK`.
5. Telegram test boti va mobil brauzerda QR, Smart Booking va qayta kirish oqimlarini alohida sinang. Frontendda `npm run build` va `npm run lint`, backendda to‘liq unit + integratsion sinovdan keyingina release qarori chiqaring.

**Muhim:** real DB, Telegram yoki mobil E2E testlari v52 arxivini yaratishda bajarilmagan. Test yorlig‘ini noto‘g‘ri ko‘rsatmaslik kerak.
