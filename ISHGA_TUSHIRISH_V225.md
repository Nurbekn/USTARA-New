# USTARA — v225: saytni ishga tushirish yo‘li

**Holat:** GitHub/Render/Neon/Cloudflare'ga ushbu ZIP bilan o‘zgartirish yuborilmadi. Lokal Vite build `npm` registriga DNS sabab ulanmagani uchun bajarilmadi. Real PostgreSQL va Telegram ishlashi tasdiqlanmagan.

## 1. Nima yangilandi?

- `render.yaml`: Render uchun **bitta** bepul (`plan: free`) Node.js backend Web Service Blueprint konfiguratsiyasi.
- Render source katalogi `backend`; `npm ci --omit=dev` va `npm start` ishlatiladi.
- `autoDeployTrigger: off`: keyingi commitlar avtomatik yangi deploy boshlamaydi.
- `healthCheckPath: /api/ready`: database schema tayyor bo‘lmaguncha **deploy sog‘lom hisoblanmasligi** kerak.
- Telegram webhook sozlamalari **faqat environment orqali** beriladi. Bot webhook URL'sini belgilash avtomatik bajarilmaydi.
- Migratsiya, seed, SQL yozuvlari bu Blueprint tomonidan bajarilmaydi.

## 2. GitHub’da qaysi kod bo‘lishi kerak?

Ushbu ZIP ichida **`USTARA-New`** ildiz katalogi bor. Repoga shu katalogning **ichidagi** `.github/`, `frontend/`, `backend/`, `render.yaml` va qolgan fayllarni joylashtiring. Agar repo ichida yana `USTARA-New/` qatlamini yaratib qo‘ysangiz, Render `rootDir: backend` va Cloudflare `frontend` papkasini topolmaydi.

Repo to‘liq va tekshirilgan kodni o‘z ichiga olmagan bo‘lsa, Blueprint’ni ishga tushirmang. Mavjud repodagi o‘zgarishlarni ustidan yozmang; avval farqlarni solishtiring.

## 3. Render — backend

1. Render Dashboard → **New → Blueprint** → GitHub repongizni tanlang. Blueprint joylashuvi: repo ildizidagi `render.yaml`.
2. `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` qiymatlarini Neon'dan oling; `DB_PORT` 5432. `DB_HOST`ga `postgresql://` yoki port/path kiritmang.
3. `CORS_ALLOWED_ORIGINS`: Cloudflare sahifasining haqiqiy to‘liq HTTPS origini, masalan `https://ustara.pages.dev`. `*` emas.
4. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (`@`siz) va `TELEGRAM_WEBHOOK_SECRET`ni xavfsiz Render secret qiymatlari sifatida kiriting. Secret `[A-Za-z0-9_-]` belgilardan iborat 32–256 belgili bo‘lsin.
5. `JWT_SECRET` va `OTP_HMAC_KEY` Blueprint'da tasodifiy yaratiladi. Ularni qayta yaratish mavjud sessiya/OTP tekshiruvlariga ta’sir qilishi mumkin.
6. Render’da **manual deploy** qiling. **Muhim:** `/api/ready` uchun migration jadvallari oldindan mavjud bo‘lishi kerak; aks holda 503 qaytadi. Migratsiyalarni ushbu ish doirasida avtomatik bajarmadik. Real bazaga yozishdan oldin backup va alohida tasdiq talab qilinadi.
7. `https://<render-domain>/api/health` DB ulanishini, `/api/ready` zarur jadvallarni tekshiradi. Bu E2E bronlash testi emas.

**Tarmoq:** Neon TLS sertifikati tekshiriladi. DB ulanishida sertifikat yoki pooler sozlamasi muammosi chiqsa, xavfsizlik tekshiruvlarini o‘chirib qo‘ymang; xatoni alohida tekshiring.

## 4. Cloudflare Pages — frontend

- Git integration: shu GitHub repo.
- Root directory: `frontend`
- Build command: `npm ci && npm run build:cloudflare`
- Output directory: `dist`
- Environment: `VITE_API_BASE_URL=https://<render-domain>` (faqat origin, `/api` qo‘shilmaydi).
- Node.js: `22.16.0` yoki loyihadagi kutubxonalarga mos yangiroq 22.x; `NODE_VERSION` orqali sozlang.

`frontend/public/_redirects` SPA deep-linklarni qo‘llaydi. Frontendni deploy qilgandan keyin `https://<pages-domain>/barbers` va `/login` sahifalarini URL orqali ochib tekshiring.

## 5. Bot webhook'ini ulash

Render backend ishga tushib, database schema tayyor bo‘lgach va faqat **o‘zingizga tegishli bot** uchun `backend/` papkada:

```bash
npm run telegram:webhook:setup -- https://<render-domain>/api/auth/telegram/webhook
```

Bu buyruq real Telegram bot sozlamasini **o‘zgartiradi**, shuning uchun alohida ruxsat bilan ishlating. Polling worker bilan parallel ishlatmang. `npm run telegram:check` yordamida holatni tekshirish mumkin. Telegram tokenlarini hech qachon chatga yoki repoga kiritmang.

## 6. Live o‘qish-only smoke tekshiruvi

`backend/` ichidan (o‘z hosting manzillaringiz bilan):

```bash
npm run launch:smoke -- https://<pages-domain> https://<render-domain>
```

Bu HTML, Vite JS/CSS, `/api/health`, `/api/ready`, `/api/barbers` va CORS'ni tekshiradi, **bron yaratmaydi**. Keyin haqiqiy akkaunt va test sartarosh bilan qo‘lda OTP → bron → tasdiq → bekor qilish oqimini sinab ko‘rish kerak.

## 7. Aynan nimalar hali tayyor emas?

- Internet DNS xatosi sabab bu muhitda `npm ci` / Vite build tasdiqlanmadi.
- Backend Express bilan real startup ham bu muhitda tashqi dependency'lar yo‘qligi sabab tasdiqlanmadi.
- Neon migratsiyalari, Telegram webhook va browser E2E sinovi ishlatilmadi.
- `render.yaml` fayli sintaktik YAML sifatida lokal tekshirildi; Render'ning o‘z Blueprint validator/API'sida tekshirilmagan.

**Muhim:** Render Free uyqudan uyg‘onganda Telegram OTP 1 daqiqalik vaqtiga ulgurmasligi mumkin; bepul hostingda doimiy tezlik kafolatlanmaydi.
