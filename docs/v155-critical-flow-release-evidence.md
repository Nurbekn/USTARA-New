# USTARA v155 — 7 muhim qaror uchun dalil izlari va haqiqiy Pages smoke kengaytmasi

**Asos:** `USTARA-v154-185-QR-Pages-Route-Integrity.zip`. Asl `USTARA_185_NAZORAT.csv` SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.

## Yetti qaror va manba/test dalillari

1. **#5 — Ko‘p xizmatli bron:** `backend/services/multiBooking.js`, `frontend/src/pages/queue/serviceBundle.js`, `backend/test/smartBookingConfirmation.unit.test.js`, `frontend/test/serviceBundle.test.js`.
2. **#6 — 5 daqiqalik slot/kalendar:** `backend/services/slotGrid.js`, `frontend/src/pages/user/barber/availableSlots.js`, `frontend/test/availableSlots.test.js`, `frontend/test/v84SlotQuoteIntegrity.test.js`.
3. **#27 — Jonli QR navbat:** `backend/services/v154PublicQueueLink.js`, `frontend/src/pages/queue/QueueCheckIn.jsx`, `backend/test/v154QrPagesLinks.unit.test.js`, `frontend/test/v154QrSiteDestination.test.js`.
4. **#75 — Yordam markazi:** `frontend/src/pages/help/HelpCenter.jsx`, `frontend/src/pages/help/helpModel.js`, `frontend/test/v137HelpCenter.test.js`, `frontend/test/v138HelpLanguages.test.js`.
5. **#76 — Uch tildagi interfeys:** `frontend/src/utils/siteLocale.js`, `frontend/src/pages/adminLanguage.js`, `frontend/test/v151DocumentLocale.test.js`, `frontend/test/v138HelpLanguages.test.js`.
6. **#107 — Ommaviy profil havolasi:** `frontend/src/pages/user/barber/publicShare.js`, `frontend/src/pages/user/barber/PublicProfileShare.jsx`, `frontend/test/v136ShareBasePath.test.js`.
7. **#165 — Smart Link Preview:** `backend/services/publicProfilePreview.js`, `backend/controllers/publicProfilePreview.js`, `backend/test/v135PublicPreview.unit.test.js`.

`backend/scripts/v155-critical-decisions.mjs` har bir bandning **185 asl qaroriga aynan mos**ligini, source/test fayllar haqiqatan borligi, o‘qilishi, symlink emasligi va kutilgan kod belgisi borligini tekshiradi. Yo‘q yoki almashtirilgan fayl **FAIL** beradi. `docs/v155-seven-critical-decisions-source-evidence.json` faylida 7 tasining shaffof indekslari bor. Bu **source trace**, real runtime isboti emas.

## Production brauzer testidagi real o‘zgarish

- `backend/test/helpers/v64ChromeRoutes.js` endi faqat ishonchli `/USTARA-New/...` joyida joylashgan ko‘p segmentli (masalan `/queue/check-in/{token}`) marshrutlarni qat’iy tekshiradi. `..`, `%2f`, `?` va begona domenlarni rad etadi.
- `backend/test/pagesBuild.browser.e2e.test.js` ning avvalgi uchinchi majburiy testiga **haqiqiy dist** dan to‘g‘ridan-to‘g‘ri QR check-in sahifasini `?lang=ru` bilan ochish hamda yordam markazini `?lang=en` bilan ko‘rish sinovlari kiritildi. Test QR so‘rovi yubormaydi va real token ishlatmaydi: 48 belgili sintetik token; DB/Telegramga so‘rov yo‘q. Mavjud **4 ta release TAP hisobi** va gate talabi o‘zgarmagan.
- `.github/workflows/v55-verify.yml` ning `npm ci` dan oldingi qismiga 7 qarorning source/test audit qadami qo‘shildi. Real Chrome va Vite build amalda mavjud bo‘lmasa **release muvaffaqiyatli hisoblanmaydi**.

## Haqiqatan bajarilgan tekshiruvlar (2026-11-20)

- **Frontend:** 1609/1609 PASS, 0 skip (v154: 1604); 5 ta yangi frontend test.
- **Backend unit:** 1475 PASS / 26 FAIL (v154: 1459 PASS / 26 FAIL); 16 ta yangi backend test; 26 FAIL nomma-nom v154 bilan bir xil, `express` kabi dependencylar yetishmagan avvalgi muammo.
- **Yangi:** 21/21 PASS. `v155-critical-decisions.mjs --json` source audit PASS; `--require-production` ataylab **FAIL CLOSED**.
- **v153 source graph** va **v154 QR preflight** PASS (manba kodi/konfiguratsiya, haqiqiy browser emas). O‘zgargan `.js/.mjs` sintaksisi PASS.
- **npm ci --offline:** `ENOTCACHED` (`zod-validation-error@4.0.2`). **npm run build:** `vite: not found`.
- **PostgreSQL, production Vite bundle, GitHub CI, Chrome/mobile, QR scanner, Telegram E2E:** NOT RUN / NOT VERIFIED.
- **185 qarordan asl reyestrda:** 130 tekshirilishi kerak, 47 qisman, 7 bekor/kechiktirilgan, 1 noma’lum, **0 production/tugallangan deb tasdiqlangan**. Bu 7 ta dalil izi ham asl holatni avtomatik yangilamaydi. **178 ta qaror hali ushbu chuqur kod/test izlash bosqichidan o‘tmagan**.
- **Production-ready:** YO‘Q. 185 ta yakunlanmaguncha **LOYIHA TUGADI** deb belgilamaslik.

## Keyingi bosqichga aniq ish

Internet va npm paketlari mavjud bo‘lgan izolyatsiyalangan CI da `npm ci` (ikkala paket), backend unit, haqiqiy PG migratsiya/integratsiya, `npm run build`, dist/404 SPA va haqiqiy Chrome QR/Help marshruti sinovlari bajarilib CI loglarida isbotlanishi kerak. Qolgan 178 ta qaror ham manba+test+E2E dalillari asosida birma-bir audit qilinadi.
