# USTARA — 185 qaror auditi v45

- Qabul qilingan qarorlar manbasi: `docs/USTARA_185_NAZORAT.csv`.
- SHA256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (**v44 bilan aynan bir xil**).
- **185** raqamli qaror, lekin bu **185 ta yakunlangan funksiya** degani emas.
- Holatlar: **130 tekshiruv kerak**, **47 qisman**, **7 bekor yoki keyinga qoldirilgan**, **1 ochiq (#175)**.
- `backend/scripts/v45-decision-integrity.js` bilan manbani noto'g'ri yoki yashirin o'zgartirishdan himoya qiluvchi offline SHA tekshiruvi kiritildi. Qabul qilingan qaror faqat foydalanuvchi bilan yangidan kelishilgandan keyin ongli ravishda o'zgartiriladi.
- **42** forward migration saqlandi; real PG, Telegram va mobil browser E2E **NOT_RUN**, v45 production-ready EMAS.
