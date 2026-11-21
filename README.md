# USTARA-New
## 185 qaror va 1-bosqich auditi

- [Kod auditi va aniqlangan bo‘shliqlar](docs/USTARA_1_BOSQICH_AUDIT.md)
- [185 ta qaror nazorati — CSV](docs/USTARA_185_NAZORAT.csv)
- [10 bosqichli amalga oshirish rejasi](docs/USTARA_10_BOSQICH_REJA.md)

Offline tekshiruv: `cd backend && npm run audit:phase1`. Unit testlar: har bir `backend/` va `frontend/` papkasida `npm test`. Bu buyruqlar real PostgreSQL migratsiyasini yoki Telegram API so‘rovini ishga tushirmaydi. E2E va production sinovlari hali alohida bajarilishi kerak.

> Davom ettirishdan oldin **`docs/USTARA_PROGRESS.md`** ni o‘qing. Shu faylda oxirgi bosqich va qolgan ishlar saqlanadi.

## Cloudflare Pages joylash

Frontend Cloudflare Pages build sozlamalari va Render/Neon tartibi: [DEPLOY_CLOUDFLARE_RENDER_UZ.md](DEPLOY_CLOUDFLARE_RENDER_UZ.md). Ushbu versiyada haqiqiy deploy bajarilmagan.

## v222 Telegram uchun Render yo‘li

Render Web Service’ning o‘zida Telegram webhook rejimini sozlash va polling worker import xatosi tuzatilgani haqida [deploy qo‘llanmasi](DEPLOY_CLOUDFLARE_RENDER_UZ.md#3-telegram--bitta-render-web-service-uchun-webhook-v222)ga qarang. Backend yoki Telegram API bilan haqiqiy production sinov hali bajarilmadi.

## v223: ishga tushirilgan saytni tez tekshirish

Backend papkasidan `npm run launch:smoke -- https://FRONTEND.pages.dev https://API.onrender.com`. Bu `/api/ready`, SPA sahifalar va CORS ni faqat o‘qish orqali tekshiradi, real OTP/bron E2E o‘rnini bosmaydi. Tafsilot: [deploy qo‘llanmasi](DEPLOY_CLOUDFLARE_RENDER_UZ.md).

## v225 — Ishga tushirish

Bepul hosting uchun `render.yaml` (Render backend konfiguratsiyasi) va
`ISHGA_TUSHIRISH_V225.md` (Render + Neon + Cloudflare + Telegram qadamlari)ga qarang.
SQL migratsiyalarni va haqiqiy webhook sozlashni avtomatik bajarmaydi.
