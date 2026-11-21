# USTARA v165 — operator xavfsizligi va bosqichli chiqarish (#67–#73)

Bu runbook **yo‘riqnoma**, infra avtomatik boshqaruvi emas. Release uchun production tayyorligi tasdiqlanmagan. Haqiqiy server, PostgreSQL, Telegram, mobil brauzer va restore drill uchun alohida operator tasdig‘i zarur.

### #67 — Telegram Control Center

- Admin > Telegram’da eski bot identifikatsiyasi tekshiruvi va yangi xabarlar navbati holati **faqat o‘qish** rejimida ko‘rsatiladi.
- `GET /api/admin/telegram/outbox` `pending`, `processing` / `sending`, `sent`, `failed`, `cancelled`, `uncertain` sonlarini beradi; `overdue_pending` va `stale_lease` aniqlanadi.
- `uncertain` **hech qachon avtomatik qayta yuborilmaydi**, chunki avvalgi so‘rov Telegramga yetib borgan bo‘lishi mumkin. Telegram, outbox va mijoz holatini qo‘lda solishtiring.
- Admin `503` olsa bu **health UNKNOWN**, sog‘lom degani emas. Bot token, chat ID, webhook URL va xabar matni admin API javobiga kiritilmaydi.

### #68 — System Control va rollback

- Admin > Tizim nazorati `GET /api/admin/system/readiness` orqali Telegram outbox yozuvlarini o‘qish imkonini va operator ogohlantirishlarini ko‘rsatadi.
- Bu **butun tizim sog‘lom** degani emas: CPU, ishchi jarayonlar, DNS, boshqa xizmatlar yoki p95 latency real kuzatilmaydi.
- Admin brauzerida rollback/restart/worker trigger mavjud emas. Favqulodda o‘zgarishni faqat vakolatli infratuzilma operatori review bilan bajaradi.
- Feature flag noto‘g‘ri bo‘lsa yoki tashqi qaramlik ishlamasa `unknown` deb ko‘rsatiladi. Monitoring statusi holatni avtomatik tuzatmaydi.

### #69 — Demo va avtomatlashtirilgan test markazi

- Offline va no-mutation tekshiruv: `node backend/scripts/v165-operations-checklist.cjs`; static qaror auditi: `node backend/scripts/v165-seven-operations-decisions.mjs --json`.
- Paketlar o‘rnatilgandan keyin: `(cd backend && npm test)` va `(cd frontend && npm test)`; real PG integratsiyasi va brauzer sinovlari faqat ajratilgan **test** infratuzilmasida.
- Bu CLI/CI gate; **Admin saytida demo ma’lumot yaratish yoki test bajarish UI yo‘q**. Sifat yo‘lagi FAIL bo‘lsa release to‘xtatiladi.

### #70 — Monitoring va ogohlantirishlar

- Hozircha operatorning qo‘lda ko‘rishi uchun `failed/uncertain` sonlari, kechikkan `pending` va eskirgan lease alertlari mavjud.
- Uzoq muddatli metrika, alert yuborish, incident ownership, SLA va javob vaqtini o‘lchash **hali yo‘q**. Yashil javob faqat ushbu query vaqtidagi outbox yig‘indisini anglatadi.
- Ma’lum bo‘lmagan jadval/status yoki DB xatosi `503` va `unknown` bilan tugaydi.

### #71 — Zaxira va tiklash

1. Operator productionga ulanish va backup siyosati bo‘yicha alohida ruxsat olsin. Foydalanuvchi roziligisiz ushbu skriptlar DBga tegmaydi.
2. Maxsus himoyalangan muhitda `pg_dump --format=custom --no-owner --no-acl --file=<private-path>/ustara-before-release.dump <reviewed-database>` bilan backup oling. Parolni CLI argumentlariga yoki loglarga yozmang.
3. `pg_restore --list <private-path>/ustara-before-release.dump` bilan fayl o‘qilishi tekshirilsin; **bu restore drill emas**. Sha256 va kirish huquqlarini auditda qayd eting; backupni umumiy fayl/ZIP ichiga qo‘shmang.
4. Alohida, yangi **test bazasida** vakolatli mutaxassis restore drill bajarsin, foydalanuvchi ma’lumotlarini maxfiy saqlasin va mosligini audit qilsin. Production ustidan avtomatik restore qilmang.
5. Forward-only migratsiyalarni teskari bajarish o‘rniga dastur rollbacki va oldindan sinovdan o‘tgan data-recovery rejasini alohida baholang.

### #72 — Bosqichli deployment

1. Avval test va backup/restore drill, keyin staging; release hash, migratsiya ketma-ketligi va monitoring alarm baseline’ni tasdiqlang.
2. `USTARA_ADMIN_READONLY_ROLLOUT=0` bilan yangi monitoring ko‘rinishini yopib turish mumkin. So‘ng reviewed config bilan `10`, `50`, `100` foizga o‘tkazing; har bir bosqichda DB query, admin login, Telegram navbat, bron, mobil tajribani tekshiring.
3. `503/unknown`, outbox `uncertain` va muddati o‘tgan lease uchun operator qarori talab qilinadi. Fail bo‘lsa rolloutni `0`ga qaytaring, kerak bo‘lsa tasdiqlangan oldingi **ilova** buildini qaytaring.
4. SQL migrationsni avtomatik teskari bajarish, jadval o‘chirish, eski noaniq xabarlarni qayta jo‘natish **taqiqlanadi**. Data restore faqat qo‘lda, alohida tasdiq bilan.
5. Post-deploy kamida bir marta funksional bron, auth, Telegram va read-only health’ni real stagingda tekshirib, natijani alohida yozing.

### #73 — Feature flags

- `USTARA_ADMIN_READONLY_ROLLOUT` faqat `0`–`100` butun son, `0` o‘chirilgan, `100` hamma faol admin uchun. Qiymat umuman ko‘rsatilmaganida **100 (read-only)**; noto‘g‘ri qiymatda xavfsizlik uchun **0**.
- Oraliq qiymatlarda `sha256(seed + ':' + adminId)` bo‘yicha stabil admin bucket qo‘llanadi; app instance’larida `USTARA_ADMIN_ROLLOUT_SEED` bir xil bo‘lsin. Seed sirli parol emas, API orqali oshkor qilinmaydi.
- Mijozlar, sartaroshlar va boshqa admin amallari ushbu flag bilan **o‘zgarmaydi**. Config o‘zgarishi uchun approved deploy/restart kerak bo‘lishi mumkin; paneldan in-app o‘zgartirish mumkin emas.

## Qabul holati

Static source audit **77/185**, production **NOT VERIFIED**. Endpointlar oqimlari unit-test bilan tekshiriladi; haqiqiy PG, Telegram, browser E2E, backup restoration, alert routing, staged deploy va rollback drill **NOT RUN**. Bu fayl operatsion yo‘l-yo‘riq va ochiq gaplarni qayd qiladi, ishlab turgan infra mavjudligini isbotlamaydi.
