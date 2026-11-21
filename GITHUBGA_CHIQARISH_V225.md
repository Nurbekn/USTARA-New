# USTARA v225 — GitHub'ga xavfsiz chiqarish va birinchi deploy

## Aniqlangan asosiy to'siq

2026-11-21 tekshiruvda `Nurbekn/USTARA-New` repozitoriysining `main` branchidagi `frontend/package.json` va `backend/package.json` ushbu ZIP ichidagi versiyalardan eskiligi tasdiqlandi. Repo ildizida `render.yaml` yo'q edi. Demak, aynan eski `main`ni hostingga ulash v225 kodini deploy qilmaydi.

**Bu arxiv GitHub root-ready:** uning ildizida `.github/`, `frontend/`, `backend/`, `render.yaml` joylashgan; ortiqcha `USTARA-New/` qatlami yo'q.

## 1. Toza alohida clone ichida yangi branch oching

Quyidagi misol Ubuntu terminali uchun. ZIP `~/Downloads/USTARA-v225-GitHub-Ready.zip` ichida deb olinadi. Boshqa joyga yuklangan bo'lsa, yo'lni moslang.

```bash
mkdir -p ~/ustara-release
cd ~/ustara-release
git clone https://github.com/Nurbekn/USTARA-New.git website
cd website
git switch -c release/v225-deploy
unzip -oq ~/Downloads/USTARA-v225-GitHub-Ready.zip -d .
git status --short
git diff --stat
```

Bu buyruqlar *yangidan klon qilingan nusxa* bilan ishlaydi, asosiy ishchi repodagi lokal o'zgarishlarni bosmaydi. `unzip`ni eski, o'zgartirilgan ishchi papkangizda ishlatmang.

## 2. O'zgarishlarni ko'rib, release branch'ni GitHub'ga yuboring

Faqat fayllar ro'yxatini ko'rib ma'qullaganingizdan keyin:

```bash
git add -A
git diff --cached --stat
git commit -m "Release USTARA v225 for deploy"
git push -u origin release/v225-deploy
```

Keyin GitHub'da `release/v225-deploy` → `main` pull request oching; ko'rib chiqibgina merge qiling. Bu qadamlar shu ZIP tayyorlangan muhitda bajarilmadi. GitHub main branch'ga hech nima yozilmadi.

## 3. Cloudflare Pages

- Repo: `Nurbekn/USTARA-New` — release branch merge qilingandan keyin.
- Root directory: `frontend`.
- Build command: `npm ci && npm run build:cloudflare`.
- Output directory: `dist`.
- Environment: `VITE_API_BASE_URL=https://SIZNING-BACKEND.onrender.com`.
- Node 22.x. Frontend `VITE_API_BASE_URL` backend manzilining **faqat HTTPS origin** qismi; `/api`ni qo'shmang.

## 4. Neon + Render

- Neon'da loyiha uchun alohida PostgreSQL bazasi kerak; mavjud production bazasiga tasdiqsiz migratsiya o'tkazmang.
- `render.yaml` repo ildizida; Render Blueprint shu fayldan bitta Free backend servis yaratadi.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `CORS_ALLOWED_ORIGINS`, `TELEGRAM_BOT_*`, `TELEGRAM_WEBHOOK_SECRET` ni hostingda maxfiy environment orqali kiriting.
- `healthCheckPath=/api/ready`. Shuning uchun 15 muhim jadval yo'q bo'lsa, Render readiness **503** qaytaradi. Bu deploy uchun muhim bloklovchi holat: migratsiyalarni alohida backup/ruxsat bilan bajarish kerak. ZIP migratsiyani avtomatik bajarMAYdi.
- Telegram webhook `setWebhook` faqat bot egasi tomonidan alohida ishga tushiriladi; tokenni GitHub'ga yozmang.

## 5. Ishga tushganidan keyin tezkor tekshiruv

`backend` ichidan:

```bash
npm run launch:smoke -- https://SIZNING-CLOUDFLARE.pages.dev https://SIZNING-BACKEND.onrender.com
```

Bu faqat o'qish so'rovlarini bajaradi; OTP va bronni yaratmaydi. Keyin o'zingizga tegishli test akkauntda OTP → bron → sartarosh tasdig'i oqimini qo'lda sinang.

## Hali tasdiqlanmagan

- Bu muhitda `vite`, `express`, `pg` kabi npm dependency'lar yo'q; frontend Vite build / backend start bajarilmadi.
- Haqiqiy Neon bazasi, Telegram bot, Render, Cloudflare va brauzer E2E sinovi bajarilmadi.
- GitHub'ga hech narsa push qilinmadi.

Loyiha kodi avvalgi v225'dagi kabi saqlandi, faqat ushbu qo'llanma qo'shildi va ZIP strukturasining ortiqcha root qatlami olib tashlandi.
