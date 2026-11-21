# USTARA v24 — Jonli navbat, ETA va QR mehmonni chaqirish

**Bosqich:** 4 / qisman. **Asos:** v23 ZIP. **Yangi migration yo‘q** (35 ta).

## API

- `GET /api/queue/public/:barberId` — ommaviy, faqat tasdiqlangan faol sartarosh uchun. `waiting_count`, `currently_called`, yangi keluvchi uchun `new_arrival_estimate` (min/max) va ogohlantirish; **ism, telefon, bronlar, navbat IDlari qaytmaydi**. Shaxsiy bron sonini oshkor qilmaydi. `Cache-Control: no-store`, bevosita socket IP bo‘yicha limiter (120/10 min/per-process).
- `POST /api/queue/qr-status` — oldingi kabi **48 hex QR token + 32 hex so‘rov ID** jufti talab etiladi. `pending/rejected/expired` holatlarida faqat `status`. `approved` holatida `queue_status` (`waiting/called/served/missed/left`), faqat egasining `position` va `estimated_wait` qiymatlari chiqadi; begona navbatning ismi yoki IDsi qaytmaydi. Status SQL serverning bugungi Toshkent sanasi va `queue_position ASC NULLS LAST,id` tartibiga tayanadi, shuning uchun v23 manual reorder ham ko‘rinadi.
- `POST /api/queue/call-next` va `PATCH /api/queue/:id/finish` **avvalgi tranzaksiyali** call/finish kodidir; v24 alohida, parallel chaqirish yo‘lini qo‘shmaydi. QR mehmoni o‘z oynasida `called` holatni ko‘radi.

## ETA modeli va UI

- Walk-in QR’da xizmat oldindan tanlanmagani uchun hisob **taxminiy oraliq**: joriy faol xizmatlarning o‘rtacha davomiyligi 5 daqiqaga yaqinlashtiriladi (5–90 daqiqa, fallback 20). Navbatda nechta kishi oldinda va hozir chaqirilgan kishi borligidan kelib chiqib `min_minutes`/`max_minutes` hisoblanadi.
- ETA **band qilingan vaqt emas**: xizmat turi, jadvaldagi bronlar va amaldagi kechikishlar sabab sezilarli o‘zgarishi mumkin. Admin yoki sartarosh bu taxminni xizmat va’dasi sifatida ko‘rsatmasligi kerak.
- QR sahifasi tasdiqlanganidan keyin ham har **15 soniyada** ticket holatini yangilaydi, `called/served/missed/left`ni ko‘rsatadi, terminal holatda polling to‘xtaydi. Sartarosh Navbat sahifasi 15s, ommaviy sartarosh profili 30s oralig‘ida yangilanadi; yashirin oynada so‘rov yuborilmaydi. Real-time WebSocket/push **hali yo‘q**.
- Ommaviy profil faqat umumiy walk-in sanog‘ini ko‘rsatadi; `barber.id` bo‘yicha faqat ruxsatli API. QR token brauzerning mavjud `sessionStorage` holatiga bog‘liq; uchinchi tomon QR xizmatiga yuborilmaydi.

## Test va cheklov

- Backend `npm test`: **409/409 PASS**; frontend `npm test`: **152/152 PASS**; Vite production build **PASS**; o‘zgargan JSX ESLint **PASS**; offline 185/35 reyestr audit **PASS**.
- QR real PG integratsiya testining kutilgan javobi yangi ticket/ETA formatiga moslandi, `called/served` holati ham tekshirildi. **Bajarish SKIP**: PostgreSQL server mavjud emas. Brauzer/mobile E2E va Telegram real xabarlari ham bajarilmagan. Bu qism **production-ready emas**.
- Telegram orqali chaqirish, push notification, 5 daqiqalik oldinroq bo‘sh slot taklifi, shop-level queue va server-side shared distributed rate limit hali **qo‘shilmadi**.

## Davom ettirish

`USTARA-4-Bosqich-Live-Queue-v24.zip` + `docs/USTARA_LATEST_CHECKPOINT.md` dan boshlang. Keyingi v25: **Telegram navbat chaqiruvlari va delivery outbox** (faqat aniq bog‘langan Telegram akkaunt uchun) yoki 5 daqiqalik Smart Booking takliflari. Tasdiqlanmagan real DB testlarini alohida saqlang. `node_modules` / `.env` / build arxivga kiritilmasin.
