# USTARA v21 — Walk-in FIFO navbatining birinchi ishlaydigan qismi

**Scope:** 4-bosqichni boshlash. Ushbu versiyada sartarosh faqat o‘zi ko‘ra oladigan **joyida kelgan mijoz navbati**ni boshqaradi. U bron emas; avtomatik vaqt band qilmaydi. Mehmon QR orqali ro‘yxatga olinmaydi, Telegram chaqiruvi, ETA, shop-wide queue, manual reordering with audit reason va avtomatik Smart Booking offer **keyingi versiyalarda**.

## API (barchasiga `Authorization: Bearer <barber JWT>` kerak)

| Endpoint | Vazifa | Qoida |
|---|---|---|
| `GET /api/queue/mine` | O‘z navbati: faol va so‘nggi 20 yakunlangan | Faqat tasdiqlangan, faol sartarosh; boshqa sartarosh ma’lumoti qaytmaydi |
| `POST /api/queue/walk-ins` | `{request_id: '<32 hex>', label: 'Mehmon'}` | Server ish soatini tekshiradi; bir xil `request_id` qayta kelsa eski natija; boshqa label — `409` |
| `POST /api/queue/call-next` | Bugungi eng eski waiting ticket | Bir vaqtda bitta `called`; qayta bosish current called’ni qaytaradi |
| `PATCH /api/queue/:id/finish` | `{status:'served'|'missed'|'left'}` | `served`/`missed` faqat `called`dan, `left` `waiting` yoki `called`dan; terminalda replay no-op |

`status` ketma-ketligi: `waiting → called → served/missed/left`, yoki `waiting → left`. Mijoz uchun ism/telefon berish majburiy emas; default `Mehmon`, mijoz ismi ommaviy API’da ko‘rsatilmaydi. `request_key` hech bir API response’da chiqmaydi.

Bir sartaroshning barcha queue write amallari **shu sartaroshning bron va kalendarida ishlatilgan `pg_advisory_xact_lock(barber_id)`** bilan bir xil mutex oladi. FIFO — `id ASC`; server audit yozuvlarini o‘sha transaction’ga qo‘shadi. `walkin_queue_one_called_per_day` nomli partial unique index bir kun ichida ikkita `called` holatidan qo‘shimcha himoya qiladi. Queue ertangi kunda avtomatik bekor qilinmaydi: eski entries alohida ko‘rinadi, ammo bugungi chaqiriqqa qo‘shilmaydi; sartarosh ularni qo‘lda yakunlaydi.

## Database deploy

`backend/database/migrations/20261204_walkin_queue_core.sql` — forward-only, faqat oldingi `20261203_barber_break_rules` migratsiyasidan keyin, zaxira va catalog auditdan so‘ng **tasdiqlangan database**ga qo‘lda ishga tushiriladi. Fresh-install uchun `bootstrap.sql` va `bootstrap/verify.sql` yangilandi. DB migratsiyasi bajarilmaguncha API `503` qaytarishi mumkin — bu safar avtomatik migration bajarilmaydi.

## Testlar

- `cd backend && npm test` — unit testlar va barcha regressiyalar.
- `cd frontend && npm test` — frontend model testlari va regressiyalar.
- `cd frontend && node node_modules/vite/bin/vite.js build` — build (agar `.bin/vite` executable huquqi bo‘lmasa).
- **Real DB faqat opt-in:** lokal `ustara_test_db` (`ustara_account_test` role, oldindan v21 migration bilan) mavjud bo‘lsa, `NODE_ENV=test USTARA_WALKIN_QUEUE_TESTS=I_AUTHORIZE_TEST_DATA USTARA_TEST_DATABASE_URL=<reviewed-local-test-url> npm run test:queue:db`. Test explicit target guard va o‘z fixture-larini cleanup qiladi; production DB’da ishlatmang.

**Hali production tayyor emas:** ayniqsa database migratsiya, real parallel write PostgreSQL testi, Telegram/QR, va brauzer E2E bajarilishi kerak. Frontend API yoki fayl orqali navbat yaratish shart emas — sahifadagi sartarosh amalidan foydalaniladi.
