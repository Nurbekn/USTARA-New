# USTARA — saytni ishga tushirish (Cloudflare Pages + Render + Neon)

Bu yo‘riqnoma **v221 kodida tayyorlangan**, ammo haqiqiy hostingda sinovdan o‘tkazilmagan. Database migratsiyasini bu yo‘riqnoma avtomatik bajarmaydi.

## 1. Frontend: Cloudflare Pages

GitHub’da loyihaning **to‘liq kodi** mavjud bo‘lgandan keyin Cloudflare Pages’da yangi loyiha yarating:

| Sozlama | Qiymat |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm ci && npm run build:cloudflare` |
| Build output directory | `dist` |
| Node.js | `22` (Vite 8 mos minor versiya) |
| Environment variable | `VITE_API_BASE_URL=https://<sizning-backend-domeningiz>` |

`VITE_API_BASE_URL` tashqi HTTPS API **origin** bo‘lishi kerak. Unga `/api`, kalit, parol, query yoki slashdan tashqari path qo‘shmang. Bu ommaviy frontend sozlamasi — JWT yoki database parolini bu yerga yozmang.

`build:cloudflare` frontendning base path qiymatini `/` ga o‘rnatadi; `frontend/public/_redirects` esa `/login`, `/barbers/12`, `/queue/check-in/...` kabi SPA sahifalarni yangilaganda `index.html` qaytishini ta’minlaydi. Mavjud GitHub Pages buildi `/USTARA-New/` holida qoladi.

## 2. Backend: Render Web Service

| Sozlama | Qiymat |
| --- | --- |
| Root directory | `backend` |
| Build command | `npm ci` |
| Start command | `npm start` |
| Runtime | Node.js (Node 22) |

Render environment sozlamalarida kamida `NODE_ENV=production`, `JWT_SECRET`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` va `CORS_ALLOWED_ORIGINS` ni sozlang. `CORS_ALLOWED_ORIGINS` qiymati Cloudflare Pages saytingizning to‘liq origin qiymati bo‘lishi shart, masalan `https://<loyiha>.pages.dev`; agar alohida domen ham bo‘lsa, vergul bilan kiriting. `*` ishlatmang.

**Muhim:** backend ushbu versiyada `DATABASE_URL` ni emas, yuqoridagi **besh `DB_*` parametrni** o‘qiydi. Neon connection ma’lumotlarini ularga ajrating. Production’da PostgreSQL TLS sertifikati tekshiriladi (`rejectUnauthorized: true`).

Birinchi ishga tushirishdan oldin kerakli schema/migratsiyalarni **alohida, tasdiqlangan jarayonda** yaratish talab qilinishi mumkin. Production bazaga SQL bajarishdan oldin backup va reja zarur; bu ZIP migratsiya bajarmagan.

## 3. Telegram — bitta Render Web Service uchun webhook (v222)

**Muhim tuzatish:** eski yo‘riqnomada OTP uchun alohida doimiy `telegram:worker` kerak deb yozilgan edi. Backendda allaqachon `POST /api/auth/telegram/webhook` endpointi mavjud. Render Web Service bilan **webhook rejimini** tanlasangiz, kontakt, OTP va Telegram callbacklarini qabul qilish uchun *alohida polling worker shart emas*. Bu mijoz bildirishnomalarining barcha fon workerlarini almashtirmaydi.

Render Web Service uchun yuqoridagi database/JWT/CORS sozlamalariga qo‘shimcha ravishda quyidagilarni **maxfiy environment** orqali o‘rnating:

| Sozlama | Qiymat |
| --- | --- |
| `OTP_DELIVERY_ADAPTER` | `telegram` |
| `OTP_HMAC_KEY` | Maxfiy, kamida 32 baytli doimiy kalit |
| `TELEGRAM_BOT_TOKEN` | BotFather tokeni; frontendga qo‘shmang |
| `TELEGRAM_BOT_USERNAME` | `@`siz haqiqiy bot username |
| `TELEGRAM_UPDATE_MODE` | `webhook` |
| `TELEGRAM_WEBHOOK_SECRET` | Alohida tasodifiy 32–256 belgili `[A-Za-z0-9_-]` secret |

**Operator amali (faqat backend ishlayotganidan so‘ng, bir marta):** Bot tokeni, username va secretni maxfiy process environmentda sozlangan kompyuteringizda yoki xavfsiz operator muhitida `backend/` papkasidan quyidagini bajaring:

```sh
npm run telegram:webhook:setup -- https://YOUR-RENDER-DOMAIN.onrender.com/api/auth/telegram/webhook
```

Bu buyruq siz qo‘lda bajarganingizdagina Telegram API `setWebhook` chaqiruvini qiladi; server `npm start` vaqtida avtomatik webhook o‘zgartirmaydi. Bot tokenini URL argumentiga yozmang. Skript `allowed_updates=["message","callback_query"]`, `max_connections=1`, `drop_pending_updates=false` qiymatlari va secret-token header tekshiruviga mos sozlashni yuboradi. Oldindan boshqa bot yoki boshqa muhitda webhook bo‘lsa, ushbu amal o‘sha botning webhook manzilini almashtiradi — faqat **o‘zingiz boshqaradigan bot** uchun ishlating.

Bu rejimda `npm run telegram:worker`ni **ishga tushirmang**: polling va webhook bir bot uchun muqobil rejimlar. So‘ng tokenni oshkor qilmaydigan `npm run telegram:check` bilan bot va webhook holatini ko‘ring, Telegram botda o‘z kontaktingizni yuborib, saytda test OTP oqimini tekshiring. Biz bu ZIP bilan webhookni Telegram’da sozlamadik va real xabar yubormadik.

