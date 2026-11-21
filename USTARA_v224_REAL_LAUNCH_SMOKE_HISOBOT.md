# USTARA v224 — Real launch smoke tekshiruvini kuchaytirish

## Ko‘rib chiqilgan
- `scripts/launch-smoke.cjs`, backendning `/api/barbers`, `/api/health`, `/api/ready` yo‘llari.
- Frontend Vite, Cloudflare Pages sozlamalari va `DEPLOY_CLOUDFLARE_RENDER_UZ.md`.
- `AGENTS.md` xavfsizlik talablariga amal qilindi.

## Tuzatish
1. Eski public smoke-test HTML shell mavjudligini tekshirardi, lekin JavaScript/CSS build assetlariga alohida so‘rov yubormas edi. Endi `/assets/*.js` va `/assets/*.css` fayllari mos MIME bilan xizmat qilayotganini tekshiradi; SPA fallbackdagi HTML xato sanaladi.
2. Endi `/api/barbers` GET o‘qish so‘rovi ham yuboriladi va natija array bo‘lishi hamda frontend origin uchun CORS ruxsati talab qilinadi. Bu haqiqiy sartarosh katalogi SQL so‘rovi xatosini aniqlashga yordam beradi.
3. Vite build, database migratsiyalar, backend biznes logikasi va frontend UI o‘zgartirilmadi.

## Bajarilgan testlar
- `node --test backend/test/v223PublicLaunchReadiness.unit.test.js backend/test/v224AssetAndDirectorySmoke.unit.test.js` — 8/8 o‘tdi.
- `node --check scripts/launch-smoke.cjs` — o‘tdi.
- `npm ping` — EAI_AGAIN (DNS). Shuning uchun haqiqiy `npm ci`, Vite build yoki backend start bajarilmadi.

## Hali tekshirilmagan
- Cloudflare’da haqiqiy build va JS/CSS, Render’dagi server, Neon’ga ulanish, Telegram OTP va boshidan oxirigacha bronlash.
- Istalgan tashqi hosting ishini bajarish uchun o‘sha xizmatlarning real sozlamalari va deploy talab qilinadi.
- GitHub’da hech narsa o‘zgartirilmadi, PostgreSQL’ga yozish amali bajarilmadi.
