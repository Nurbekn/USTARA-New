# USTARA v154 — QR GitHub Pages marshruti va CI source contract

**Asos:** v153 ZIP, 185 qarorning asl CSV fayli va barcha oldingi migratsiyalar saqlanadi.

## 7 ta yakunlangan kod ishi

1. **QR havola (Pages):** server QR check-in URLini `.../USTARA-New/queue/check-in/{opaque_token}` asosida yaratadi. Avvalki URL `.../queue/check-in/{token}` edi; GitHub Pages bazaviy marshrutiga mos kelmagan.
2. **Vite mount path:** sartaroshning `Queue.jsx` so‘rovi `import.meta.env.BASE_URL` va faqat ruxsat etilgan `origin` orqali base path yuboradi.
3. **Tilni saqlash:** `uz`, `ru`, `en` ruxsat etilgan `?lang=` parametrlari QR ochilganda mehmon sahifasiga o‘tadi. OTP/parol/session token ko‘chmaydi.
4. **Eski mijozlarga moslik:** `base_path/lang` kelmagan so‘rovlar lokal root `/queue/check-in` manzilini qo‘llab-quvvatlaydi; mavjud API response (`url`, `svg_data_uri`, `expires_at`, `ttl_minutes`) shakli saqlangan.
5. **Fail-closed validatorlar:** ma’lum bo‘lgan `/` va `/USTARA-New/` pathlaridan boshqasi, noma’lum til, `..`, `%2e%2e`, `//evil` kabi URLlar **DB tranzaksiyasidan oldin** 400 bilan rad qilinadi. Origin/CORS tekshiruvi, role, TTL, hash va navbat FIFO qoidalari o‘zgartirilmagan.
6. **Frontend/backend real unit regression:** 16 ta backend va 17 ta frontend v154 testi bilan 33 ta yangi sinov. Production allowlist kiritilganda server QR URLini to‘g‘ri qaytarishi, raw QR token SQLga yozilmasligi ham tekshirilgan.
7. **CI preinstall nazorat:** paket talab qilmaydigan `v154-qr-preflight.mjs` Vite base, frontend request va serverning path/lang validatorini tekshiradi; `.github/workflows/v55-verify.yml` ga `npm ci` dan oldingi bloklovchi qadam sifatida qo‘shildi.

## O‘tkazilgan tekshiruvlar (2026-11-20)

- Frontend **1604 / 1604 PASS**, 0 SKIP.
- Backend unit **1459 PASS / 26 FAIL**, 0 SKIP; barcha 26 oldingi v153 backend dependency xatolari bilan nomma-nom mos. Yangi regressiya ko‘rilmadi.
- Maqsadli **33 / 33 yangi test PASS** (16 backend, 17 frontend).
- Eski 27 ta QR testidan **26 PASS**, 1 ta avvaldan mavjud `express` dependency yetishmasligi sabab FAIL, yangi QR kod o‘zgarishi bilan bog‘liq emas.
- Offline `v150-pages-source-check`, `v153-source-graph` va yangi v154 QR contract preflight: **PASS** (faqat manba/konfiguratsiya).
- O‘zgargan JSX/JS sintaksisi TypeScript parser orqali **PASS**. GitHub Actions YAML **parse PASS**.
- Frontend `npm ci --offline`: **ENOTCACHED** (`zod-validation-error@4.0.2`). `npm run build`: **BLOCKED** (`vite: not found`). Vite production bundle **NOT RUN**.
- Haqiqiy QR skan, real PostgreSQL, Chrome/mobil/Telegram E2E va GitHub Actions ishga tushishi **NOT RUN**. Production-ready **YO‘Q**.
- GitHub Pages origin `https://nurbekn.github.io` serverdagi `CORS_ALLOWED_ORIGINS` ro‘yxatida faqat deploy qilingandan so‘ng admin tomonidan sozlanishi shart. Hozirgi muhitda real backend domen/deploy mavjudligi tasdiqlanmagan.
- 185 qaror fayli **baytma-bayt o‘zgarmagan**; **55 ta SQL fayl saqlangan**. Asl status reyestrida hali 130 `Tekshiruv kerak`, 47 qisman, 7 kechiktirilgan/bekor, 1 blok/unknown, 0 rasmiy yopilgan.

## CI/internetli muhitda keyingi tekshiruv

1. `node frontend/scripts/v154-qr-preflight.mjs` (offline), so‘ng `cd backend && npm ci` va `cd frontend && npm ci`.
2. `npm run build` bilan haqiqiy Vite bundle, yangi QR URL, UZ/RU/EN va 404 SPA fallbackni real Chrome’da ochish.
3. Izolyatsiyalangan test PostgreSQL va QR issuance/join/approve end-to-endni amalga oshirish. Production DB yoki real mijoz hisoblariga tegmaslik.
4. Oldingi 26 backend FAIL ning haqiqatan yo‘qolishini unit-test bilan tasdiqlash. Qarorlarni E2E dalilisiz `Tayyor` deb belgilamaslik.
