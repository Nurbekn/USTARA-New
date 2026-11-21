# USTARA — 2-bosqich xavfsizlik hisoboti

Ushbu o‘zgarishlar **1-bosqich ZIP ustida** bajarildi. Oldingi ZIP’lar o‘zgartirilmagan.

## Ishlab chiqilgan

- Production CORS allowlist: `NODE_ENV=production` bo‘lsa `CORS_ALLOWED_ORIGINS` talab qilinadi. Faqat to‘liq va aniq `http(s)://...` originlar; production uchun HTTPS tavsiya etiladi; `*` yo‘q. Telegram va serverdan serverga no-Origin so‘rovlar bloklanmaydi.
- Xavfsizlik headerlari: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- JWT tekshirish `algorithms: ['HS256']`; sarlavha noto‘g‘ri bo‘lsa 401.
- “Barcha qurilmalardan chiqish”: mavjud `account_session_versions` jadvaliga mos, parol/reset yoki telefon o‘zgarishidagi sessiya invalidatsiyasiga zid emas; client eski token bilan yangi so‘rov yubormasligi uchun tasdiqlangan muvaffaqiyatdan so‘ng tozalanadi.

## Production konfiguratsiya namunasi

```ini
NODE_ENV=production
CORS_ALLOWED_ORIGINS=https://ustara.uz,https://www.ustara.uz
```

Har bir domeningizga mos manzilni kiriting. Noto‘g‘ri ro‘yxat yoki bo‘sh origin bo‘lsa server production rejimida boshlanmaydi. `CORS` autentifikatsiya o‘rnini bosmaydi; backend har so‘rovda JWT/rol va vakolatni tekshirishi shart. Telegram tokenini va Gemini kalitini frontendga chiqarmang.

## Test qilingan

Unit: 280 backend, 114 frontend; frontend build. Izolyatsiyalangan PostgreSQL’ga real so‘rov, real Telegram bot va browser smoke-test **bajarilmagan**.

## Bajarilmagan qism

Account deactivation, real recovery-admin ish jarayoni, DB E2E, admin sessiya boshqaruvi va production deploy konfiguratsiyasi keyingi ishlab chiqishga qoldi. Bu ZIP’ni production-ready deb atamang.
