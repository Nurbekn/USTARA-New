# USTARA v58 — 185 qaror auditi

- Qarorlar CSV SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — **byte-for-byte saqlandi**.
- **185 ta** qaror; oldingi hisobotga ko‘ra 130 tasi hali tekshirish talab qiladi, 47 qisman, 7 keyinga qoldirilgan/bekor, 1 ochiq (#175). Barcha 185 funksiyaning tayyorligi tasdiqlanmagan.
- **42 ta** amaldagi forward PostgreSQL migratsiya, 2 ta rollback yordamchi SQL fayli mavjud; v58 migratsiyani o‘zgartirmaydi.
- `audit-phase1.js` va `v45-decision-integrity.js`: **offline PASS**. Real database, Telegram, mobil E2E emas.
