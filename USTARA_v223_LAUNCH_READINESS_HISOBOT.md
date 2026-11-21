# USTARA v223 — amaliy launch readiness

## Tekshirildi
- v222 ZIP: AGENTS.md, backend/server.js, poolConfig, OTP/booking migratsiyalar, deploy hujjati, frontend Router.
- /api/health `SELECT NOW()` qiladi, ammo schema borligini tasdiqlamaydi. Frontend Cloudflare uchun `/` base va `_redirects` mavjud.

## O‘zgardi
- `backend/controllers/releaseReadiness.js`: `/api/ready` faqat SELECT yordamida 15 ta asosiy jadval mavjudligini tekshiradi. 200/503, DB host, SQL xato, jadval nomlari javobga chiqmaydi.
- `scripts/launch-smoke.cjs`: saytdagi 3 React sahifa, 2 API health/readiness endpoint va CORS preflight sinovi. Faqat o‘qiydigan so‘rovlar, operator yuritadi.
- `backend/package.json`: `npm run launch:smoke -- <frontend-origin> <backend-origin>`.
- `DEPLOY_CLOUDFLARE_RENDER_UZ.md`: deploydan so‘ng tekshiruv tartibi va profile-link env sozlamasi.

## Sinov doirasi
- `node --test backend/test/v223PublicLaunchReadiness.unit.test.js` — 6/6 PASS (mock pool/fetch).
- `node --test backend/test/v223PublicLaunchReadiness.unit.test.js backend/test/v222LaunchTelegram.unit.test.js` — 9/9 PASS.
- `backend/test/security-phase2.unit.test.js` — 4 PASS, 1 FAIL (mavjud `jsonwebtoken` tashqi paketi o‘rnatilmagan, `MODULE_NOT_FOUND`; test muhitidan bog‘liq).
- `node --check` — yangilangan JS fayllari PASS.
- Real PostgreSQL, Render/Cloudflare, Telegram webhook, brauzer va bron E2E: NOT_RUN.
- Build: kerakli tashqi node_modules bu muhitda yo‘q.
- GitHub, server va DB o‘zgartirilmadi; .env fayllarga tegilmadi.

## Chegara
- `/api/ready` faqat muhim jadvallar mavjudligini ko‘rsatadi; ustunlar, constraintlar, migratsiyalarning 100% bajarilishi, runtime booking yoki queue operatsiyasi to‘g‘ri ishlashini kafolatlamaydi.
- Barcha 185 qaror productionda tekshirilgan degan ma’no chiqmaydi.
