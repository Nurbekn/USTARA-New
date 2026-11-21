# USTARA v60 — 185 qaror auditi

- Qaror CSV asl SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — **o‘zgarmagan**.
- 185 ta kelishuv **inventari**; 185 ta funksiyaning hammasi ishga tushgan degani emas. Oldingi reyestrda 130 verification talab qilgan, 47 partial, 7 deferred/cancelled, 1 ochiq #175 bor.
- 42 forward SQL migratsiya saqlangan; 2 rollback helper SQL mavjud. v60 yangi migratsiya qo‘shmagan.
- `audit-phase1.js` va `v45-decision-integrity.js`: **offline PASS**. DB va real browser testini tasdiqlamaydi.
- QR 1–120 daqiqalik admin muddati, OTP kirish ekranida 1:00, Smart Booking 5+2m avvalgi qarorlariga tegilmadi.
