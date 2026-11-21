# USTARA v64 — 5 ish: Pages asset va Chrome route yaxlitligi

**Asos:** v63 arxivi, **784 fayl**. **Yangi:** `USTARA-4-Bosqich-Pages-Asset-Route-Integrity-v64.zip`. Production-ready **EMAS**.

1. **Build resurslarining mavjudligi.** `scripts/publish-tree-check.cjs` endi yakuniy `index.html`dagi local `<script src>`, `<link rel=stylesheet/icon/modulepreload>`, `<img src>` resurslarini tekshiradi. JS fayl joyida bo‘lsa-yu, CSS yoki ikonka yo‘q bo‘lsa, Pages nashri `NOT PASS`. `verifyPagesOutput` va mavjud release gate `validateBuiltFrontend` orqali oldindan va Pages’da tekshiriladi.
2. **Xavfsiz URL/havolalar.** HTML havolalaridagi lokal fayllar `/USTARA-New/` prefiksida bo‘lishi shart; noto‘g‘ri Pages base, yo‘q yoki bo‘sh fayl, symlink, traversal (`%2e%2e`), HTTP va masofaviy bajariladigan JS rad etiladi. Oldindan ishlatilayotgan tashqi **HTTPS font stylesheet** o‘zgarishsiz qoladi. Faqat `index.html`ning tegishli resurslari tekshiriladi — JS ichidagi barcha dinamik importlarga to‘liq audit emas.
3. **Chrome SPA sahifa manzilini tasdiqlash.** Production smoke testida `/login`, `/admin` va `/forgot-password` sahifalarida `location.pathname` va haqiqiy React elementi birga tekshiriladi. Oldingi sahifaning o‘sha elementi yangisiga noto‘g‘ri PASS bermaydi; `Page.navigate` CDP xatosi darhol rad etiladi.
4. **Chegaralangan navigatsiya retry.** Navigatsiya vaqtida yo‘qolgan JavaScript execution context uchun `CDP command failed` vaqtincha takrorlanadi, lekin faqat max 100 x 100ms (harness timeout bilan). Aloqa uzilishi va boshqa xatolar yashirilmaydi; muddati tugasa `NOT PASS`.
5. **Brauzer runtime exception himoyasi.** `Runtime.exceptionThrown` kuzatiladi, Chrome build smoke’da JS xatosi yuz bersa test yiqiladi. `v64ProductionResource.unit.test.js`da 9 ta yangi test va `npm run test:v64:unit` komandasi qo‘shildi. 185 qaror/42 migratsiya avvalgidek.

## Amalda bajarilgan tekshiruvlar (2026-11-19)

- Tanlangan backend **73/73 PASS** (9 ta yangi v64 test), frontend unit **178/178 PASS**.
- To‘liq backend **502 PASS / 26 FAIL**: 26 ta xato `express` (8), `bcrypt` (6), `jsonwebtoken` (9), `pg` (3) yo‘q modullar bilan bog‘liq; to‘liq suite PASS EMAS.
- Offline audit **185 qaror / 42 forward migratsiya PASS**; qarorlar CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` o‘zgarmagan.
- **GitHub Actions remote NOT_RUN, PostgreSQL 9 suite real NOT_RUN/SKIP, production Chrome E2E NOT_RUN/NOT_VERIFIED, Vite build BLOCKED**: mahalliy npm/Vite paketlari mavjud emas. Telegram live va to‘liq mobil brauzer E2E NOT_RUN.

**Chegara:** yangi tekshiruv HTML kirish faylining resurslari va Chrome route readiness’ini mustahkamlaydi, butun frontend yoki backend production xavfsizligi tasdig‘i emas. 185 qaror = 185 ta tugallangan feature emas.
