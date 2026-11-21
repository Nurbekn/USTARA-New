# USTARA — oxirgi checkpoint v51 (2026-11-19)

**Asos:** `USTARA-4-Bosqich-QR-Identity-Clock-v50.zip` (705 fayl). **Yangi manba:** `USTARA-4-Bosqich-QR-Consent-Boundaries-v51.zip`. 4-bosqich hali tugamadi; production-ready EMAS.

## v51: 5 ta yaxshilanish
1. QR navbatga kirish: `requestJoin` barber advisory-lock kutganidan keyin ham QR expiry'ni PostgreSQL vaqtida qayta tekshiradi. Qulf kutayotganda eskirgan token 410 beradi, yozuv yaratmaydi.
2. QR tasdiqlash: 30 daqiqalik deadline oxirgi `UPDATE ... RETURNING` shartida atomar tekshiriladi; 0 row bo'lsa 410 va tranzaksiya to'liq `ROLLBACK` bo'ladi.
3. QR guest status: kechagi `waiting/called` hozirgi faol navbat sifatida ko'rinmaydi, eski obuna flaglari ham yashiriladi. Tarixiy terminal holatlar saqlanadi.
4. Telegram offer consent: takroriy `enabled:true` eski consent epoch'ni saqlaydi (`COALESCE`); `false` -> `true` yangi consent epoch. Eski tugmalarni qayta faollashtirishga ruxsat yo'q.
5. QR origin: `CORS_ALLOWED_ORIGINS` sozlangan muhitlarda, jumladan staging'da, QR havolasi faqat allowlist'dagi HTTPS/localhost origin uchun chiqariladi. Production'da allowlist majburiy.

**Kod:** `backend/controllers/walkinQrController.js`, `backend/services/queueTelegramNotifications.js`. Yangi: `backend/test/v51QrConsentBoundaries.unit.test.js`; tegishli oldingi fixture/mocklar moslangan. 42 forward migration, 185 qaror CSV (SHA-256 saqlangan) o'zgarmagan.

## QA holati
- v51 tegishli backend testlar: **26/26 PASS**; 5 yangi test **5/5 PASS**.
- Backend to'liq: **405 PASS / 26 FAIL** (yetishmayotgan `express`, `pg`, `bcrypt`, `jsonwebtoken`); bu **full PASS emas**.
- Frontend node:test: **178/178 PASS**. Vite build: **FAIL / vite: not found**.
- Real PostgreSQL test: **NOT_RUN**, `v49-staging` ruxsatsiz ishlashni 1 kodi bilan rad etdi; Telegram sandbox API va mobil browser E2E **NOT_RUN**.
- Offline audit: `185 qaror / 42 migratsiya` PASS. Original qaror CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.

**Keyingi:** deps o'rnatish mumkin bo'lgan test muhiti va maxsus `ustara_test_db` ochilgach real expiry-lock race, consent epoch, webhook va mobil QR E2E sinovi. Staging testni ishlatmasdan turib release qilmang.

**Xavfsizlik:** ZIP ichida `.env`, token, password, `node_modules`, `dist` bo'lmaydi. v50 baza fayllari yo'qotilmasin.
