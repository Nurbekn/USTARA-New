# USTARA v110 — kun chegarasi va QR/navbat testlari

## O‘zgarishlar

- Serverdagi `Asia/Tashkent` bo‘yicha **bugungi sana** QR token va QR so‘rovining haqiqiy kuni bo‘lishi shart.
- QR request status, active pending-list, QR pending capacity va kun yopish readiness faqat shu kunning pending QR so‘rovlarini faol hisoblaydi.
- QR tasdiqlanayotganida `INSERT INTO walkin_queue` va QR yakuniy `UPDATE` qayta muddat/sana/ish jadvalini tekshiradi; natija `0 rows` bo‘lsa `ROLLBACK`, audit yozilmaydi.
- Qo‘lda walk-in yaratish ham `WITH now_at` yordamida bitta PostgreSQL vaqt namunasidan sana/jadval oladi va final INSERT shartini o‘z ichiga oladi.
- Oldingi pending QR ID'lar bekor qilinmaydi yoki o‘chirilmaydi: kechagi pending so‘rovni tasdiqlab bo‘lmaydi, lekin tarix saqlanadi.

## Tekshirilgan buyruqlar

`cd backend && npm run test:v110:unit` — dependency-free tanlangan regressiya.

`cd backend && node --test test/*.unit.test.js` — keng backend: 1198 PASS / 26 FAIL (avvaldan qolgan missing npm packages, masalan express/bcrypt/jsonwebtoken).

`cd frontend && node --test test/*.test.js` — 902 PASS / 0 FAIL.

`cd backend && node scripts/v45-decision-integrity.js` — 185 qaror hash PASS.

`cd backend && node scripts/v108-day-close-db-check.js` — **NOT_RUN**: lokal PostgreSQL va maxsus test ruxsatisiz PASS qaytarmaydi.

## Haqiqiy PostgreSQL sinovi hali kerak

O‘zgarishlarning semantikasi unit SQL mock orqali tekshirildi, ammo **SQL real PostgreSQL’da bajarilmadi**. Ajratilgan test bazasida 45 migratsiyani o‘tkazib, quyidagilarni sinash zarur:

1. QR tokenni mahalliy 23:59 da yaratish, keyin 00:01 da `requestJoin` sinab, yangi kun navbati yaratilmasligini tekshirish.
2. 23:59 da kelgan QR requestni 00:01 da tasdiqlaganda 409/410 qaytishini, `walkin_queue`/audit yangilanmaganini tekshirish.
3. `closeDay` va `requestJoin`/`decide`/`join` raqobatini ikki ulanishdan boshlab, vaqtlar kesishmasini test qilish.
4. `INSERT ... WITH now_at` SQLni PostgreSQL parseri va transactionlarida bevosita tekshirish.

Asosiy 185 qaror o‘zgarmagan; 45 forward va 2 rollback SQL fayli biror harfi ham o‘zgarmagan. **Production-ready: YO‘Q**.
