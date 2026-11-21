# USTARA v162 — #46–#52 dalilli badge, taxminiy tushum va xavfsizlik auditi

**Asos:** USTARA v161 ZIP. `docs/USTARA_185_NAZORAT.csv` va oldingi migratsiyalar o‘zgartirilmagan. Manba auditi ishlab chiqarishga tayyorlik sertifikati emas.

## Ushbu bosqichda amalga oshirilgan o‘zgarishlar

### #46–#48 — dalilga bog‘langan sartarosh badge tizimi

- Tasdiqlangan sartaroshlar uchun uchta toifa: `identity_checked`, `experience_checked`, `portfolio_checked`. Bu belgilar yuqori sifat, litsenziya yoki alohida professional sertifikat degani emas — Admin tekshiruvining cheklangan mazmunini bildiradi.
- Yangi `20261220_barber_evidence_badges.sql` forward migratsiyasi; `barber_evidence_badges` joriy holatni, `barber_badge_audit_events` esa har bir berish/bekor qilishni va sababini saqlaydi. Oldingi SQL migratsiyalari tahrirlanmagan. Endi 49 forward va 2 rollback fayl mavjud.
- Yangi himoyalangan API: `GET /api/admin/badges?page=N` va `PUT /api/admin/badges/:barberId/:badgeType` (`action`, `evidence_note`, `expected_revision`). Faqat haqiqiy aktiv Admin sessiyasi, tasdiqlangan sartarosh, 20–500 belgi izoh, ruxsat etilgan badge toifalari va yangilanish revisioniga mos so‘rovlar o‘tadi. Transaksiyadagi `FOR UPDATE` va revision ikki Admin yozuvi to‘qnashganda eskirgan yozuvni rad etadi. COMMIT natijasi noma’lum bo‘lsa tizim muvaffaqiyat da’vo qilmaydi va avtomatik takrorlamaydi.
- Ochiq API: `GET /api/barbers/:id/badges` faqat tasdiqlangan sartaroshning **faol badge toifalarini** beradi. Dalil izohi, Admin identifikatori va bekor qilingan belgilar maxfiy saqlanadi. Sartarosh profili ochiq bo‘lsa shu belgilar 3 tilda ko‘rinadi; Admin panelida alohida badge bo‘limi va sahifalash mavjud.
- Migratsiya hali **real PostgreSQL bazasida ishga tushirilmagan**. API va UI real DB/browser integratsiyasida sinalmagan. Mijozga shaxsiy ID, pasport raqami kabi ma’lumotlarni izohga kiritmaslik bo‘yicha operatsion siyosat hali belgilanishi kerak.

### #49 — dalilli shikoyat va apellyatsiya

- Mavjud `profile_issue_reports` mijoz yuborgan izohli profil xatosini va Admin ko‘rib chiqishini saqlaydi. Mijoz haqida maxfiy ma’lumot Admin ro‘yxatida ochilmasligi unit-testlangan.
- **QOLGAN:** mustaqil apellyatsiya, hujjat/rasm ilovalari va qayta ko‘rib chiqish jarayoni mavjud deb hisoblanmaydi.

### #50 — taxminiy tushum

- `/api/barbers/earnings` mavjud summa va guruhlash hisobini saqlab qoladi; endi `estimateOnly: true`, `paymentVerified: false` maydonlarini majburiy qaytaradi.
- Sartaroshning dashboardi va tushum sahifasi summa **taxminiy** ekanini ko‘rsatadi; to‘lov olinganini tasdiqlamaydi. Ingliz, rus va o‘zbek matnlari kiritildi.
- Naqd/to‘lov faktlarini mustaqil solishtirish funksiyasi yo‘q; shuning uchun bu hisob haqiqiy olingan daromad emas.

### #51 — no-show adolati

- Mavjud `called -> missed` navbat holatini faqat sartaroshning joriy ruxsati va `expected_status` bilan o‘zgartirish mexanizmi, replay va audit testlari ko‘rib chiqildi.
- **QOLGAN:** bronning alohida kelmaganlik nizolari, apellyatsiya, foydalanuvchiga ko‘rsatiladigan qo‘shimcha izohlar.

### #52 — bron snapshotlari

- Mavjud xizmat narxi, nomi, davomiyligi va bron vaqtining bir qismi saqlanishi hamda o‘zgartirishdagi transaksion yaxlitlik manba/testlar bilan tekshirildi.
- **QOLGAN:** bron paytidagi manzil snapshotini barcha oqimlarda mustaqil va o‘zgarmas holatda saqlash, real PostgreSQL E2E.

## Sinovlar va ma’lum cheklovlar

- **Frontend Node unit:** 1634/1634 PASS; 0 fail.
- **Backend to‘liq Node unit:** 1564/1593 PASS, 29 fail — bu muhitda `express`, `pg`, `jsonwebtoken`, `bcrypt` va ularning bog‘liqliklari mavjud emas. Shu sabab to‘liq backend suite PASS **emas**.
- **Backend tanlangan migratsiya, audit, Admin xavfsizligi va regressiya testlari + frontend tanlangan testlar:** 119/119 PASS (kodga so‘nggi o‘zgartirishlar kiritilgunga qadar, keyin backend to‘liq test qayta o‘tkazildi).
- Badge uchun 9 ta backend, 3 ta frontend unit-test **12/12 PASS**; taxminiy tushum uchun 3 ta va #46–#52 audit uchun 2 ta yangi backend test **5/5 PASS**.
- **6 ta JSX komponent** TypeScript transpiler yordamida sintaktik tekshirildi: PARSE PASS. Bu Vite production build / brauzer E2E o‘rnini bosmaydi.
- `node scripts/v67-migration-audit.cjs`: 49 forward / 2 rollback, OFFLINE_PASS. Real DB migratsiyasi **bajarilmadi**.
- `node backend/scripts/v162-seven-evidence-and-safety-decisions.mjs`: **56/185** noyob manba izlari (49 + 7), yana **129** ta indekslanmagan. Bu ishlab chiqarish tayyorligini anglatmaydi.
- Haqiqiy PostgreSQL integratsiyasi, ikki Adminning real parallel tranzaksiyasi, brauzer UI, Telegram, accessibility va production build **NOT_RUN**.

## Keyingi bosqich

v163 — asl reyestrdagi #53–#59. Avval #49 apellyatsiya va #52 manzil snapshoti ochiq masala ekanini unutmaslik kerak. Ishlab chiqarish deployidan oldin faqat ruxsatli test muhitida 49-forward migratsiyani operator tekshirishi va alohida qo‘llashi kerak. Hech qanday real bazaga hozir migratsiya qo‘llanmagan.
