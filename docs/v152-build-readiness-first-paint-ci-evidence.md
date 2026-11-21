# USTARA v152 — release build readiness diagnostikasi va first-paint smoke (2026-11-20)

**Asos:** v151, 1156 fayl. **185 qaror reyestri o‘zgarmaydi.** #76 UZ/RU/EN first-paint kodini saqlash; website/DB/business logicga yangi taxminiy talab kiritmaslik. Production-ready: **YO‘Q**.

## 7 bajarilgan amaliy ish

1. **SHA-512 supply-chain audit:** `frontend/scripts/v152-build-doctor.mjs` locked 177 npm tarballining `registry.npmjs.org` HTTPS manzili, SHA-512 xeshi, xavfsiz package path va to‘g‘ri version maydonini npm paketlarini ishga tushirmasdan tekshiradi.
2. **Node mosligi:** haqiqiy lockdagi Vite, @vitejs/plugin-react, @rolldown/plugin-babel `engines.node` intervallari bilan runtime versiyasi solishtiriladi; yaroqsiz/nomalum talqinlar fail-closed.
3. **O‘rnatilgan deps inspeksiyasi:** 17 ta direct package (React, React DOM, Vite va hokazo) mavjudligi, versiyasi hamda symlink emasligi tekshiriladi; bittasi yetishmasa `BLOCKED`, shunchaki source PASS deb build PASS deyilmaydi.
4. **Vite ishga tushirishga tayyorgarlik:** haqiqiy `node_modules/vite/bin/vite.js` kerak, `--require-installed` bloklangan holatda exit code 2 bilan tugaydi. `--json` xavfsiz diagnostika beradi; `build`, `browserE2E` maydonlari `NOT_RUN`.
5. **Paketlarsiz first-paint smoke:** real `public/bootstrap-locale.js` izolatsiyalangan VM’da `index.html` va uch tildagi `DOCUMENT_COPY` bilan ishlatiladi. UZ/RU/EN, duplicate, prototype va HTML injection `lang` holatlari tekshiriladi. Bu Chrome testi EMAS.
6. **CI qat’iy shlyuz:** `v55-verify.yml` da `npm ci`dan OLDIN offline lock/first-paint tekshiruvi, `npm ci`dan KEYIN haqiqiy package va Vite gate qo‘shildi. Vite build va GitHub Pages artifact auditini chetlab o‘tmaydi. `package.json` ga ikki qulay `preflight` buyrug‘i qo‘shildi; paket dependency/lock versiyalari o‘zgartirilmadi.
7. **Regressiya va yuzaga chiqadigan xatolar:** 32 frontend va 6 backend yangi test (38/38 PASS). Tarball origin almashtirish, lock integrity buzilishi, noto‘g‘ri Node, yo‘q/mismatched paket, fake Vite va first-paint skriptini buzish rad etiladi.

## Tekshiruvlar

- **Frontend:** 1568 / 1568 PASS. v151: 1536; **32 yangi test**.
- **Backend unit:** 1433 PASS / 26 FAIL (jami 1459). **6 yangi test PASS**; 26 fail v151 bilan nomma-nom bir xil, backend runtime kodi o‘zgarmadi.
- **Source, lock integrity:** PASS; `lockPackages=177`; Node `v22.16.0` mos.
- **Installed:** 0 / 17 direct dependency; `--require-installed` exit 2 (BLOCKED).
- **First paint:** 6/6 PASS (faqat browserless VM).
- **`npm ci --offline`:** ENOTCACHED (`zod-validation-error@4.0.2`). **`npm run build`:** exit 127 (`vite: not found`).
- **Chromium:** sodda `file://` smoke 12 soniyada ham javob bermadi; ishlab turgan frontendni Chrome'da tekshirish **NOT_VERIFIED**. v151 localhost: ERR_BLOCKED_BY_ADMINISTRATOR. **Bu ikki urinish Chrome E2E PASS emas.**
- **PostgreSQL, Telegram E2E, real Pages deployment:** NOT_RUN. **Production-ready: NO.**
- **185 qaror CSV va avvalgi 55 ta SQL fayl:** v151 bilan byte-for-byte saqlandi. #76 hali **QISMAN**.

## Real muhitda davom ettirish (network va ruxsat talab qilinadi)

```bash
cd frontend
node scripts/v152-build-doctor.mjs --json
node scripts/v152-first-paint-smoke.mjs
npm ci
node scripts/v152-build-doctor.mjs --require-installed
npm run test:unit
# CI da VITE_API_BASE_URL uchun haqiqiy ruxsatli HTTPS production API manzilini sozlang
npm run build
cp dist/index.html dist/404.html
node scripts/verify-pages-build.mjs dist
```

Bularni bajarish **Vite bundle va Chrome E2E avtomatik tasdiqlandi** degani emas; CI'dagi 390/1440 real Chrome, vaqtinchalik PostgreSQL va Telegram tekshiruvlari muvaffaqiyatli tugamaguncha release qilinmaydi. Hech qachon `npm ci --force` yoki SSL tekshiruvlarini o‘chirish bilan cheklovni aylanib o‘tmang.

## Keyingi v153

Vite deps ruxsatli muhitda o‘rnatilib, real `npm run build`, `verify-pages-build`, Chrome mobil/desktop va PostgreSQL stage testlarining loglarini tasdiqlash. So‘ng 185 reyestrdagi #76 va boshqa qisman talablarni ustuvorlikka qarab davom ettirish.
