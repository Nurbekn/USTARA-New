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
