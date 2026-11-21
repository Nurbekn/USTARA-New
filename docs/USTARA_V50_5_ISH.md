# USTARA v50 — 5 ta QR xavfsizligi vazifasi (2026-11-19)

**Asos:** v49 ZIP, 701 fayl. Yangi loyiha ochilmadi. Bu v50 4-bosqichdagi QR/Navbat uchun xavfsizlik patchi; oldingi 185 ta qaror hamda 42 migratsiya o'zgarmaydi.

1. **QR chiqarish — akkaunt egaligi:** `tokenCreate` profilning `barbers.user_id` qiymati sessiyadagi `req.user.id`ga mos kelishini, `users.role='barber'`, tasdiq va faollikni `FOR SHARE OF b,u` bilan tekshiradi. Keyin `pg_advisory_xact_lock` olinadi. Begona ID bilan token yaratilmaydi.
2. **QR pending ro'yxati:** `pendingList` shu tekshiruvni bitta PostgreSQL tranzaksiyasiga o'tkazadi; profil ID bo'yicha boshqa hisobning ro'yxati ochilmaydi. `Cache-Control:no-store` saqlandi.
3. **QR tasdiqlash/rad etish:** `decide` ham sartarosh akkauntini profil bilan bog'laydi va shaxsiyat qulfini navbat qulfidan avval oladi. Huquqsiz hisob audit yoki queue entry yaratmaydi.
4. **QR token/so'rov replay muddati:** `requestJoin` tokenning haqiqiy muddatini va avval yuborilgan pending so'rovning 30 daqiqa davrini PostgreSQL `clock_timestamp()` bilan tekshiradi — Node server soati qaror chiqarmaydi.
5. **QR status va tasdiqlash muddati:** `requestStatus` pending validity va `decide` 30 daqiqalik confirmation oynasini PostgreSQL vaqtiga ko'chiradi. Eskirgan tasdiq 410 qaytaradi.

**QA dalili:** 5 yangi test PASS; tegishli 29 backend unit test PASS; eski walkinQr testidan 15 PASS (1 route-test express dependency sabab bloklandi). Frontend 178/178 PASS. To'liq backend 400 PASS / 26 FAIL (yetishmayotgan `express`, `pg`, `bcrypt`, `jsonwebtoken`; bularni PASS hisoblamang). `audit-phase1` 185/42 PASS, `v45-decision-integrity` CSV hash unchanged PASS. Real PostgreSQL, Telegram, mobile E2E va Vite build **NOT_RUN**. **Production-ready emas.**

**Cheklov:** Mock testlar PostgreSQL'dagi haqiqiy lock/vaqt holatlarini to'liq isbotlamaydi. Ajratilgan staging DB'da v49 ikki-sessiyali testlari va v50 QR E2E, keyin mobil brauzer hamda Telegramni real muhitda tekshirish kerak.
