# USTARA v65 — 5 ish: transitive CSS va production Chrome resurs xavfsizligi

**Asos:** v64 `USTARA-4-Bosqich-Pages-Asset-Route-Integrity-v64.zip` (789 fayl). **Yangi:** `USTARA-4-Bosqich-Transitive-Asset-Chrome-v65.zip`. Ishni davom ettirish; production-ready **EMAS**.

1. **CSS ichki resurslari.** `scripts/css-resource-check.cjs` kirish `index.html`iga ulangan mahalliy CSS fayllarini, ularning `@import` grafigini va `url(...)` orqali ishlatilgan shrift/rasmlarni tekshiradi. Yo‘q yoki bo‘sh fayl, symlink, xavfli traversal va `http:`/`file:` kabi protokollar rad etiladi. Aylana `@import` cheklanadi. `data:` va HTTPS bilan berilgan tashqi fontlar uchun mahalliy mavjudlik kafolati berilmaydi.
2. **HTML responsive resurslar.** Vite HTML’dagi `<source>` / `srcset`, `<link rel=manifest/preload/mask-icon>` kabi havolalar tekshiriladi. 2x rasm yoki manifest yo‘q bo‘lsa, `verifyPagesOutput` va CI/Pages release gate rad etadi. Avvalgi HTML JS/CSS/ikonka tekshiruvlari saqlangan.
3. **Chrome lokal asset xatolari.** CDP Network hodisalarida mahalliy JS, CSS, rasm/shrift 404 va yuklashdagi xatolar tekshiriladi; `Network.enable` navbatdan oldin yoqiladi. Masofadagi fontlar yoki CSP sabab bloklangan test API so‘rovlari noto‘g‘ri lokaldagi asset xatosi sifatida hisoblanmaydi. Real browser smoke hali bu muhitda tasdiqlanmagan.
4. **Static test HTTP serveri.** `.webmanifest`, `.woff`, `.ttf`, `.avif`, `.gif` uchun MIME moslashtirildi; loopback static server haqiqiy `fetch` orqali tekshirildi. Path traversal va mavjud bo‘lmagan assetlar xatoga olib keladi.
5. **Regressiya/CI mosligi.** 14 ta yangi `v65PublishedAssets.unit.test.js` sinovi, `npm run test:v65:unit` komandasi qo‘shildi. CI’ning eski `verify-pages-build` va Pages `verify-ci-build` tekshiruvi ayni umumiy kodni chaqiradi, shuning uchun alohida deploy qoidasini chetlab o‘tmaydi. 185 qaror va 42 forward migratsiyaga tegilmadi.

## Amalda bajarilgan tekshiruvlar (2026-11-19)
- Tanlangan backend **87/87 PASS** (14 yangi v65 sinovi); frontend unit **178/178 PASS**.
- To‘liq backend **516 PASS / 26 FAIL**. 26 ta yiqilish oldin mavjud `express`, `bcrypt`, `jsonwebtoken`, `pg` modullarining o‘rnatilmagani sababli; full suite PASS **EMAS**.
- Offline audit **185 qaror / 42 forward migratsiya PASS**, CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` o‘zgarmagan. Bu 185 feature yakunlandi degani emas.
- GitHub Actions **NOT_RUN**, haqiqiy PostgreSQL **NOT_RUN/SKIP**, Vite build **BLOCKED**; Chrome production E2E **SKIP/NOT_VERIFIED**, Telegram live va to‘liq mobil E2E **NOT_RUN**.

**Chegara:** CSS grafigi HTML orqali bevosita kiradigan stillar va ularning lokal `@import`/`url()` resurslariga mo‘ljallangan. JS ichidagi barcha dinamik importlar, brauzerning har bir runtime so‘rovi va masofadagi HTTPS assetlarning mavjudligi to‘liq tekshirildi deb aytilmaydi.
