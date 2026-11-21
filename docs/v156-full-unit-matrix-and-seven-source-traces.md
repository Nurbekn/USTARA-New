# USTARA v156 — to‘liq unit-test nazorati va yana 7 qarorning manba dalillari

**Asos:** `USTARA-v155-185-Critical-Flow-Release-Evidence.zip`. 185 asl qaror reyestri va 55 ta SQL fayl baytlari saqlanadi.

## 7 asosiy ish

1. **Yana 7 qarorning manba/test izlari:** #1 adaptiv Home, #2 sartarosh bosh paneli, #3 ommaviy profil, #4 Ilhom reaksiyalari, #7 admin, #8 kalendar/tanaffus, #9 sartarosh bronlari. Audit `backend/scripts/v156-seven-ui-decisions.mjs` yordamida manba/test mavjudligini, asl qaror iboralarini va v155 indeksida takrorlanmaganini tekshiradi. **14/185** qaror source trace orqali indekslangan; **171 tasi hali bu izlashdan o'tmagan**. Bu kod/test ishorasi, production bajarilishi emas.
2. **Backend test qamrovi:** CI backend uchun kamida 161 ta `.unit.test.js` fayli va 1501 ta muvaffaqiyatli TAP testi talab qiladi (v155 bazasi).
3. **Frontend test qamrovi:** CI frontend uchun kamida 114 ta `.test.js` fayli va 1609 ta muvaffaqiyatli TAP testi talab qiladi (v155 bazasi).
4. **To‘liq `npm test` komandasi:** ikkala `package.json` uchun `test` va `test:unit` komandalarining aniq qiymatlari tekshiriladi; bittagina test fayliga almashtirish relizni to‘xtatadi.
5. **TAP yaxlitligi:** kamaygan test, FAIL/SKIP/TODO, noto‘g‘ri plan, bo‘sh va symlink loglarni rad etuvchi `v156-unit-coverage.js` qo‘shildi. Test natijasi boshqa testlar bajarilganini faqat strukturaviy tasdiqlaydi; har bir 185 funksiyani tugatdi degani emas.
6. **GitHub Actions:** npm o‘rnatishidan **oldin** test manbalari va 7 qaror izlari tekshiriladi; ikki unit-to‘plamidan **keyin** TAP qamrovi tekshiriladi; yakuniy release gate `USTARA_V156_REQUIRE_COMPLETE_MATRIX=1` bilan TAP'ni yana o‘zi tekshiradi, JSON attestatsiyaga ishonmaydi.
7. **Regressiya va tayyorlik dalillari:** yangi 23 backend unit-test, oldingi testlar bilan taqqoslash, source graph, QR preflight, original qaror fayli va SQL fayllar auditi. npm/Vite/PG/Chrome/Telegram cheklovlari shaffof qayd etiladi.

## Haqiqiy test natijalari (2026-11-20)

- Frontend **1609/1609 PASS**, 0 fail/skip.
- Backend unit **1498 PASS / 26 FAIL** (1524 test); 26 ta xato v155 bilan **nomma-nom bir xil**, yangi regresiya yo‘q. Bu backend to‘liq PASS degani emas.
- **23/23 yangi backend test PASS** (14 ta unit matrix + 9 ta 7 qaror auditi). Manba grafi `PASS_SOURCE_GRAPH_ONLY`, QR `PASS_SOURCE_CONTRACT_ONLY`.
- `v156-unit-coverage.js --source-only`: **PASS**. `--logs-dir` bilan eski xatoli TAP: **BLOCKED**, kutilgan holat. To‘liq release/sandbox Chrome E2E **NOT RUN**.
- `npm ci --offline`: **ENOTCACHED** (`zod-validation-error@4.0.2`); npm registry ping `EAI_AGAIN`; `npm run build`: **vite: not found**. Vite production bundle yo‘q.
- PostgreSQL va Docker bu muhitda yo‘q; haqiqiy DB staging/migratsiya, Chrome mobil/desktop va Telegram E2E **NOT RUN**.
- Original registry: 130 `Tekshiruv kerak`, 47 qisman, 7 bekor/kechiktirilgan, 1 noma’lum, **0 rasmiy to‘liq tasdiqlangan**. Manba izlari buni o‘zgartirmaydi.
- **Production-ready: YO‘Q. “LOYIHA TUGADI” deb e’lon qilishga asos yo‘q.**

## Yangi manbalar

`backend/scripts/v156-unit-coverage.js`, `backend/test/v156UnitCoverage.unit.test.js`, `backend/scripts/v156-seven-ui-decisions.mjs`, `backend/test/v156SevenUiDecisions.unit.test.js`, `docs/v156-seven-ui-decisions-source-evidence.json`, `.github/workflows/v55-verify.yml`.

## Keyingi bosqich

Internetga ulana oladigan alohida CI mashinasida `npm ci`, haqiqiy Vite build va Chrome E2E, PostgreSQL migratsiyalar va real integration testlari ishlashi talab etiladi. Qolgan 171 qaror uchun ham manba+test dalilini, keyin haqiqiy E2E dalilini birma-bir tekshirish kerak. Har bir yakuniy talab tasdiqlanmaguncha **LOYIHA TUGADI** emas.
