# USTARA v157 — #10–#16 manba dalillari va mehmonning ochiq profilini tiklash

**Asos:** foydalanuvchi bergan `USTARA-v156-185-Full-Unit-Matrix-Seven-More-Decisions(1).zip`. Asl 185 qaror reyestri va mavjud SQL migratsiyalarga tegilmagan.

## Bajarilgan ishlar (7 qaror bo‘yicha izlar)

1. **#10 Bildirishnomalar:** Telegram after-commit xabarlari va mijoz bron-status inbox manba/testlariga bog‘landi. Haqiqiy push real-time emas; Telegram delivery E2E yo‘q.
2. **#11 Xizmatlar:** xizmatlarni yaratish/tahrirlash/faollashtirish, serverning active holat boshqaruvi va validatsiya unit-testlari indekslandi.
3. **#12 Portfolio:** foto/video postlar manbalari indekslandi. Tasdiqlangan sartaroshning mavjud public postlarini mehmon ko‘ra olishi uchun backend va frontend tuzatildi.
4. **#13 Baholar:** yakunlangan bron uchun review server sharti va barber javobi manbalari indekslandi. Tasdiqlangan sartaroshga tegishli ommaviy sharhlar mehmonlar uchun ochildi; sharh yaratish/javob yozish login bilan qoldi.
5. **#14 Xarita:** public koordinata/xarita manbalari indekslandi. Profil loader va tashqi xarita havolasi yaroqsiz koordinatalarni rad etishi kuchaytirildi.
6. **#15 Profil:** mavjud profil tahrirlash va owner-based backend tekshiruvi manbalari indekslandi.
7. **#16 Smart Search:** ochiq katalog va birgalikda ishlaydigan qidirish/filtrlash testi manbalari indekslandi.

**Manba izlarining umumiy holati:** avvalgi 14 + ushbu 7 = **21/185** manba/test bilan bog‘langan. Qolgan **164** qaror bo‘yicha shu indeksatsiya qolgan. Bu 21 qaror to‘liq ishlashi yoki production tasdiqlanganini anglatmaydi. Asl reyestr statuslari o‘zgarishsiz: 130 tekshiruv, 47 qisman, 7 bekor/kechiktirilgan, 1 noma’lum, 0 rasmiy production-verified.

## Xavfsizlik chegaralari

- `GET /api/barbers/:id/portfolio` va `GET /api/barbers/:id/reviews`: mehmon uchun faqat `approved` sartaroshning ommaviy ma’lumotlari.
- Agar JWT sarlavhasi kelsa, mavjud authentication tekshiruvi ishlaydi; noto‘g‘ri/eskirgan token avtomatik mehmon deb olinmaydi.
- `/me/portfolio` autentifikatsiyasiz rad qilinadi; review yaratish va barber javobi autentifikatsiya talab qiladi.
- Guest portfolio personal `likedByMe` / `saved` holatlari uchun `null` identitet ishlatadi; not-public yoki o‘chirilgan profilning post/reviews ma’lumotlari tarqatilmaydi.
- DB tashqi tizimida live migratsiya, write yoki `.env` o‘qish bajarilmadi.

## Sinovlar (2026-11-20)

- **Frontend:** `node --test frontend/test/*.test.js` → **1610/1610 PASS**, fail/skip/todo 0. Bunga yangi mehmon profil testi kiradi.
- **Backend yangi:** `v157PublicGuestProfile.unit.test.js` → **5/5 PASS**; `v157SevenPublicDecisions.unit.test.js` → **7/7 PASS**.
- **v156 preflight:** `v156-unit-coverage.js --source-only` → **PASS** (faqat manba/skript ro‘yxati, full backend TAP emas).
- **Backend focused (dependencysiz takror):** **57/57 PASS**. Kengroq 58 testli sinovda yana 1 launch FAIL: `barber-profile.unit.test.js` uchun `jsonwebtoken` paketi yo‘q (`MODULE_NOT_FOUND`). Bu v157 xatosining isboti emas. Mavjud ZIP ichida `node_modules` yo‘q.
- **Chegaralar:** PostgreSQL haqiqiy integration test, express bilan routing E2E, real Telegram, Chrome mobil/desktop va Vite production build bu muhitda tekshirilmagan. CI'da `npm ci`, to‘liq backend, 9 DB suite, real browser va release gate shart.

**Holat:** production-ready **YO‘Q**. Qarorlarni tugadi yoki loyihani tugadi deb e’lon qilishga asos yo‘q.

## Yangi va o‘zgartirilgan manbalar

- `backend/scripts/v157-seven-public-decisions.mjs` va `docs/v157-seven-public-decisions-source-evidence.json`
- `backend/test/v157SevenPublicDecisions.unit.test.js`, `backend/test/v157PublicGuestProfile.unit.test.js`
- `backend/routes/barbers.js`, `backend/controllers/socialController.js`, `backend/controllers/reviewsController.js`
- `frontend/src/pages/user/barber/publicProfile.js`, `frontend/src/pages/user/barber/BarberPublicProfile.jsx`
- `frontend/test/publicProfile.test.js`, `backend/test/socialRoutes.unit.test.js`
- `.github/workflows/v55-verify.yml` — v157 source-only audit dependency o‘rnatilishidan oldin

**Keyingi yo‘l:** haqiqiy `npm ci` bilan backend regressiya suite, authenticated/guest Chrome E2E, approved/unapproved PostgreSQL profil scenariylari, mobil xarita va bot eventlar tekshiruvi; keyin qolgan qarorlar.
