# USTARA v150 — GitHub Pages bootstrap va Vite release tayyorgarligi

**Sana:** 2026-11-20. **Asos:** `USTARA-v149-185-Social-QR-Languages.zip` (1 146 fayl), SHA-256 `508d5f5156e80af3bdb125259818cfdca03cbaf50213abe4ff5b0ab6a5a0f584`.

## Nima uchun bu ish zarur?

GitHub Pages sayti `/USTARA-New/` ostida ishlaydi, lekin v149 `frontend/index.html` da dastlabki `loading.css`, favicon va loading logotipi `/` dan boshlangan edi. Bunday manzillar `/USTARA-New/` emas, domen ildizidan olinadi; Pages buildidagi Vite JavaScript to‘g‘ri ishlagan taqdirda ham dastlabki yuklanish resurslari 404 bo‘lishi mumkin. Vite-ning HTML `%BASE_URL%` almashtirish sintaksisi bilan ushbu uchta link moslashtirildi. `src="/src/main.jsx"` esa Vite JS entry uchun aynan o‘z holicha saqlandi.

## 7 ta amaliy o‘zgarish

1. **Loading stylesheet:** HTML `<link rel="stylesheet">` endi `%BASE_URL%loading.css`.
2. **Favicon:** HTML favicon `%BASE_URL%brand/ustara.svg`.
3. **Dastlabki loading logotipi:** `<img>` manzili `%BASE_URL%brand/ustara.svg`. `frontend/public/loading.css` ichidagi nisbiy `brand/ustara.svg` esa CSS `/USTARA-New/loading.css` dan olingani uchun to‘g‘ri va o‘zgartirilmadi.
4. **Paket o‘rnatmasdan manba tekshiruvchisi:** `frontend/scripts/v150-pages-source-check.mjs` Vite `base`, React Router `basename`, 3 HTML public asset, JS entry va stylesheetdagi resurslarni tekshiradi; traversal, root-absolute va xavfli masofaviy skriptlarni rad etadi.
5. **Npm lock va build tayyorligi:** tekshiruvchi `frontend/package.json` va `package-lock.json` dependency muvofiqligini solishtiradi, Vite versiyasi lockda borligini tekshiradi. `node_modules/vite/bin/vite.js` yo‘q bo‘lsa **BLOCKED_MISSING_VITE** qaytaradi; u hech qachon `npm ci` o‘rniga muvaffaqiyatli build deb da’vo qilmaydi.
6. **CI fail-closed gate:** `.github/workflows/v55-verify.yml` da preflight `npm ci` dan **oldin**, haqiqiy o‘rnatilgan Vite talabi esa `npm ci` dan **keyin** qo‘yildi. Mavjud PostgreSQL / Chrome E2E / release-gate qoidalari saqlangan.
7. **Publish artifact va regressiya tekshiruvlari:** `scripts/publish-tree-check.cjs` real loading oynasi mavjud bo‘lsa, yig‘ilgan HTML faylida stylesheet, favicon, logo hamda haqiqiy statik fayllar borligini alohida tekshiradi. `index.html` va `404.html` baytma-bayt teng bo‘lishi sharti saqlangan. 18 frontend va 8 backend testi yo‘qolgan, noto‘g‘ri va zararli asset havolalarini ham qamrab oldi.

## Mustaqil va takrorlanadigan buyruqlar

`node frontend/scripts/v150-pages-source-check.mjs --json` — paket talab qilinmaydi; JSON natijada manba, lock va toolchain holatlari ajratilgan.

`node frontend/scripts/v150-pages-source-check.mjs --require-deps` — Vite haqiqatan o‘rnatilgan bo‘lishi shart; aks holda exit code 2.

Internet mavjud muhitda, tegishli production `VITE_API_BASE_URL` CI konfiguratsiyasiga berilgach:

```
cd frontend
npm ci
npm run preflight:pages
npm run build
cp dist/index.html dist/404.html
node scripts/verify-pages-build.mjs dist
```

Bular **qilinishi kerak bo‘lgan qadamlar**; v150 tayyorlash muhitida `npm ci` yoki build muvaffaqiyatli ishlagan deb aytilmaydi. GitHub Actions verified deploy ham real CI gate o'tmasdan ochilmaydi. DNS, registry, GitHub Actions va haqiqiy production domen bu mahalliy tekshiruvda tasdiqlanmagan.

## Haqiqiy tekshiruv natijalari

- Yangi frontend testlar: **18 PASS**, yangi backend testlar: **8 PASS**; jami **26 yangi PASS**.
- Barcha frontend unit-testlar: **1 507 PASS / 0 FAIL** (v149: 1 489 PASS).
- Backend unit-testlar: **1 420 PASS / 26 FAIL** (v149: 1 412 PASS / 26 FAIL). 26 eski FAIL nomma-nom bir xil; 8 backend testi yangi qo‘shildi.
- Paket talab qilmaydigan preflight: HTML **PASS (3 prefiksli public asset)**, Router/Vite `base` **PASS**, npm lock **PASS (Vite 8.3.5 lockda)**, installed Vite **BLOCKED_MISSING_VITE**.
- `npm ci --offline --ignore-scripts --no-audit --no-fund`: **ENOTCACHED** (`zod-validation-error@4.0.2`).
- `npm run build`: **BLOCKED — `vite: not found`**. Haqiqiy compiled Vite build yo‘q; tugallangan Pages chiqishi uchun E2E tasdiq yo‘q.
- PostgreSQL, mobil/Chrome real SPA, Telegram E2E, haqiqiy Pages deploy: **NOT_RUN**. **Production-ready: YO‘Q**.
- Asl 185 qaror CSV, 55 ta SQL fayl (46 forward, 2 rollback) **saqlanadi va qadoqlashdan oldin baytma-bayt solishtiriladi**. #76 hali **QISMAN**.

**Keyingi v151:** tarmoq imkoniyati bor muhitda `npm ci` → Vite `build` → publish-tree verifier → haqiqiy Chrome 390/1440 sinovini bajarish, aks holda mavjud bo‘lmagan testlarni PASS deb ko‘rsatmaslik. Ishni faqat v150 ZIPdan davom ettirish.