**Bepul Render cheklovi:** servis uyqu holatiga o‘tsa, webhook uyg‘onishi va bir daqiqalik OTP vaqti foydalanuvchi tajribasiga ta’sir qilishi mumkin. Render va Telegram bilan real sinov qilmasdan tezkor yetkazishni va’da qilmaymiz. `queue:notifications`, `customer booking notifications` va boshqa davriy outbox workerlar alohida jarayon talab qilishi mumkin; webhook ularning vazifasini bajarmaydi.

## 4. Ishga tushirgandan keyingi haqiqiy smoke-test

1. `https://<backend>/api/health` JSON javob qaytarsin (faqat PostgreSQL ulanishini tekshiradi). `https://<backend>/api/ready` esa akkaunt, OTP, bronlash va navbat uchun zarur jadvallar mavjud bo‘lsagina `{"status":"ready"}` va HTTP 200 qaytaradi; aks holda HTTP 503. Bu **migratsiyalar to‘liq va bronlash ishlaydi degan yakuniy isbot emas**, faqat asosiy schema mavjudligining read-only tekshiruvi.
2. Cloudflare sayti `/`, `/barbers`, `/login` sahifalarini va URL yangilanishini ochsin.
3. Browser Network’da API so‘rovlari Render HTTPS domeniga ketayotganini ko‘ring. `403 origin_forbidden` — backend `CORS_ALLOWED_ORIGINS` ni tekshiring.
4. `TELEGRAM_UPDATE_MODE=webhook` va `setWebhook` holatini tekshiring. Test akkaunt bilan Telegram OTP’ni tekshiring; bot kontaktdan kodni qaytarishi kerak.
5. Bron uchun bo‘sh vaqt olish → bron yaratish → `Bronlarim`da ko‘rish → sartarosh panelida ko‘rish → bekor qilishni sinang.
6. QR havolasi Cloudflare domenida `/queue/check-in/...` ko‘rinishida ekanini tekshiring.

### v224: ishga tushirishdagi HTML, JS/CSS va API uchun smoke-test

Frontend va backend hostingga chiqarilgach, **hech qanday DB yozuvi yoki Telegram xabari yubormasdan**, `backend/` papkasidan quyidagini ishlating:

```sh
npm run launch:smoke -- https://YOUR-CLOUDFLARE.pages.dev https://YOUR-BACKEND.onrender.com
```

Tekshiruv kamida 9 ta asosiy javobni tekshiradi: frontend bosh sahifasi, Vite yig‘gan JavaScript va CSS fayllari, `/login` va `/barbers` deep linklari; backend `/api/health`, `/api/ready` hamda ommaviy `/api/barbers` ro‘yxati; Cloudflare origin uchun GET CORS va OPTIONS CORS. JavaScript/CSS o‘rniga HTML fallback qaytsa, tekshiruv xato beradi. Ro‘yxat bo‘sh bo‘lishi mumkin — bu sinov ma’lumotlari borligini isbotlamaydi. Buyruq akkaunt ochmaydi, bron yaratmaydi, migratsiyalarni ishga tushirmaydi. Haqiqiy OTP va bron oqimi keyin brauzerda sinab ko‘rilishi shart. Test `503` qaytarsa, avvalo baza schema/migratsiyalarining **o‘qish orqali** holatini ko‘ring; production SQL amallarini alohida ruxsatsiz bajarmang.

**Qo‘shimcha sozlama:** agar Telegram xabarlarida sartarosh profiliga ommaviy havola ulash ishlatilsa, backendda `PUBLIC_PROFILE_APP_BASE_URL=https://YOUR-CLOUDFLARE.pages.dev` ni moslash kerak. Ixtiyoriy `VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN` alohida OG preview serveri uchun; mavjud bo‘lmasa, oddiy profil URL ishlatiladi.

## 5. Ushbu ZIP bilan nimalar tasdiqlangan?

- Frontend/bronlash bilan bog‘liq 103 ta lokal test **o‘tdi**.
- Backend bronlash va Telegramning 46 ta kutubxonaga bog‘lanmagan unit-testi **o‘tdi**.
- `prebuild:cloudflare` HTTPS API manzili yaroqliligini tekshiradi; manzil bo‘lmasa build boshlanmaydi.
- **Haqiqiy Vite build bajarilmadi** — bu muhitda `node_modules/vite` yo‘q, npm registry DNS hal qilinmadi.
- `bookings.unit.test.js` ham bu muhitda `jsonwebtoken` paketi yetishmagani sabab ishga tushmadi.
- Real PostgreSQL, haqiqiy Telegram, Cloudflare/Render deploy va browser E2E **bajarilmagan**.

## v224: lokal sinov holati va keyingi amallar

- `node --test backend/test/v223PublicLaunchReadiness.unit.test.js backend/test/v224AssetAndDirectorySmoke.unit.test.js`: **8/8 o‘tdi**.
- `npm ping`: **EAI_AGAIN (registry.npmjs.org DNS)**; shu muhitda `npm ci`, haqiqiy Vite build va Express startupni tasdiqlab bo‘lmadi.
- Kod va deploy qo‘llanmasi tayyor, lekin Cloudflare/Render/Neon'da hali ishga tushirilmagan.
- GitHub'ga kod yuklanmagan, real bazaga ulanish va migratsiya bajarilmagan.
- Haqiqiy hosting ochilgach, avval frontend build, Render backend va Neon schema holatini tekshiring, so‘ng `npm run launch:smoke -- ...`ni bajaring. Bu test OTP xabari yubormaydi, bron yaratmaydi.
