# USTARA v101 — 185 qaror holati

- Asl `docs/USTARA_185_NAZORAT.csv`: 185 ta, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`. **Asl fayl o‘zgarmagan.**
- #105 — "Bekor qilishdan keyin muqobil vaqtlari": v101 frontend va mavjud read-only availability API bilan ishlaydigan muqobil vaqt tavsiyalari yaratildi. Server tomonidan bekor qilish tasdig‘i shart. Real mobil browser/PostgreSQL E2E hali kerak. **QISMAN BAJARILGAN**, yopilmagan.
- 44 forward migratsiya + 2 rollback SQL **o‘zgarmagan**. Yangi SQL migratsiya kerak bo‘lmadi.
- Offline struktura va qarorlar yaxlitligi PASS. Bu **185 ta funksiya to‘liq bajarilgan** degani emas.
- Qolgan 185 qarorlar tarixiy `holat` maydonlari o‘zgartirilmadi; original CSVni avtomatik ravishda "bajarildi"ga aylantirmadik.
