# USTARA — latest checkpoint v137 (2026-11-20)

**Asos:** `USTARA-v136-185-Public-Preview-Deployment-Safety.zip` (1102 fayl; SHA-256 `b3a4d95d2c43cadbd398ca712ac0481af2ca20512163f8282245cfe4bc88bd17`). Bu bosqichda #75 Smart Support, #78 kontekst ko‘rsatmalari va #74 ixtiyoriy boshlash yo‘riqnomasi *qisman* ishlab chiqildi. Asl 185 qaror CSV fayli **o‘zgartirilmaydi**.

## 7 ta aniq vazifa

1. **#75 umumiy yordam markazi:** mehmonlar uchun ham ochiq `/help` React route va mobilga mos sahifa; autentifikatsiya shart emas.
2. **#75 8 ta manbaga asoslangan FAQ mavzusi:** qidiruv, bron, bron tarixi va bekor qilish, QR/walk-in navbat, profil xatosi, sartarosh profili, sartarosh bronlari, xavfsizlik. Javoblar mavjud USTARA funksiyalariga mos; uydirma call-center, AI chat yoki xabar yuborish API yo‘q.
3. **#75 lokal qidiruv:** O‘zbek apostrof variantlari, katta/kichik harflar, bo‘sh joy, bir nechta so‘z; savollar matni faqat lokal JS arrayda filtrlanadi, serverga uzatilmaydi.
4. **#75 kategoriyalar va URL:** mijoz/sartarosh/xavfsizlik toifalari, `/help?topic=...` kontekst havola, q/turi dublikat va yaroqsiz qiymatlarni ruxsat etilgan ro‘yxat bilan tekshirish.
5. **#78 kontekst yordam:** guest Navbar, customer header, barber header; mijoz Explore, Bronlarim va ommaviy sartarosh profiliga aniq mavzu havolalari. Mijozning avval kelishilgan beshta asosiy tabi saqlandi.
6. **#74 majburiy bo‘lmagan boshlash:** yordam sahifasida mijoz o‘zi ochadigan 3 bosqichli yo‘riqnoma; hech qanday overlay/majburiy onboarding, akkaunt ma’lumoti, token va analytics yozuvi qo‘shilmadi.
7. **Xavfsizlik, accessibility va test:** `aria-pressed`, `aria-expanded`, `aria-live`, keyboard focus; mobil CSS va 19 ta yangi frontend unit/kontrakt testi. 185 qaror va barcha SQL fayllar byte-to-byte audit qilinadi.

## Mahalliy testlar (amaldagi holat)

- Yangi `v137HelpCenter.test.js`: **15/15 PASS**; `v137HelpWiring.test.js`: **4/4 PASS**, jami **19/19 PASS**.
- Frontend `node --test test/*.test.js`: **1198 PASS / 0 FAIL**, 0 SKIP/TODO (yakuniy qayta sinov).
- Backend `node --test --test-concurrency=8 test/*.unit.test.js`: **1412 PASS / 26 FAIL**, 0 SKIP/TODO; 26 xatoning nomi v136 bilan aynan bir xil (dependency yetishmaydi).
- TypeScript JSX parse diagnostikasi: 8 ta o‘zgargan JSX fayl **0 syntax error**; JS yordam modeli `node --check` PASS.
- `npm ci --offline` frontend/backend: **ENOTCACHED**. `npm run build`: **vite: not found**. PostgreSQL/real HTTP/Chrome/mobil browser: **NOT_RUN**.
- `docs/USTARA_185_NAZORAT.csv`: 185 yozuv, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`; avvalgi 46 forward + 2 rollback SQL **baytma-bayt o‘zgarmagan**.

## Ishga tushirish va cheklovlar

- Ommaviy yordam manzili: `/help`. Manba: `frontend/src/pages/help/`.
- **Bu hali AI Smart Support yoki operatorga xabar yuborish emas**; FAQ va kontekstga mos qisqa yo‘riqnoma. Serverda yangi jadval yoki API qo‘shilmadi.
- Hozircha faqat o‘zbekcha matn; #76 ko‘p til talabi keyingi ish.
- GitHub Pages deep-link fallback, haqiqiy SEO/preview, mobil rendering va to‘liq Vite build mustaqil live sinov talab qiladi. **Production-ready: YO‘Q**.

## Keyingi v138

1. Ishlab turgan Node/npm muhitida `npm ci`, Vite build va `/help` deep-link/klaviatura/mobil brauzer smoke test.
2. Alohida `ustara_test_db` bilan muhim booking/QR/shikoyat DB testlari; ishchi DB ga ulanmasin.
3. 185 reyestrdan yana **bajarilmagan** vazifani tekshirib, ketma-ket 7 ta kichik yaxshilanishga bo‘lish; #74/#75/#78 ni faqat live tekshiruvdan keyin to‘liq deb baholash.
